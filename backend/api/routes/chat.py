"""
Chat routes — persistent multi-turn conversation via LangGraph checkpointing.

POST /chat/send          — send a message; runs synchronously, returns output + trace
GET  /chat/sessions      — list all sessions for a source (by distinct thread_id)
GET  /chat/session/{id}  — full conversation history for one session

source_type values: "playbook" | "agent"
"""
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from db import get_db
from models import Run, Message, Playbook, Workflow, Agent

logger = logging.getLogger(__name__)
router = APIRouter()

_COST_PER_TOKEN = 0.0000004



class ChatSendRequest(BaseModel):
    source_type: str       # "playbook" | "agent"
    source_id: str         # UUID of the Playbook or Agent
    message: str
    session_id: str | None = None  # client-generated UUID; if omitted, source_id is used


@router.post("/send", status_code=201)
async def chat_send(payload: ChatSendRequest, db: AsyncSession = Depends(get_db)):
    """
    Dispatch a single chat message to a live playbook or agent.

    thread_id = session_id (if provided) or source_id — used as the LangGraph
    checkpoint key so all messages in one session share conversation history.
    """
    source_id = uuid.UUID(payload.source_id)
    thread_id = payload.session_id or payload.source_id

    if payload.source_type == "playbook":
        source = await db.get(Playbook, source_id)
        if not source:
            raise HTTPException(404, "Playbook not found")
        if not source.is_live:
            raise HTTPException(400, "Playbook is not live — deploy it first")

        run = Run(playbook_id=source.id, thread_id=thread_id, input_text=payload.message, trigger="chat", status="running")
        db.add(run)
        await db.commit()
        await db.refresh(run)

        agent_uuids = [uuid.UUID(aid) for aid in (source.agent_ids or [])]
        agents: list[Agent] = []
        for aid in agent_uuids:
            q = await db.execute(select(Agent).options(selectinload(Agent.tools)).where(Agent.id == aid))
            a = q.scalar_one_or_none()
            if a:
                agents.append(a)

        if not agents:
            run.status = "failed"
            run.finished_at = datetime.utcnow()
            await db.commit()
            raise HTTPException(400, "Playbook has no valid agents")

        from runtime.sync_runner import run_playbook_sync
        try:
            result = await run_playbook_sync(source, agents, payload.message, thread_id, run_id=str(run.id))
        except Exception as exc:
            logger.exception("Chat run failed: run_id=%s", run.id)
            run.status = "failed"
            run.finished_at = datetime.utcnow()
            await db.commit()
            raise HTTPException(500, str(exc))

        source_name = source.name

    elif payload.source_type == "agent":
        result_q = await db.execute(
            select(Agent).options(selectinload(Agent.tools)).where(Agent.id == source_id)
        )
        agent = result_q.scalar_one_or_none()
        if not agent:
            raise HTTPException(404, "Agent not found")
        if not agent.is_live:
            raise HTTPException(400, "Agent is not live — deploy it first")

        run = Run(agent_id=source_id, thread_id=thread_id, input_text=payload.message, trigger="chat", status="running")
        db.add(run)
        await db.commit()
        await db.refresh(run)

        from runtime.sync_runner import run_agent_sync
        try:
            result = await run_agent_sync(agent, payload.message, thread_id, run_id=str(run.id))
        except Exception as exc:
            logger.exception("Agent chat run failed: run_id=%s", run.id)
            run.status = "failed"
            run.finished_at = datetime.utcnow()
            await db.commit()
            raise HTTPException(500, str(exc))

        source_name = agent.name

    elif payload.source_type == "workflow":
        workflow = await db.get(Workflow, source_id)
        if not workflow:
            raise HTTPException(404, "Workflow not found")
        if not workflow.is_live:
            raise HTTPException(400, "Workflow is not live — deploy it first")

        run = Run(
            workflow_id=source_id,
            thread_id=thread_id,
            input_text=payload.message,
            trigger="chat",
            status="pending",
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        from runtime.coordinator import execute_workflow
        try:
            output = await execute_workflow(str(run.id), payload.message, thread_id=thread_id)
        except Exception as exc:
            logger.exception("Workflow chat run failed: run_id=%s", run.id)
            raise HTTPException(500, str(exc))

        return {"run_id": str(run.id), "output": output or "", "trace": [], "tokens": 0}

    else:
        raise HTTPException(400, f"Unsupported source_type '{payload.source_type}'")

    tokens = result["tokens"]
    cost = round(tokens * _COST_PER_TOKEN, 7)
    if result["output"]:
        db.add(Message(run_id=run.id, role="assistant", content=result["output"], tokens_used=tokens, cost_usd=cost))
    run.status = "done"
    run.finished_at = datetime.utcnow()
    run.langsmith_url = result.get("langsmith_url")
    run.trace = result.get("trace") or []
    await db.commit()

    logger.info("Chat run done: run_id=%s source=%s session=%s tokens=%d cost=$%.6f",
                run.id, source_name, thread_id, tokens, cost)

    return {"run_id": str(run.id), "output": result["output"], "trace": result["trace"], "tokens": result["tokens"]}


@router.get("/sessions")
async def list_sessions(source_type: str, source_id: str, db: AsyncSession = Depends(get_db)):
    """Return all distinct chat sessions (thread_ids) for a source, ordered newest first."""
    src_uuid = uuid.UUID(source_id)

    if source_type == "playbook":
        filter_col = Run.playbook_id
    elif source_type == "workflow":
        filter_col = Run.workflow_id
    elif source_type == "agent":
        filter_col = Run.agent_id
    else:
        raise HTTPException(400, f"Unknown source_type '{source_type}'")

    result = await db.execute(
        select(
            Run.thread_id,
            func.min(Run.started_at).label("started_at"),
            func.max(Run.started_at).label("last_at"),
            func.count().label("run_count"),
            func.min(Run.input_text).label("first_message"),
        )
        .where(filter_col == src_uuid, Run.thread_id.isnot(None))
        .group_by(Run.thread_id)
        .order_by(func.max(Run.started_at).desc())
    )
    rows = result.all()
    return [
        {
            "session_id": r.thread_id,
            "started_at": r.started_at.isoformat(),
            "last_at": r.last_at.isoformat(),
            "run_count": r.run_count,
            "first_message": (r.first_message or "")[:80],
        }
        for r in rows
    ]


@router.get("/session/{session_id}/messages")
async def get_session_messages(session_id: str, db: AsyncSession = Depends(get_db)):
    """Return the full conversation for a session as a flat list sorted chronologically."""
    result = await db.execute(
        select(Run).options(selectinload(Run.messages)).where(Run.thread_id == session_id).order_by(Run.started_at)
    )
    runs = result.scalars().all()

    conversation = []
    for run in runs:
        conversation.append({"role": "user", "content": run.input_text, "run_id": str(run.id), "created_at": run.started_at.isoformat()})
        for msg in sorted(run.messages, key=lambda m: m.created_at):
            if msg.role in ("assistant", "ai"):
                conversation.append({"role": "assistant", "content": msg.content, "run_id": str(run.id), "created_at": msg.created_at.isoformat()})

    return conversation
