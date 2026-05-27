"""
Runtime coordinator — loads a workflow and its agents from the DB, builds the
LangGraph StateGraph, executes it, and persists all messages.

This is the core execution engine. It is called via `start_workflow_task` from
POST /runs so the HTTP response returns immediately while the workflow runs
asynchronously. In-flight runs can be cancelled via `cancel_run`.
"""
import asyncio
import logging
import uuid
from datetime import datetime

from langchain_core.messages import HumanMessage

from config import settings
from db import AsyncSessionLocal
from models import Run, Workflow, Agent, Message
from runtime.workflow_builder import build_workflow_graph
from runtime.event_stream import publish_event
from sqlalchemy import select
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

# Maps run_id → running asyncio Task so we can cancel in-flight runs.
_RUNNING_TASKS: dict[str, asyncio.Task] = {}


def _get_langsmith_url() -> str | None:
    """Return the LangSmith project URL if tracing is enabled, otherwise None."""
    if settings.langchain_tracing_v2.lower() != "true" or not settings.langchain_api_key:
        return None
    project = settings.langchain_project or "agentplatform"
    return f"https://smith.langchain.com/projects/p?name={project}"


def start_workflow_task(run_id: str, input_text: str, thread_id: str | None = None) -> asyncio.Task:
    """
    Wrap execute_workflow in an asyncio Task, register it for cancellation,
    and return the task immediately (non-blocking).
    """
    task = asyncio.create_task(execute_workflow(run_id, input_text, thread_id=thread_id))
    _RUNNING_TASKS[run_id] = task
    task.add_done_callback(lambda _: _RUNNING_TASKS.pop(run_id, None))
    logger.debug("Workflow task created: run_id=%s", run_id)
    return task


def start_playbook_task(run_id: str, input_text: str, thread_id: str | None = None) -> asyncio.Task:
    """Wrap execute_playbook in an asyncio Task and return immediately."""
    from runtime.playbook_runner import execute_playbook
    task = asyncio.create_task(execute_playbook(run_id, input_text, thread_id=thread_id))
    _RUNNING_TASKS[run_id] = task
    task.add_done_callback(lambda _: _RUNNING_TASKS.pop(run_id, None))
    logger.debug("Playbook task created: run_id=%s", run_id)
    return task


def cancel_run(run_id: str) -> bool:
    """Cancel an in-flight run. Returns True if cancelled, False if not found."""
    task = _RUNNING_TASKS.get(run_id)
    if task and not task.done():
        task.cancel()
        logger.info("Cancellation requested: run_id=%s", run_id)
        return True
    return False


async def execute_workflow(run_id: str, input_text: str, thread_id: str | None = None):
    """
    Execute a workflow run end-to-end.

    Steps:
      1. Load the Run record and set status to 'running'.
      2. Load the Workflow (nodes and edges are JSONB on the record itself).
      3. Load the Agent (with tools) for every compiled_agent node.
      4. Build the LangGraph StateGraph via build_workflow_graph.
      5. Invoke the compiled graph and persist all output messages.
      6. Set run status to 'done'.
    """
    logger.info("Starting workflow execution: run_id=%s input_len=%d", run_id, len(input_text))

    async with AsyncSessionLocal() as db:
        run = await db.get(Run, uuid.UUID(run_id))
        if not run:
            logger.error("Run id=%s not found — aborting", run_id)
            return

        run.status = "running"
        await db.commit()

        try:
            # Load workflow — nodes and edges live directly on the record
            workflow = await db.get(Workflow, run.workflow_id)
            if not workflow or not workflow.nodes:
                raise ValueError(f"Workflow id={run.workflow_id} has no nodes")

            logger.info("Loaded workflow: name=%s nodes=%d edges=%d",
                        workflow.name, len(workflow.nodes), len(workflow.edges))

            # Load agents for compiled_agent nodes in a single pass
            agents_by_node: dict[str, Agent] = {}
            for node in workflow.nodes:
                if node.get("type") != "compiled_agent":
                    continue
                agent_db_id = node.get("config", {}).get("agent_db_id")
                if not agent_db_id:
                    continue
                result = await db.execute(
                    select(Agent)
                    .options(selectinload(Agent.tools), selectinload(Agent.channels))
                    .where(Agent.id == uuid.UUID(agent_db_id))
                )
                agent = result.scalar_one_or_none()
                if agent:
                    agents_by_node[node["id"]] = agent
                    logger.debug("Loaded agent: node_id=%s agent=%s", node["id"], agent.name)
                else:
                    logger.warning("No agent found for agent_db_id=%s — node will be skipped", agent_db_id)

            compiled = await build_workflow_graph(workflow, agents_by_node, run_id)

            await publish_event(run_id, {"type": "run_start", "run_id": run_id, "input": input_text})

            cfg = {
                "configurable": {"thread_id": thread_id or run_id},
                "run_id": uuid.UUID(run_id),
                "run_name": f"workflow:{workflow.name}",
            }
            final_state = await compiled.ainvoke(
                {
                    "messages": [HumanMessage(content=input_text)],
                    "run_id": run_id,
                    "current_agent_id": "",
                    "final_output": "",
                    "route_to": "",
                },
                config=cfg,
            )
            logger.info("Graph execution complete: run_id=%s", run_id)

            _COST_PER_TOKEN = 0.0000004
            msg_count = 0
            for msg in final_state.get("messages", []):
                role = getattr(msg, "type", "assistant")
                content = msg.content if isinstance(msg.content, str) else str(msg.content)
                usage = getattr(msg, "usage_metadata", None) or {}
                tokens = usage.get("total_tokens", 0) if isinstance(usage, dict) else 0
                cost = round(tokens * _COST_PER_TOKEN, 7)
                db.add(Message(run_id=run.id, role=role, content=content,
                               tokens_used=tokens, cost_usd=cost))
                msg_count += 1
            await db.commit()
            logger.debug("Persisted %d message(s) for run_id=%s", msg_count, run_id)

            run.status = "done"
            run.finished_at = datetime.utcnow()
            run.langsmith_url = _get_langsmith_url()
            await db.commit()
            logger.info("Run %s completed", run_id)

            await publish_event(run_id, {
                "type": "run_done",
                "run_id": run_id,
                "output": final_state.get("final_output", ""),
            })

            return final_state.get("final_output", "")

        except asyncio.CancelledError:
            logger.info("Run %s cancelled", run_id)
            run.status = "cancelled"
            run.finished_at = datetime.utcnow()
            await db.commit()
            await publish_event(run_id, {"type": "run_cancelled", "run_id": run_id})
            raise

        except Exception as exc:
            logger.exception("Run %s failed: %s", run_id, exc)
            run.status = "failed"
            run.finished_at = datetime.utcnow()
            await db.commit()
            await publish_event(run_id, {"type": "run_error", "run_id": run_id, "error": str(exc)})
            raise
