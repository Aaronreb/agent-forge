"""
Run routes — create and inspect workflow execution runs.

A Run is created when a user (or scheduler/Telegram) triggers a workflow.
The actual execution is dispatched as an asyncio Task so the HTTP response
returns immediately with a 'pending' run record.

Endpoints:
  GET  /runs                    — list last 100 runs with workflow name + token stats
  POST /runs                    — create a run and start execution in the background
  GET  /runs/{id}               — fetch a single run with token/cost totals
  GET  /runs/{id}/messages      — raw messages persisted during the run
  GET  /runs/{id}/steps         — messages grouped by agent as an execution timeline
  POST /runs/{id}/cancel        — cancel an in-flight run
"""
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from db import get_db
from models import Run, Message, Workflow, Playbook, Agent

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class RunCreate(BaseModel):
    """Payload for triggering a new workflow run."""
    workflow_id: str
    input_text: str = ""
    trigger: str = "manual"   # manual | telegram | schedule
    is_test: bool = False


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def _duration(run: Run) -> float | None:
    """Return run wall-clock duration in seconds, or None if still running."""
    if run.finished_at and run.started_at:
        return (run.finished_at - run.started_at).total_seconds()
    return None


def _run_out(run: Run, workflow_name: str | None = None, tokens: int = 0, cost: float = 0.0) -> dict:
    """Serialise a Run ORM object to a dict, optionally including aggregated stats."""
    wf_id = str(run.workflow_id) if run.workflow_id else None
    pb_id = str(run.playbook_id) if run.playbook_id else None
    ag_id = str(run.agent_id) if run.agent_id else None
    return {
        "id": str(run.id),
        "workflow_id": wf_id,
        "playbook_id": pb_id,
        "agent_id": ag_id,
        "workflow_name": workflow_name or wf_id or pb_id or ag_id or "unknown",
        "trigger": run.trigger,
        "status": run.status,
        "input_text": run.input_text,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "duration_seconds": _duration(run),
        "tokens_used": tokens,
        "cost_usd": cost,
        "langsmith_url": run.langsmith_url,
    }


def _msg_out(msg: Message) -> dict:
    """Serialise a Message ORM object to a dict."""
    return {
        "id": str(msg.id),
        "run_id": str(msg.run_id),
        "from_agent_id": str(msg.from_agent_id) if msg.from_agent_id else None,
        "to_agent_id": str(msg.to_agent_id) if msg.to_agent_id else None,
        "role": msg.role,
        "content": msg.content,
        "tokens_used": msg.tokens_used,
        "cost_usd": msg.cost_usd,
        "created_at": msg.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_runs(db: AsyncSession = Depends(get_db)):
    """
    Return the 100 most recent runs ordered by start time descending.

    Joins workflow names and aggregates per-run token/cost totals from the
    messages table in a single round-trip using GROUP BY.
    """
    logger.debug("Listing runs")
    runs_result = await db.execute(select(Run).where(Run.is_test == False).order_by(Run.started_at.desc()).limit(100))
    runs = runs_result.scalars().all()

    if not runs:
        return []

    run_ids = [r.id for r in runs]
    workflow_ids = list({r.workflow_id for r in runs if r.workflow_id is not None})
    playbook_ids = list({r.playbook_id for r in runs if r.playbook_id is not None})
    agent_ids = list({r.agent_id for r in runs if r.agent_id is not None})

    wf_names: dict = {}
    if workflow_ids:
        wf_result = await db.execute(select(Workflow).where(Workflow.id.in_(workflow_ids)))
        wf_names = {w.id: w.name for w in wf_result.scalars().all()}

    pb_names: dict = {}
    if playbook_ids:
        pb_result = await db.execute(select(Playbook).where(Playbook.id.in_(playbook_ids)))
        pb_names = {p.id: p.name for p in pb_result.scalars().all()}

    ag_names: dict = {}
    if agent_ids:
        ag_result = await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))
        ag_names = {a.id: a.name for a in ag_result.scalars().all()}

    tokens_result = await db.execute(
        select(Message.run_id, func.sum(Message.tokens_used), func.sum(Message.cost_usd))
        .where(Message.run_id.in_(run_ids))
        .group_by(Message.run_id)
    )
    stats = {row[0]: (int(row[1] or 0), float(row[2] or 0.0)) for row in tokens_result}

    def _name(r: Run) -> str | None:
        if r.workflow_id:
            return wf_names.get(r.workflow_id)
        if r.playbook_id:
            return pb_names.get(r.playbook_id)
        if r.agent_id:
            return ag_names.get(r.agent_id)
        return None

    logger.debug("Returning %d run(s)", len(runs))
    return [_run_out(r, _name(r), *stats.get(r.id, (0, 0.0))) for r in runs]


