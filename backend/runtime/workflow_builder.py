"""
Builds a multi-agent LangGraph StateGraph from a Workflow DB record.

Node types (workflow.nodes JSONB):
  trigger        → pass-through entry wired from START
  compiled_agent → ReAct agent loaded from DB by config.agent_db_id
  router_prompt  → LLM router that sets route_to for conditional dispatch
  end            → pass-through terminal wired to END

Edge types (workflow.edges JSONB):
  { source, target }  → all edges; router outbound targets resolved by label
"""
import logging

from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict, Annotated

from langchain_core.messages import SystemMessage, HumanMessage as LCHumanMessage

from models import Workflow, Agent
from agents.builder import compile_agent, _get_llm
from agents.guardrails import check_input, check_output

logger = logging.getLogger(__name__)


def _last(a: str, b: str) -> str:
    return b


class WorkflowState(TypedDict):
    """Shared state passed between all nodes in the workflow graph."""
    messages: Annotated[list, add_messages]
    current_agent_id: Annotated[str, _last]
    run_id: str
    final_output: Annotated[str, _last]
    route_to: Annotated[str, _last]  # populated by router_prompt nodes; consumed by conditional edges


def _node_fn(agent: Agent, node_id: str, run_id_holder: list, tools: list):
    """Return an async node function that runs a single compiled agent."""
    compiled = compile_agent(agent, tools)
    logger.debug("Node fn built: agent=%s node=%s tools=%d", agent.name, node_id, len(tools))

    async def _run(state: WorkflowState) -> dict:
        from runtime.event_stream import publish_event

        run_id = state.get("run_id", "")
        last_human = next(
            (m.content for m in reversed(state["messages"]) if hasattr(m, "type") and m.type == "human"),
            "",
        )

        violation = check_input(agent, last_human)
        if violation:
            err = f"[{agent.name}] Guardrail blocked: {violation}"
            logger.warning("Input guardrail: agent=%s run_id=%s", agent.name, run_id)
            await publish_event(run_id, {"type": "guardrail", "agent": agent.name,
                                         "content": err, "run_id": run_id})
            return {"messages": [], "final_output": err, "current_agent_id": str(agent.id), "route_to": ""}

        effective_prompt = agent.system_prompt or f"You are {agent.name}, a helpful {agent.role}."
        logger.info(
            "Agent starting: agent=%s run_id=%s\n  system_prompt: %s\n  messages (%d):\n%s",
            agent.name, run_id,
            effective_prompt,
            len(state["messages"]),
            "\n".join(f"    [{getattr(m, 'type', type(m).__name__)}] {str(getattr(m, 'content', m))[:300]}"
                      for m in state["messages"]),
        )
        await publish_event(run_id, {"type": "agent_start", "agent": agent.name,
                                      "agent_id": str(agent.id), "run_id": run_id})

        output_msgs: list = []
        async for event in compiled.astream_events(
            {"messages": state["messages"]},
            config={"configurable": {"thread_id": f"{run_id}-{node_id}"}},
            version="v2",
        ):
            etype = event["event"]
            ename = event["name"]
            edata = event.get("data", {})

            if etype == "on_chain_end":
                out = edata.get("output", {})
                if isinstance(out, dict) and "messages" in out:
                    output_msgs = out["messages"]
            elif etype == "on_tool_start":
                await publish_event(run_id, {
                    "type": "tool_call", "agent": agent.name,
                    "tool": ename, "input": str(edata.get("input", ""))[:300], "run_id": run_id,
                })
            elif etype == "on_tool_end":
                await publish_event(run_id, {
                    "type": "tool_result", "agent": agent.name,
                    "tool": ename, "output": str(edata.get("output", ""))[:300], "run_id": run_id,
                })

        final_text = output_msgs[-1].content if output_msgs else ""
        final_text = check_output(agent, final_text)

        tokens = 0
        for m in output_msgs:
            usage = getattr(m, "usage_metadata", None) or {}
            tokens += usage.get("total_tokens", 0) if isinstance(usage, dict) else 0

        logger.info("Agent done: agent=%s run_id=%s tokens=%d", agent.name, run_id, tokens)
        await publish_event(run_id, {
            "type": "agent_done", "agent": agent.name, "agent_id": str(agent.id),
            "content": final_text, "tokens": tokens, "run_id": run_id,
        })

        return {"messages": output_msgs, "final_output": final_text,
                "current_agent_id": str(agent.id), "route_to": ""}

    return _run


