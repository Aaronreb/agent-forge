"""
Playbook executor — loads a Playbook record, builds a create_supervisor graph from
its agent list, and runs it end-to-end, persisting messages and publishing WebSocket events.

A Playbook is the simpler alternative to a Workflow: instead of manually wiring
nodes and edges, the user writes a natural-language supervisor prompt and picks
which agents to include. create_supervisor from langgraph-supervisor then handles
all routing at runtime based on that prompt.
"""
import asyncio
import logging
import uuid
from datetime import datetime

from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent
from langgraph_supervisor import create_supervisor

from db import AsyncSessionLocal
from models import Run, Message, Playbook, Agent
from agents.builder import _get_llm, compile_agent, mcp_tools_context
from runtime.event_stream import publish_event
from runtime.memory import CHECKPOINTER
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models import Tool

logger = logging.getLogger(__name__)


def _build_subagent(agent: Agent, tools: list):
    """Compile a named ReAct sub-agent for use inside create_supervisor."""
    llm = _get_llm(agent.model)
    system_prompt = agent.system_prompt or f"You are {agent.name}, a helpful {agent.role}."
    return create_react_agent(
        model=llm,
        tools=tools,
        prompt=system_prompt,
        name=agent.name,
    )


async def execute_playbook(run_id: str, input_text: str, thread_id: str | None = None):
    """
    Execute a playbook run end-to-end.

    Steps:
      1. Load Run, set status to 'running'.
      2. Load Playbook + all agents listed in playbook.agent_ids.
      3. Compile each agent as a named ReAct graph.
      4. Build supervisor graph via create_supervisor with playbook_text as prompt.
      5. Publish 'run_start' event, invoke graph, persist messages.
      6. Set run status to 'done', publish 'run_done'.

    CancelledError → status 'cancelled'. Any other exception → status 'failed'.

    Args:
        thread_id: LangGraph checkpoint thread ID. If provided, conversation history
                   is retained across calls with the same thread_id (persistent sessions).
    """
    logger.info("Starting playbook execution: run_id=%s input_len=%d", run_id, len(input_text))

    async with AsyncSessionLocal() as db:
        run = await db.get(Run, uuid.UUID(run_id))
        if not run:
            logger.error("Run id=%s not found — aborting", run_id)
            return

        run.status = "running"
        await db.commit()

        try:
            playbook = await db.get(Playbook, run.playbook_id)
            if not playbook:
                raise ValueError(f"Playbook id={run.playbook_id} not found")

            logger.info("Loaded playbook: name=%s agents=%d", playbook.name, len(playbook.agent_ids or []))

            agent_uuids = [uuid.UUID(aid) for aid in (playbook.agent_ids or [])]
            agents: list[Agent] = []
            for agent_id in agent_uuids:
                result = await db.execute(
                    select(Agent)
                    .options(
                        selectinload(Agent.tools).selectinload(Tool.mcp_server),
                        selectinload(Agent.channels),
                    )
                    .where(Agent.id == agent_id)
                )
                agent = result.scalar_one_or_none()
                if agent:
                    agents.append(agent)
                    logger.debug("Loaded agent: id=%s name=%s", agent_id, agent.name)
                else:
                    logger.warning("Agent id=%s not found — skipping", agent_id)

            if not agents:
                raise ValueError("Playbook has no valid agents")

            agent_name_set = {a.name for a in agents}
            final_messages: list = []
            trace_events: list = []
            agent_tokens: dict[str, int] = {}
            langsmith_root_run_id: str | None = None

            async def _emit(ev: dict) -> None:
                trace_events.append(ev)
                await publish_event(run_id, ev)

            async with mcp_tools_context(agents, db) as tools_by_agent_id:
                subagents = [
                    _build_subagent(a, tools_by_agent_id.get(str(a.id), []))
                    for a in agents
                ]
                supervisor_llm = _get_llm(playbook.supervisor_model or "gpt-4o")

                compiled = create_supervisor(
                    subagents,
                    model=supervisor_llm,
                    prompt=playbook.playbook_text or "",
                ).compile(checkpointer=CHECKPOINTER)

                logger.debug("Supervisor compiled for run id=%s (%d agents)", run_id, len(subagents))

                await publish_event(run_id, {"type": "run_start", "run_id": run_id, "input": input_text})

                cfg = {
                    "configurable": {"thread_id": thread_id or run_id},
                    "run_id": uuid.UUID(run_id),
                    "run_name": f"playbook:{playbook.name}",
                }
                async for event in compiled.astream_events(
                {"messages": [HumanMessage(content=input_text)]},
                config=cfg,
                version="v2",
            ):
                etype = event["event"]
                ename = event["name"]
                edata = event.get("data", {})
                meta = event.get("metadata", {})

                if langsmith_root_run_id is None and etype == "on_chain_start":
                    if not event.get("parent_ids"):
                        langsmith_root_run_id = event.get("run_id")

                # Collect final state — last on_chain_end with messages wins (top-level graph)
                if etype == "on_chain_end":
                    out = edata.get("output", {})
                    if isinstance(out, dict) and "messages" in out:
                        final_messages = out["messages"]

                # LLM call completed — captures token usage for every model call (supervisor + sub-agents)
                if etype == "on_chat_model_end":
                    output_msg = edata.get("output")
                    usage = getattr(output_msg, "usage_metadata", None) or {}
                    if not isinstance(usage, dict):
                        usage = {}
                    total = int(usage.get("total_tokens", 0) or 0)
                    inp = int(usage.get("input_tokens", 0) or 0)
                    out_t = int(usage.get("output_tokens", 0) or 0)
                    # langgraph_node tells us which graph node this LLM call belongs to
                    node = meta.get("langgraph_node", ename or "supervisor")
                    if node:
                        agent_tokens[node] = agent_tokens.get(node, 0) + total
                    await _emit({
                        "type": "llm_step",
                        "agent": node,
                        "tokens": total,
                        "input_tokens": inp,
                        "output_tokens": out_t,
                    })

                # Agent lifecycle
                if etype == "on_chain_start" and ename in agent_name_set:
                    await _emit({"type": "agent_start", "agent": ename})

                if etype == "on_chain_end" and ename in agent_name_set:
                    await _emit({
                        "type": "agent_done",
                        "agent": ename,
                        "tokens": agent_tokens.get(ename, 0),
                    })

                # Routing decisions — supervisor calls transfer_to_<AgentName> tools
                if etype == "on_tool_start" and ename.startswith("transfer_to_"):
                    await _emit({
                        "type": "routing",
                        "to": ename[len("transfer_to_"):],
                    })

                # Real tool calls (not handoff tools)
                if etype == "on_tool_start" and not ename.startswith("transfer_to_"):
                    await _emit({
                        "type": "tool_call",
                        "tool": ename,
                        "agent": meta.get("langgraph_node", ""),
                        "input": str(edata.get("input", ""))[:300],
                    })

                if etype == "on_tool_end" and not ename.startswith("transfer_to_"):
                    await _emit({
                        "type": "tool_result",
                        "tool": ename,
                        "agent": meta.get("langgraph_node", ""),
                        "output": str(edata.get("output", ""))[:300],
                    })

            logger.info("Playbook execution complete: run_id=%s", run_id)

            msg_count = 0
            for msg in final_messages:
                role = getattr(msg, "type", "assistant")
                content = msg.content if isinstance(msg.content, str) else str(msg.content)
                db.add(Message(run_id=run.id, role=role, content=content))
                msg_count += 1
            await db.commit()
            logger.debug("Persisted %d message(s) for run id=%s", msg_count, run_id)

            run.status = "done"
            run.finished_at = datetime.utcnow()
            from runtime.coordinator import _get_langsmith_url
            run.langsmith_url = _get_langsmith_url()
            run.trace = trace_events
            await db.commit()
            logger.info("Playbook run id=%s completed successfully", run_id)

            output = ""
            if final_messages:
                last = final_messages[-1]
                output = last.content if isinstance(last.content, str) else str(last.content)

            total_tokens = sum(agent_tokens.values())
            await publish_event(run_id, {
                "type": "run_done",
                "run_id": run_id,
                "output": output,
                "tokens": total_tokens,
            })
            return output

        except asyncio.CancelledError:
            logger.info("Playbook run id=%s was cancelled", run_id)
            run.status = "cancelled"
            run.finished_at = datetime.utcnow()
            await db.commit()
            await publish_event(run_id, {"type": "run_cancelled", "run_id": run_id})
            raise

        except Exception as exc:
            logger.exception("Playbook run id=%s failed: %s", run_id, exc)
            run.status = "failed"
            run.finished_at = datetime.utcnow()
            await db.commit()
            await publish_event(run_id, {"type": "run_error", "run_id": run_id, "error": str(exc)})
            raise
