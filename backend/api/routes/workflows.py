"""
Workflow routes — CRUD for multi-agent workflows.

A workflow stores its graph topology as two JSONB arrays directly on the
workflows table — no separate node/edge tables needed.

Endpoints:
  GET    /workflows          — list all workflows
  POST   /workflows          — create a workflow
  GET    /workflows/{id}     — get a single workflow
  PUT    /workflows/{id}     — update a workflow
  DELETE /workflows/{id}     — permanently delete a workflow
  POST   /workflows/{id}/deploy — set is_live = True
  POST   /workflows/{id}/stop  — set is_live = False
"""
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from db import get_db
from models import Workflow

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

class WorkflowSave(BaseModel):
    name: str
    description: str = ""
    nodes: list[dict] = []
    edges: list[dict] = []


# ---------------------------------------------------------------------------
# Serialisation helper
# ---------------------------------------------------------------------------

def _wf_out(wf: Workflow) -> dict:
    return {
        "id": str(wf.id),
        "name": wf.name,
        "description": wf.description,
        "is_live": wf.is_live or False,
        "nodes": wf.nodes or [],
        "edges": wf.edges or [],
        "created_at": wf.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_workflows(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workflow))
    return [_wf_out(w) for w in result.scalars().all()]


@router.post("", status_code=201)
async def create_workflow(payload: WorkflowSave, db: AsyncSession = Depends(get_db)):
    logger.info("Creating workflow: name=%s nodes=%d edges=%d",
                payload.name, len(payload.nodes), len(payload.edges))
    wf = Workflow(
        name=payload.name,
        description=payload.description,
        nodes=payload.nodes,
        edges=payload.edges,
    )
    db.add(wf)
    await db.commit()
    await db.refresh(wf)
    logger.info("Workflow created: id=%s", wf.id)
    return _wf_out(wf)


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    wf = await db.get(Workflow, uuid.UUID(workflow_id))
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return _wf_out(wf)


@router.put("/{workflow_id}")
async def update_workflow(workflow_id: str, payload: WorkflowSave, db: AsyncSession = Depends(get_db)):
    logger.info("Updating workflow: id=%s", workflow_id)
    wf = await db.get(Workflow, uuid.UUID(workflow_id))
    if not wf:
        raise HTTPException(404, "Workflow not found")
    wf.name = payload.name
    wf.description = payload.description
    wf.nodes = payload.nodes
    wf.edges = payload.edges
    wf.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(wf)
    logger.info("Workflow updated: id=%s", wf.id)
    return _wf_out(wf)


@router.post("/{workflow_id}/deploy")
async def deploy_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    wf = await db.get(Workflow, uuid.UUID(workflow_id))
    if not wf:
        raise HTTPException(404, "Workflow not found")
    wf.is_live = True
    await db.commit()
    await db.refresh(wf)
    logger.info("Workflow deployed: id=%s", wf.id)
    return _wf_out(wf)


@router.post("/{workflow_id}/stop")
async def stop_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    wf = await db.get(Workflow, uuid.UUID(workflow_id))
    if not wf:
        raise HTTPException(404, "Workflow not found")
    wf.is_live = False
    await db.commit()
    await db.refresh(wf)
    logger.info("Workflow stopped: id=%s", wf.id)
    return _wf_out(wf)


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    logger.info("Deleting workflow: id=%s", workflow_id)
    wf = await db.get(Workflow, uuid.UUID(workflow_id))
    if not wf:
        raise HTTPException(404, "Workflow not found")
    await db.delete(wf)
    await db.commit()
