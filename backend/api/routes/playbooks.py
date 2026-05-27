"""
Playbook routes — CRUD for playbooks and triggering runs.

A Playbook is the form-based alternative to the canvas Workflow: the user writes
a natural-language supervisor prompt, picks a set of agents, and the backend uses
create_supervisor from langgraph-supervisor to route between them at runtime.

Endpoints:
  GET    /playbooks           — list all playbooks
  POST   /playbooks           — create a playbook
  GET    /playbooks/{id}      — get a single playbook
  PUT    /playbooks/{id}      — update a playbook
  DELETE /playbooks/{id}      — delete a playbook
  POST   /playbooks/{id}/run  — trigger a run for this playbook
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from db import get_db
from models import Playbook, Agent

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class PlaybookCreate(BaseModel):
    name: str
    description: str = ""
    playbook_text: str
    agent_ids: list[str] = []
    supervisor_model: str = "gpt-5.4-mini-2026-03-17"
    trigger_type: str = "manual"
    schedule_cron: str | None = None
    telegram_config: dict = {}


class PlaybookUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    playbook_text: str | None = None
    agent_ids: list[str] | None = None
    supervisor_model: str | None = None
    trigger_type: str | None = None
    schedule_cron: str | None = None
    telegram_config: dict | None = None


class PlaybookRunRequest(BaseModel):
    input_text: str = ""
    trigger: str = "manual"


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def _pb_out(pb: Playbook) -> dict:
    return {
        "id": str(pb.id),
        "name": pb.name,
        "description": pb.description or "",
        "playbook_text": pb.playbook_text,
        "agent_ids": pb.agent_ids or [],
        "supervisor_model": pb.supervisor_model,
        "trigger_type": pb.trigger_type,
        "schedule_cron": pb.schedule_cron,
        "telegram_config": pb.telegram_config or {},
        "is_live": pb.is_live or False,
        "created_at": pb.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_playbooks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playbook).order_by(Playbook.created_at.desc()))
    return [_pb_out(pb) for pb in result.scalars().all()]


@router.post("", status_code=201)
async def create_playbook(payload: PlaybookCreate, db: AsyncSession = Depends(get_db)):
    pb = Playbook(
        name=payload.name,
        description=payload.description,
        playbook_text=payload.playbook_text,
        agent_ids=payload.agent_ids,
        supervisor_model=payload.supervisor_model,
        trigger_type=payload.trigger_type,
        schedule_cron=payload.schedule_cron,
        telegram_config=payload.telegram_config,
    )
    db.add(pb)
    await db.commit()
    await db.refresh(pb)
    logger.info("Playbook created: id=%s name=%s", pb.id, pb.name)
    return _pb_out(pb)


@router.get("/{playbook_id}")
async def get_playbook(playbook_id: str, db: AsyncSession = Depends(get_db)):
    pb = await db.get(Playbook, uuid.UUID(playbook_id))
    if not pb:
        raise HTTPException(404, "Playbook not found")
    return _pb_out(pb)


@router.put("/{playbook_id}")
async def update_playbook(playbook_id: str, payload: PlaybookUpdate, db: AsyncSession = Depends(get_db)):
    pb = await db.get(Playbook, uuid.UUID(playbook_id))
    if not pb:
        raise HTTPException(404, "Playbook not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(pb, field, value)
    await db.commit()
    await db.refresh(pb)
    logger.info("Playbook updated: id=%s", playbook_id)
    return _pb_out(pb)


@router.delete("/{playbook_id}", status_code=204)
async def delete_playbook(playbook_id: str, db: AsyncSession = Depends(get_db)):
    pb = await db.get(Playbook, uuid.UUID(playbook_id))
    if not pb:
        raise HTTPException(404, "Playbook not found")
    await db.delete(pb)
    await db.commit()
    logger.info("Playbook deleted: id=%s", playbook_id)


@router.post("/{playbook_id}/deploy")
async def deploy_playbook(playbook_id: str, db: AsyncSession = Depends(get_db)):
    """Set the playbook as live. Auto-registers Telegram webhook if trigger_type=telegram."""
    pb = await db.get(Playbook, uuid.UUID(playbook_id))
    if not pb:
        raise HTTPException(404, "Playbook not found")
    pb.is_live = True
    await db.commit()
    await db.refresh(pb)
    logger.info("Playbook deployed (live): id=%s name=%s", pb.id, pb.name)
    return _pb_out(pb)


@router.post("/{playbook_id}/stop")
async def stop_playbook(playbook_id: str, db: AsyncSession = Depends(get_db)):
    """Take the playbook offline — chat messages will be blocked until redeployed."""
    pb = await db.get(Playbook, uuid.UUID(playbook_id))
    if not pb:
        raise HTTPException(404, "Playbook not found")
    pb.is_live = False
    await db.commit()
    await db.refresh(pb)
    logger.info("Playbook stopped (offline): id=%s name=%s", pb.id, pb.name)
    return _pb_out(pb)


@router.post("/{playbook_id}/run", status_code=200)
async def run_playbook(playbook_id: str, payload: PlaybookRunRequest, db: AsyncSession = Depends(get_db)):
    """Test-invoke a playbook synchronously. No Run record is created — purely ephemeral."""
    pb = await db.get(Playbook, uuid.UUID(playbook_id))
    if not pb:
        raise HTTPException(404, "Playbook not found")

    agent_uuids = [uuid.UUID(aid) for aid in (pb.agent_ids or [])]
    agents: list[Agent] = []
    for agent_id in agent_uuids:
        q = await db.execute(
            select(Agent)
            .options(selectinload(Agent.tools))
            .where(Agent.id == agent_id)
        )
        agent = q.scalar_one_or_none()
        if agent:
            agents.append(agent)

    if not agents:
        raise HTTPException(400, "Playbook has no valid agents")

    from runtime.sync_runner import run_playbook_sync
    try:
        result = await run_playbook_sync(pb, agents, payload.input_text, f"test-{playbook_id}")
    except Exception as exc:
        logger.exception("Playbook test failed: playbook=%s", pb.name)
        raise HTTPException(500, str(exc))

    logger.info("Playbook test done: playbook=%s tokens=%d", pb.name, result["tokens"])
    return {"output": result["output"], "trace": result["trace"], "tokens": result["tokens"]}
