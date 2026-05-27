"""
Agent graph builder.

Converts an Agent ORM record into a compiled LangGraph ReAct agent that can
be invoked directly or embedded as a node inside a multi-agent workflow graph.
"""
import logging

from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel

from agents.tools import TOOL_REGISTRY
from models import Agent
from config import settings

logger = logging.getLogger(__name__)


def _get_llm(model: str) -> BaseChatModel:
    """
    Return the appropriate LangChain chat model for the given model string.

    Model selection rules:
      - Strings starting with 'claude' → ChatAnthropic
      - Everything else               → ChatOpenAI (covers gpt-*, o1-*, etc.)
    """
    if model.startswith("claude"):
        logger.debug("Using ChatAnthropic for model=%s", model)
        return ChatAnthropic(model=model, api_key=settings.anthropic_api_key)
    logger.debug("Using ChatOpenAI for model=%s", model)
    return ChatOpenAI(model=model, api_key=settings.openai_api_key)


def build_agent_graph(agent: Agent):
    """
    Compile a LangGraph create_react_agent graph from an Agent DB record.

    Steps:
      1. Resolve each of the agent's tool names against TOOL_REGISTRY to get
         the actual callable tool objects. Unknown tool names are skipped with
         a warning so a missing tool doesn't crash the entire agent.
      2. Instantiate the LLM via `_get_llm`.
      3. Use the agent's system_prompt as the state_modifier. Falls back to a
         sensible default if the prompt is empty.
      4. Return the compiled graph — ready for `await graph.ainvoke(...)`.

    Returns:
        A compiled LangGraph StateGraph (create_react_agent output).
    """
    tools = []
    for t in agent.tools:
        if t.name in TOOL_REGISTRY:
            tools.append(TOOL_REGISTRY[t.name])
        else:
            logger.warning("Tool '%s' not found in TOOL_REGISTRY — skipping for agent=%s",
                           t.name, agent.name)

    logger.debug("Building agent graph: name=%s model=%s tools=%s",
                 agent.name, agent.model, [t.name for t in agent.tools])

    llm = _get_llm(agent.model)
    system_prompt = agent.system_prompt or f"You are {agent.name}, a helpful {agent.role}."

    compiled = create_react_agent(
        model=llm,
        tools=tools,
        prompt=system_prompt,
    )

    logger.debug("Agent graph compiled for agent=%s (%d tool(s))", agent.name, len(tools))
    return compiled
