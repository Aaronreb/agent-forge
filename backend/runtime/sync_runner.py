"""
Synchronous playbook runner — builds a create_supervisor graph and calls ainvoke().
Returns output, execution trace, and token count extracted from the message list.

No background tasks, no WebSocket, no Redis. The HTTP handler awaits this directly
and returns output + trace in the same HTTP response.
"""
import logging
import re

from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent
from langgraph_supervisor import create_supervisor

from agents.builder import _get_llm, compile_agent, mcp_tools_context
from runtime.memory import CHECKPOINTER

logger = logging.getLogger(__name__)


def _safe_name(name: str) -> str:
    """Sanitize agent name to match OpenAI's ^[^\s<|\\/>]+$ pattern.
    Spaces and invalid chars become underscores."""
    sanitized = re.sub(r'[\s<|\\/>]+', '_', name).strip('_')
    return sanitized or "agent"


def _get_tool_calls(msg) -> list[dict]:
    """Return tool_calls as plain dicts, handling both:
    - Modern langchain_core: msg.tool_calls → list[ToolCall]
    - Older format: msg.additional_kwargs['tool_calls'] → OpenAI wire format
    """
    tc = list(getattr(msg, "tool_calls", None) or [])
    if not tc:
        raw = (getattr(msg, "additional_kwargs", {}) or {}).get("tool_calls") or []
        tc = [
            {"name": t.get("function", {}).get("name", ""), "args": {}, "id": t.get("id", "")}
            for t in raw if t.get("function", {}).get("name")
        ]
    # Normalize ToolCall objects → plain dicts
    result = []
    for t in tc:
        if isinstance(t, dict):
            result.append(t)
        else:
            result.append({"name": getattr(t, "name", ""), "args": getattr(t, "args", {}), "id": getattr(t, "id", "")})
    return result


async def run_agent_sync(agent, message: str, session_id: str, run_id: str | None = None) -> dict:
    """Run a single agent directly (no supervisor). Returns {output, trace, tokens, langsmith_url}."""
    async with mcp_tools_context([agent]) as tools_by_agent_id:
        tools = tools_by_agent_id.get(str(agent.id), [])
        graph = create_react_agent(
            model=_get_llm(agent.model),
            tools=tools,
            prompt=agent.system_prompt or f"You are {agent.name}, a helpful {agent.role}.",
            checkpointer=CHECKPOINTER,
        )

        config = {"configurable": {"thread_id": session_id}}
        prior_count = 0
        try:
            prior_state = await graph.aget_state(config)
            if prior_state and prior_state.values:
                prior_count = len(prior_state.values.get("messages", []))
        except Exception:
            prior_count = 0

        logger.info("Invoking agent directly: agent=%s session=%s prior_msgs=%d", agent.name, session_id, prior_count)

        result = await graph.ainvoke(
            {"messages": [HumanMessage(content=message)]},
            config=config,
        )
        print("AGENT RESULT:", result)

        all_msgs = result.get("messages", [])
        new_msgs = all_msgs[prior_count:] if prior_count < len(all_msgs) else all_msgs
        if not new_msgs:
            new_msgs = all_msgs

    output, trace = _extract_output_and_trace(new_msgs)
    total_tokens = sum(
        int((getattr(m, "usage_metadata", None) or {}).get("total_tokens", 0) or 0)
        for m in new_msgs
    )
    trace.append({"type": "run_done", "output": output[:120], "tokens": total_tokens})

    from runtime.coordinator import _get_langsmith_url
    return {"output": output, "trace": trace, "tokens": total_tokens, "langsmith_url": _get_langsmith_url()}


