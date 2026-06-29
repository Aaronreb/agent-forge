"""
Agent routes — CRUD for agents, tool/channel listing, and single-agent test execution.

Endpoints:
  GET    /agents                  — list all agents
  POST   /agents                  — create an agent
  GET    /agents/{id}             — get a single agent
  PUT    /agents/{id}             — update an agent
  DELETE /agents/{id}             — delete an agent
  POST   /agents/{id}/test        — run agent against a test message and return full trace
  GET    /agents/tools/list       — list all registered tools
  GET    /agents/channels/list    — list all configured channels
  POST   /agents/channels         — create a channel
"""
import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from db import get_db
from models import Agent, Tool, Channel
from sqlalchemy.orm import contains_eager

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class AgentCreate(BaseModel):
    """Fields accepted when creating a new agent."""
    name: str
    role: str = "assistant"
    system_prompt: str = ""
    model: str = "gpt-4o"
    memory_enabled: bool = False
    memory_window_k: int = 5
    guardrails: dict = {}
    schedule_cron: str | None = None
    tool_ids: list[str] = []
    channel_ids: list[str] = []
    emoji: str = "🤖"
    color: str = "purple"
    status: str = "idle"


class AgentUpdate(BaseModel):
    """Fields accepted when partially updating an agent. All fields are optional."""
    name: str | None = None
    role: str | None = None
    system_prompt: str | None = None
    model: str | None = None
    memory_enabled: bool | None = None
    memory_window_k: int | None = None
    guardrails: dict | None = None
    schedule_cron: str | None = None
    tool_ids: list[str] | None = None
    channel_ids: list[str] | None = None
    emoji: str | None = None
    color: str | None = None
    status: str | None = None