def _router_node_fn(node_config: dict, node_id: str, routes: dict[str, str]):
    """
    Return an async router node that calls the LLM and sets state["route_to"].

    routes maps agent label → target node_id. The LLM is instructed to output
    exactly one of the label keys. The conditional edge dispatcher reads route_to
    to select the next node.
    """
    labels = list(routes.keys())
    routing_prompt = (
        node_config.get("routing_prompt")
        or "Based on the conversation, decide which agent should handle the request next."
    )
    router_model = node_config.get("router_model", "gpt-4o-mini")
    routes_str = ", ".join(labels)

    system_prompt = (
        f"{routing_prompt}\n\n"
        f"CRITICAL: Reply with exactly one of these agent names: {routes_str}. "
        f"No other text, markdown, or explanation."
    )

    async def _run(state: WorkflowState) -> dict:
        from runtime.event_stream import publish_event

        run_id = state.get("run_id", "")
        prior_output = state.get("final_output") or next(
            (m.content for m in reversed(state["messages"]) if hasattr(m, "type") and m.type == "human"),
            "No prior context.",
        )

        await publish_event(run_id, {"type": "router_start", "node_id": node_id, "run_id": run_id})

        logger.info(
            "Router invoking: node=%s run_id=%s\n  system_prompt: %s\n  input: %s",
            node_id, run_id,
            system_prompt,
            prior_output[:500],
        )
        llm = _get_llm(router_model)
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            LCHumanMessage(content=prior_output),
        ])
        decision = (response.content if hasattr(response, "content") else str(response)).strip()

        if decision not in labels and labels:
            logger.warning("Router %s got unexpected decision '%s', using first route", node_id, decision)
            decision = labels[0]

        logger.info("Router decision: node=%s decision=%s", node_id, decision)
        await publish_event(run_id, {"type": "router_done", "node_id": node_id,
                                      "decision": decision, "run_id": run_id})
        return {"messages": [], "route_to": decision}

    return _run