async def run_playbook_sync(playbook, agents: list, message: str, session_id: str, run_id: str | None = None) -> dict:
    """Build supervisor graph and invoke it. Returns {output, trace, tokens, langsmith_url}."""
    async with mcp_tools_context(agents) as tools_by_agent_id:
        subagents = []
        for a in agents:
            tools = tools_by_agent_id.get(str(a.id), [])
            subagents.append(create_react_agent(
                model=_get_llm(a.model),
                tools=tools,
                prompt=a.system_prompt or f"You are {a.name}, a helpful {a.role}.",
                name=_safe_name(a.name),
            ))

        supervisor_llm = _get_llm(playbook.supervisor_model or "gpt-5.4-mini-2026-03-17")
        app = create_supervisor(
            subagents,
            model=supervisor_llm,
            prompt=playbook.playbook_text or "",
        ).compile(checkpointer=CHECKPOINTER)

        config = {"configurable": {"thread_id": session_id}}

        prior_count = 0
        try:
            prior_state = await app.aget_state(config)
            if prior_state and prior_state.values:
                prior_count = len(prior_state.values.get("messages", []))
        except Exception:
            prior_count = 0

        logger.info("Invoking supervisor: playbook=%s agents=%d session=%s prior_msgs=%d",
                    playbook.name, len(subagents), session_id, prior_count)

        result = await app.ainvoke(
            {"messages": [HumanMessage(content=message)]},
            config=config,
        )
        print("RESULT:", result)

        all_msgs = result.get("messages", [])
        new_msgs = all_msgs[prior_count:] if prior_count < len(all_msgs) else all_msgs
        if not new_msgs:
            new_msgs = all_msgs

        logger.info("Invocation complete: session=%s total=%d new=%d",
                    session_id, len(all_msgs), len(new_msgs))
        for i, m in enumerate(new_msgs):
            tcs = _get_tool_calls(m)
            logger.debug("  msg[%d] type=%-6s name=%-20s tool_calls=%s content_len=%d",
                         i, m.type,
                         getattr(m, "name", None) or "-",
                         [t["name"] for t in tcs],
                         len(str(m.content or "")))

    output, trace = _extract_output_and_trace(new_msgs)
    total_tokens = sum(
        int((getattr(m, "usage_metadata", None) or {}).get("total_tokens", 0) or 0)
        for m in new_msgs
    )
    trace.append({"type": "run_done", "output": output[:120], "tokens": total_tokens})

    logger.info("Trace built: session=%s events=%d tokens=%d", session_id, len(trace), total_tokens)

    from runtime.coordinator import _get_langsmith_url
    return {"output": output, "trace": trace, "tokens": total_tokens, "langsmith_url": _get_langsmith_url()}


def _extract_output_and_trace(messages: list) -> tuple[str, list]:
    """Walk new messages from ainvoke and build output + trace."""
    trace: list = []
    output = ""
    last_agent_name = "supervisor"

    for msg in messages:
        logger.info(
            "MSG type=%-6s name=%-20s content_len=%d tool_calls=%s",
            msg.type,
            getattr(msg, "name", None) or "-",
            len(str(msg.content or "")),
            [t.get("name", "") for t in _get_tool_calls(msg)],
        )
        if msg.type == "ai":
            usage = getattr(msg, "usage_metadata", None) or {}
            tokens = int(usage.get("total_tokens", 0) or 0)
            inp = int(usage.get("input_tokens", 0) or 0)
            out = int(usage.get("output_tokens", 0) or 0)
            name = getattr(msg, "name", "") or "supervisor"
            last_agent_name = name

            tool_calls = _get_tool_calls(msg)

            for tc in tool_calls:
                tc_name = tc.get("name", "") or ""
                if tc_name.startswith("transfer_to_"):
                    trace.append({"type": "routing", "to": tc_name[len("transfer_to_"):], "from": name})
                elif tc_name and tc_name != "transfer_back_to_supervisor":
                    trace.append({
                        "type": "tool_call",
                        "tool": tc_name,
                        "agent": name,
                        "input": str(tc.get("args", ""))[:300],
                    })

            # Only skip agent_done if ALL tool_calls are routing/handoff
            is_routing_only = bool(tool_calls) and all(
                (tc.get("name", "").startswith("transfer_to_") or tc.get("name") == "transfer_back_to_supervisor")
                for tc in tool_calls
            )

            content = msg.content or ""
            if isinstance(content, list):
                content = " ".join(str(c.get("text", c) if isinstance(c, dict) else c) for c in content)

            if content and not is_routing_only:
                trace.append({
                    "type": "agent_done",
                    "agent": name,
                    "tokens": tokens,
                    "input_tokens": inp,
                    "output_tokens": out,
                    "content": str(content)[:200],
                })
                # Prefer sub-agent output over supervisor's closing wrap-up.
                # Use supervisor content only if no sub-agent has replied yet.
                if name != "supervisor":
                    output = str(content)
                elif not output:
                    output = str(content)

        elif msg.type == "tool":
            tool_name = getattr(msg, "name", "") or ""
            if not tool_name.startswith("transfer_"):
                content = msg.content or ""
                if isinstance(content, list):
                    content = str(content[0]) if content else ""
                trace.append({
                    "type": "tool_result",
                    "tool": tool_name,
                    "agent": last_agent_name,
                    "output": str(content)[:300],
                })

    return output, trace