@router.post("", status_code=201)
async def create_run(payload: RunCreate, db: AsyncSession = Depends(get_db)):
    """
    Create a new run record and immediately dispatch workflow execution as an asyncio Task.

    Returns the run with status='pending'. The client should poll GET /runs/{id}
    or subscribe to the WebSocket stream at /ws/logs?run_id={id} for live updates.
    """
    logger.info("Creating run: workflow_id=%s trigger=%s input_len=%d",
                payload.workflow_id, payload.trigger, len(payload.input_text))

    run = Run(
        workflow_id=uuid.UUID(payload.workflow_id),
        input_text=payload.input_text,
        trigger=payload.trigger,
        is_test=payload.is_test,
        status="pending",
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    logger.info("Run created: id=%s — dispatching async task", run.id)
    from runtime.coordinator import start_workflow_task
    start_workflow_task(str(run.id), payload.input_text)

    return _run_out(run)


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """
    Cancel an in-flight run.

    If the asyncio Task is still running it is cancelled immediately; the
    coordinator catches CancelledError and marks the run 'cancelled'. If the
    task has already finished the run status is updated directly in the DB.
    """
    logger.info("Cancel requested for run id=%s", run_id)
    run = await db.get(Run, uuid.UUID(run_id))
    if not run:
        logger.warning("Run id=%s not found for cancel", run_id)
        raise HTTPException(404, "Run not found")

    if run.status not in ("pending", "running"):
        raise HTTPException(400, f"Run is already {run.status}")

    from runtime.coordinator import cancel_run as _cancel
    task_cancelled = _cancel(run_id)

    if not task_cancelled:
        # Task already finished between status check and cancel call — update DB directly
        run.status = "cancelled"
        run.finished_at = datetime.utcnow()
        await db.commit()
        logger.info("Run id=%s marked cancelled (task already done)", run_id)

    return {"status": "cancelling"}


@router.get("/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch a single run by UUID with its workflow name and aggregated token/cost totals."""
    logger.debug("Fetching run id=%s", run_id)
    run = await db.get(Run, uuid.UUID(run_id))
    if not run:
        logger.warning("Run id=%s not found", run_id)
        raise HTTPException(404, "Run not found")

    name: str | None = None
    if run.workflow_id:
        wf = await db.get(Workflow, run.workflow_id)
        name = wf.name if wf else None
    elif run.playbook_id:
        pb = await db.get(Playbook, run.playbook_id)
        name = pb.name if pb else None

    tokens_result = await db.execute(
        select(func.sum(Message.tokens_used), func.sum(Message.cost_usd))
        .where(Message.run_id == run.id)
    )
    row = tokens_result.one()
    return _run_out(run, name, int(row[0] or 0), float(row[1] or 0.0))


@router.get("/{run_id}/messages")
async def get_run_messages(run_id: str, db: AsyncSession = Depends(get_db)):
    """Return all messages persisted for a run, ordered chronologically."""
    logger.debug("Fetching messages for run id=%s", run_id)
    result = await db.execute(
        select(Message).where(Message.run_id == uuid.UUID(run_id)).order_by(Message.created_at)
    )
    messages = result.scalars().all()
    logger.debug("Found %d message(s) for run id=%s", len(messages), run_id)
    return [_msg_out(m) for m in messages]


@router.get("/{run_id}/steps")
async def get_run_steps(run_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return the run's messages grouped by agent as an execution timeline.

    Each entry in the returned list represents one agent's contribution,
    containing its messages, total tokens, cost, and start/finish timestamps.
    Used by the UI's execution timeline view.
    """
    logger.debug("Fetching steps for run id=%s", run_id)
    run = await db.get(Run, uuid.UUID(run_id))
    if not run:
        logger.warning("Run id=%s not found for steps", run_id)
        raise HTTPException(404, "Run not found")

    result = await db.execute(
        select(Message)
        .where(Message.run_id == uuid.UUID(run_id))
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()

    # Group messages by from_agent_id to build per-agent execution steps
    steps: dict[str, dict] = {}
    for msg in messages:
        key = str(msg.from_agent_id) if msg.from_agent_id else "user"
        if key not in steps:
            steps[key] = {
                "agent_id": str(msg.from_agent_id) if msg.from_agent_id else None,
                "role": msg.role,
                "messages": [],
                "tokens": 0,
                "cost_usd": 0.0,
                "started_at": msg.created_at.isoformat(),
            }
        steps[key]["messages"].append({"role": msg.role, "content": msg.content})
        steps[key]["tokens"] += msg.tokens_used
        steps[key]["cost_usd"] += msg.cost_usd
        steps[key]["finished_at"] = msg.created_at.isoformat()

    logger.debug("Returning %d step(s) for run id=%s", len(steps), run_id)
    return list(steps.values())