async def build_workflow_graph(
    workflow: Workflow,
    agents_by_node: dict[str, Agent],
    run_id: str,
    tools_by_agent_id: dict[str, list] | None = None,
):
    """
    Compile a multi-agent LangGraph StateGraph from workflow.nodes and workflow.edges JSONB.

    Args:
        workflow:        Workflow ORM object; nodes and edges are JSONB lists.
        agents_by_node:  node_id → Agent (for compiled_agent nodes only).
        run_id:          Parent Run UUID string.

    Returns:
        Compiled LangGraph StateGraph ready for ainvoke().
    """
    nodes_data: list[dict] = workflow.nodes or []
    edges_data: list[dict] = workflow.edges or []

    logger.info("Building workflow graph: workflow=%s nodes=%d edges=%d",
                workflow.name, len(nodes_data), len(edges_data))

    graph = StateGraph(WorkflowState)

    # Build node_id → display name map so LangSmith shows agent names instead of UUIDs.
    # compiled_agent nodes use the agent's name; structural nodes use their type.
    node_id_to_key: dict[str, str] = {}
    _used: set[str] = set()
    for node in nodes_data:
        nid = node["id"]
        ntype = node.get("type", "compiled_agent")
        agent = agents_by_node.get(nid)
        if ntype == "compiled_agent" and agent:
            base = agent.name.replace(" ", "_")
        elif ntype == "trigger":
            base = "trigger"
        elif ntype == "end":
            base = "end"
        elif ntype == "router_prompt":
            base = node.get("config", {}).get("label", "router").replace(" ", "_")
        else:
            base = nid
        key, suffix = base, 1
        while key in _used:
            key = f"{base}_{suffix}"
            suffix += 1
        _used.add(key)
        node_id_to_key[nid] = key

    def _key(node_id: str) -> str:
        return node_id_to_key.get(node_id, node_id)

    # Fast lookups built before any graph construction
    nodes_by_id: dict[str, dict] = {n["id"]: n for n in nodes_data}
    router_node_ids_pre: set[str] = {n["id"] for n in nodes_data if n.get("type") == "router_prompt"}

    start_node_key: str | None = None
    end_node_keys: set[str] = set()
    router_node_ids: set[str] = set()

    # Pre-collect outbound label→display_key routes per router source node.
    # Labels come from target compiled_agent config.label; end nodes are excluded.
    router_routes: dict[str, dict[str, str]] = {}  # source_display_key → {label: target_display_key}
    for edge in edges_data:
        src = edge["source"]
        if src not in router_node_ids_pre:
            continue
        tgt_id = edge["target"]
        tgt_node = nodes_by_id.get(tgt_id, {})
        if tgt_node.get("type") == "end":
            continue
        label = tgt_node.get("config", {}).get("label") or _key(tgt_id)
        router_routes.setdefault(_key(src), {})[label] = _key(tgt_id)

    # Register graph nodes
    for node in nodes_data:
        node_key = _key(node["id"])
        node_id = node["id"]
        node_type = node.get("type", "compiled_agent")
        cfg = node.get("config", {})

        if node_type == "trigger":
            async def _trigger(state: WorkflowState) -> dict:
                return {}
            graph.add_node(node_key, _trigger)
            start_node_key = node_key
            logger.debug("Trigger node: %s", node_key)

        elif node_type == "end":
            async def _end(state: WorkflowState) -> dict:
                return {}
            graph.add_node(node_key, _end)
            end_node_keys.add(node_key)
            logger.debug("End node: %s", node_key)

        elif node_type == "router_prompt":
            routes = router_routes.get(node_key, {})
            graph.add_node(node_key, _router_node_fn(cfg, node_key, routes))
            router_node_ids.add(node_key)
            logger.debug("Router node: %s routes=%s", node_key, list(routes.keys()))

        else:  # compiled_agent
            agent = agents_by_node.get(node_id)
            if not agent:
                logger.warning("No agent for node_key=%s — skipping", node_key)
                continue
            agent_tools = (tools_by_agent_id or {}).get(str(agent.id), [])
            graph.add_node(node_key, _node_fn(agent, node_id, [run_id], agent_tools))
            logger.debug("Agent node: %s agent=%s", node_key, agent.name)

    # Wire START → trigger (fallback to first node if no trigger type)
    if not start_node_key:
        if nodes_data:
            start_node_key = _key(nodes_data[0]["id"])
        else:
            raise ValueError("Workflow has no nodes")
    graph.add_edge(START, start_node_key)

    # Wire end nodes directly to LangGraph END
    for nk in end_node_keys:
        graph.add_edge(nk, END)

    # Build adjacency map using display keys: source → [target, ...]
    adjacency: dict[str, list[str]] = {}
    for edge in edges_data:
        adjacency.setdefault(_key(edge["source"]), []).append(_key(edge["target"]))

    # Terminal nodes: no outbound edges and not already wired as end nodes
    terminal_keys = {_key(n["id"]) for n in nodes_data} - set(adjacency.keys()) - end_node_keys

    # Wire edges
    for src, targets in adjacency.items():
        if src in router_node_ids:
            # Conditional dispatch: route_to label → target display key
            routes = router_routes.get(src, {})
            if routes:
                def make_dispatch(rm: dict):
                    def _dispatch(state: WorkflowState) -> str:
                        label = state.get("route_to", "")
                        return label if label in rm else END
                    return _dispatch
                graph.add_conditional_edges(src, make_dispatch(routes), routes)
                logger.debug("Conditional edges from router %s: %s", src, list(routes.keys()))
            else:
                for tgt in targets:
                    graph.add_edge(src, tgt)
        else:
            for tgt in targets:
                graph.add_edge(src, tgt)
                logger.debug("Direct edge: %s → %s", src, tgt)

    # Wire remaining terminal nodes to END
    for nk in terminal_keys:
        graph.add_edge(nk, END)
        logger.debug("Terminal node wired to END: %s", nk)

    from runtime.memory import CHECKPOINTER
    compiled = graph.compile(checkpointer=CHECKPOINTER)
    logger.info("Workflow graph compiled: workflow=%s run_id=%s", workflow.name, run_id)
    return compiled
