"""
Agent graph builder.

Provides two primitives:
  - mcp_tools_context(agents, db): async context manager that opens MCP connections
    and yields {agent_id: [LangChain tools]} for all agents. Connections stay open
    for the lifetime of the context so tool calls succeed during execution.
  - compile_agent(agent, tools): pure sync function that wraps create_react_agent
    with the given pre-loaded tool list.

The old build_agent_graph() is replaced by these two so that:
  1. All MCP client sessions are opened once per run (not per agent).
  2. The compiled graph receives live tool objects bound to the open session.
"""
import logging
from contextlib import asynccontextmanager

from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel

from models import Agent, MCPServer
from config import settings

logger = logging.getLogger(__name__)


def _get_llm(model: str) -> BaseChatModel:
    if model.startswith("claude"):
        logger.debug("Using ChatAnthropic for model=%s", model)
        return ChatAnthropic(model=model, api_key=settings.anthropic_api_key)
    logger.debug("Using ChatOpenAI for model=%s", model)
    return ChatOpenAI(model=model, api_key=settings.openai_api_key)


def compile_agent(agent: Agent, tools: list):
    """
    Compile a LangGraph create_react_agent from an Agent ORM record and a
    pre-loaded list of LangChain tool objects.

    Returns the compiled graph ready for ainvoke / astream_events.
    """
    llm = _get_llm(agent.model)
    system_prompt = agent.system_prompt or f"You are {agent.name}, a helpful {agent.role}."
    logger.debug("Compiling agent: name=%s model=%s tools=%s",
                 agent.name, agent.model, [t.name for t in tools])
    return create_react_agent(model=llm, tools=tools, prompt=system_prompt)


@asynccontextmanager
async def mcp_tools_context(agents: list[Agent], db=None):
    """
    Async context manager that opens MCP client connections for all unique
    MCP servers referenced by the given agents' tools, then yields a mapping
    of {str(agent.id): [LangChain BaseTool]} for the caller to use when
    compiling agent graphs.

    The MCP connections remain open for the lifetime of the context so that
    tool invocations during the run can succeed.

    Usage:
        async with mcp_tools_context([agent1, agent2], db) as tools_map:
            graph1 = compile_agent(agent1, tools_map[str(agent1.id)])
            graph2 = compile_agent(agent2, tools_map[str(agent2.id)])
            ...
    """
    # Collect all unique MCP servers needed across agents
    # agent.tools is a list of Tool ORM objects with .mcp_server and .tool_key
    server_map: dict[str, MCPServer] = {}  # str(server.id) -> MCPServer
    for agent in agents:
        for tool in agent.tools:
            if tool.mcp_server and tool.tool_key:
                sid = str(tool.mcp_server.id)
                if sid not in server_map:
                    server_map[sid] = tool.mcp_server

    if not server_map:
        # No MCP tools — yield empty lists for all agents
        yield {str(a.id): [] for a in agents}
        return

    # Build MultiServerMCPClient config
    server_configs = {}
    for sid, server in server_map.items():
        server_configs[sid] = {
            "url": server.url.rstrip("/") + "/mcp",
            "transport": "streamable_http",
            "headers": {"X-API-Key": server.api_key},
        }

    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient
    except ImportError:
        logger.error("langchain_mcp_adapters not installed — yielding empty tool lists")
        yield {str(a.id): [] for a in agents}
        return

    mcp_client = MultiServerMCPClient(server_configs)
    all_tools = await mcp_client.get_tools()
    tools_by_key = {t.name: t for t in all_tools}
    logger.debug("MCP tools loaded: %s", list(tools_by_key.keys()))

    result: dict[str, list] = {}
    for agent in agents:
        agent_tools = []
        for tool in agent.tools:
            if tool.tool_key and tool.tool_key in tools_by_key:
                agent_tools.append(tools_by_key[tool.tool_key])
            elif tool.tool_key:
                logger.warning("Tool key '%s' not found in MCP server — skipping", tool.tool_key)
        result[str(agent.id)] = agent_tools

    yield result