class AgentTestRequest(BaseModel):
    """Payload for the agent test endpoint."""
    message: str


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def _agent_out(agent: Agent) -> dict:
    """Serialise an Agent ORM object to a JSON-safe dict."""
    return {
        "id": str(agent.id),
        "name": agent.name,
        "role": agent.role,
        "system_prompt": agent.system_prompt,
        "model": agent.model,
        "memory_enabled": agent.memory_enabled,
        "memory_window_k": agent.memory_window_k,
        "guardrails": agent.guardrails,
        "schedule_cron": agent.schedule_cron,
        "emoji": agent.emoji,
        "color": agent.color,
        "status": agent.status,
        "is_live": agent.is_live,
        "tools": [{"id": str(t.id), "name": t.name, "description": t.description} for t in agent.tools],
        "channels": [{"id": str(c.id), "type": c.type, "config": c.config} for c in agent.channels],
        "created_at": agent.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_agents(db: AsyncSession = Depends(get_db)):
    """Return all agents with their associated tools and channels."""
    logger.debug("Listing all agents")
    result = await db.execute(
        select(Agent).options(selectinload(Agent.tools), selectinload(Agent.channels))
    )
    agents = result.scalars().all()
    logger.debug("Found %d agent(s)", len(agents))
    return [_agent_out(a) for a in agents]


@router.post("", status_code=201)
async def create_agent(payload: AgentCreate, db: AsyncSession = Depends(get_db)):
    """
    Create a new agent.

    Resolves tool_ids and channel_ids to their ORM objects before persisting.
    Unknown IDs are silently skipped.
    """
    logger.info("Creating agent: name=%s model=%s", payload.name, payload.model)

    tools = []
    for tid in payload.tool_ids:
        t = await db.get(Tool, uuid.UUID(tid))
        if t:
            tools.append(t)
        else:
            logger.warning("Tool id=%s not found, skipping", tid)

    channels = []
    for cid in payload.channel_ids:
        c = await db.get(Channel, uuid.UUID(cid))
        if c:
            channels.append(c)
        else:
            logger.warning("Channel id=%s not found, skipping", cid)

    agent = Agent(
        name=payload.name,
        role=payload.role,
        system_prompt=payload.system_prompt,
        model=payload.model,
        memory_enabled=payload.memory_enabled,
        memory_window_k=payload.memory_window_k,
        guardrails=payload.guardrails,
        schedule_cron=payload.schedule_cron,
        emoji=payload.emoji,
        color=payload.color,
        status=payload.status,
        tools=tools,
        channels=channels,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    result = await db.execute(
        select(Agent)
        .options(selectinload(Agent.tools), selectinload(Agent.channels))
        .where(Agent.id == agent.id)
    )
    created = result.scalar_one()
    logger.info("Agent created: id=%s name=%s", created.id, created.name)
    return _agent_out(created)


@router.get("/{agent_id}")
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch a single agent by UUID. Returns 404 if not found."""
    logger.debug("Fetching agent id=%s", agent_id)
    result = await db.execute(
        select(Agent)
        .options(selectinload(Agent.tools), selectinload(Agent.channels))
        .where(Agent.id == uuid.UUID(agent_id))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        logger.warning("Agent id=%s not found", agent_id)
        raise HTTPException(404, "Agent not found")
    return _agent_out(agent)


@router.put("/{agent_id}")
async def update_agent(agent_id: str, payload: AgentUpdate, db: AsyncSession = Depends(get_db)):
    """
    Update an existing agent.

    Only non-None fields in the payload are applied. When tool_ids or channel_ids
    are provided, the agent's relationships are fully replaced.
    """
    logger.info("Updating agent id=%s", agent_id)
    result = await db.execute(
        select(Agent)
        .options(selectinload(Agent.tools), selectinload(Agent.channels))
        .where(Agent.id == uuid.UUID(agent_id))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        logger.warning("Agent id=%s not found for update", agent_id)
        raise HTTPException(404, "Agent not found")

    for field in ("name", "role", "system_prompt", "model", "memory_enabled",
                  "memory_window_k", "guardrails", "schedule_cron", "emoji", "color", "status"):
        val = getattr(payload, field)
        if val is not None:
            setattr(agent, field, val)

    if payload.tool_ids is not None:
        agent.tools = [t for t in [await db.get(Tool, uuid.UUID(tid)) for tid in payload.tool_ids] if t]

    if payload.channel_ids is not None:
        agent.channels = [c for c in [await db.get(Channel, uuid.UUID(cid)) for cid in payload.channel_ids] if c]

    await db.commit()
    result = await db.execute(
        select(Agent)
        .options(selectinload(Agent.tools), selectinload(Agent.channels))
        .where(Agent.id == agent.id)
    )
    updated = result.scalar_one()
    logger.info("Agent updated: id=%s name=%s", updated.id, updated.name)
    return _agent_out(updated)


@router.post("/{agent_id}/deploy")
async def deploy_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Make the agent live — accessible from chat and Telegram."""
    agent = await db.get(Agent, uuid.UUID(agent_id))
    if not agent:
        raise HTTPException(404, "Agent not found")
    agent.is_live = True
    await db.commit()
    result = await db.execute(
        select(Agent).options(selectinload(Agent.tools), selectinload(Agent.channels)).where(Agent.id == agent.id)
    )
    logger.info("Agent deployed (live): id=%s name=%s", agent.id, agent.name)
    return _agent_out(result.scalar_one())


@router.post("/{agent_id}/stop")
async def stop_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Take the agent offline — chat and Telegram will not route to it."""
    agent = await db.get(Agent, uuid.UUID(agent_id))
    if not agent:
        raise HTTPException(404, "Agent not found")
    agent.is_live = False
    await db.commit()
    result = await db.execute(
        select(Agent).options(selectinload(Agent.tools), selectinload(Agent.channels)).where(Agent.id == agent.id)
    )
    logger.info("Agent stopped (offline): id=%s name=%s", agent.id, agent.name)
    return _agent_out(result.scalar_one())


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Permanently delete an agent. Returns 204 on success, 404 if not found."""
    logger.info("Deleting agent id=%s", agent_id)
    agent = await db.get(Agent, uuid.UUID(agent_id))
    if not agent:
        logger.warning("Agent id=%s not found for deletion", agent_id)
        raise HTTPException(404, "Agent not found")
    await db.delete(agent)
    await db.commit()
    logger.info("Agent id=%s deleted", agent_id)


@router.post("/{agent_id}/test")
async def test_agent(agent_id: str, payload: AgentTestRequest, db: AsyncSession = Depends(get_db)):
    """
    Run a single-agent ReAct loop against a test message and return the full trace.

    Loads the agent and its tools from the database, builds a LangGraph
    create_react_agent graph, invokes it synchronously, and returns:
      - output: final AI response text
      - messages: full message trace (human → tool calls → tool results → AI)
      - tokens_used: total token count from usage metadata
      - duration_seconds: wall-clock time of the invocation
    """
    logger.info("Test run requested: agent_id=%s message_len=%d", agent_id, len(payload.message))

    result = await db.execute(
        select(Agent)
        .options(
            selectinload(Agent.tools).selectinload(Tool.mcp_server),
            selectinload(Agent.channels),
        )
        .where(Agent.id == uuid.UUID(agent_id))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        logger.warning("Agent id=%s not found for test", agent_id)
        raise HTTPException(404, "Agent not found")

    logger.debug("Building ReAct graph for agent=%s model=%s tools=%s",
                 agent.name, agent.model, [t.name for t in agent.tools])

    try:
        from langchain_core.messages import HumanMessage
        from agents.builder import compile_agent, mcp_tools_context

        start = time.time()
        async with mcp_tools_context([agent], db) as tools_by_agent_id:
            graph = compile_agent(agent, tools_by_agent_id.get(str(agent.id), []))
            state = await graph.ainvoke({"messages": [HumanMessage(content=payload.message)]})
        duration = round(time.time() - start, 2)

        messages = []
        tokens_used = 0
        final_output = ""

        for msg in state["messages"]:
            role = msg.__class__.__name__.replace("Message", "").lower()
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            entry: dict = {"role": role, "content": content}

            if hasattr(msg, "tool_calls") and msg.tool_calls:
                entry["tool_calls"] = [{"name": tc["name"], "args": tc["args"]} for tc in msg.tool_calls]
            if hasattr(msg, "name") and msg.name:
                entry["tool_name"] = msg.name
            if hasattr(msg, "usage_metadata") and msg.usage_metadata:
                tokens_used += msg.usage_metadata.get("total_tokens", 0)

            messages.append(entry)
            if role == "ai" and content:
                final_output = content

        logger.info("Test run complete: agent=%s duration=%.2fs tokens=%d",
                    agent.name, duration, tokens_used)
        return {
            "status": "success",
            "output": final_output,
            "messages": messages,
            "tokens_used": tokens_used,
            "duration_seconds": duration,
        }

    except Exception as e:
        logger.exception("Test run failed for agent id=%s: %s", agent_id, e)
        raise HTTPException(500, f"Agent execution failed: {str(e)}")


# ---------------------------------------------------------------------------
# Tool / channel helpers
# ---------------------------------------------------------------------------

@router.get("/tools/list")
async def list_tools(db: AsyncSession = Depends(get_db)):
    """Return all tools registered in the database (seeded on startup)."""
    logger.debug("Listing tools")
    result = await db.execute(select(Tool))
    return [{"id": str(t.id), "name": t.name, "description": t.description} for t in result.scalars().all()]


@router.get("/channels/list")
async def list_channels(db: AsyncSession = Depends(get_db)):
    """Return all channel configurations stored in the database."""
    logger.debug("Listing channels")
    result = await db.execute(select(Channel))
    return [{"id": str(c.id), "type": c.type, "config": c.config} for c in result.scalars().all()]


@router.post("/channels", status_code=201)
async def create_channel(payload: dict, db: AsyncSession = Depends(get_db)):
    """
    Create a new channel configuration.

    Expects JSON with at least a 'type' key (e.g. 'telegram', 'slack') and an
    optional 'config' dict for provider-specific settings like bot tokens.
    """
    logger.info("Creating channel type=%s", payload.get("type"))
    channel = Channel(type=payload["type"], config=payload.get("config", {}))
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    logger.info("Channel created: id=%s type=%s", channel.id, channel.type)
    return {"id": str(channel.id), "type": channel.type, "config": channel.config}
