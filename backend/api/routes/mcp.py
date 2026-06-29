"""
MCP server management routes.

Endpoints:
  GET  /mcp/servers          - list all registered MCP servers
  POST /mcp/servers          - register a new MCP server
  DELETE /mcp/servers/{id}   - remove a server and its tools
  POST /mcp/servers/{id}/sync - discover tools from the MCP server and upsert Tool records
  GET  /mcp/tools            - list all tools across all active servers (for agent form)
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import get_db
from models import MCPServer, Tool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mcp", tags=["mcp"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MCPServerCreate(BaseModel):
    name: str
    url: str
    api_key: str = ""


class MCPServerOut(BaseModel):
    id: str
    name: str
    url: str
    is_active: bool
    created_at: str
    tool_count: int = 0

    class Config:
        from_attributes = True


class ToolOut(BaseModel):
    id: str
    name: str
    description: str
    tool_key: str | None
    mcp_server_id: str | None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# MCP tool discovery via langchain_mcp_adapters
# ---------------------------------------------------------------------------

async def _list_mcp_tools(url: str, api_key: str) -> list[dict[str, Any]]:
    """
    Connect to an MCP server via langchain_mcp_adapters and return its tool list
    as plain dicts with {name, description}.
    """
    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient
    except ImportError:
        raise HTTPException(status_code=500, detail="langchain_mcp_adapters not installed")

    server_config = {
        "_sync": {
            "url": url.rstrip("/") + "/mcp",
            "transport": "streamable_http",
            "headers": {"X-API-Key": api_key} if api_key else {},
        }
    }
    try:
        client = MultiServerMCPClient(server_config)
        tools = await client.get_tools()
        return [{"name": t.name, "description": t.description or ""} for t in tools]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Cannot connect to MCP server: {e}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/servers", response_model=list[MCPServerOut])
async def list_servers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MCPServer).options(selectinload(MCPServer.tools)).order_by(MCPServer.created_at)
    )
    servers = result.scalars().all()
    return [
        MCPServerOut(
            id=str(s.id), name=s.name, url=s.url,
            is_active=s.is_active, created_at=s.created_at.isoformat(),
            tool_count=len(s.tools),
        )
        for s in servers
    ]


@router.post("/servers", response_model=MCPServerOut, status_code=201)
async def create_server(body: MCPServerCreate, db: AsyncSession = Depends(get_db)):
    server = MCPServer(name=body.name, url=body.url, api_key=body.api_key)
    db.add(server)
    await db.commit()
    await db.refresh(server)
    logger.info("MCP server registered: %s (%s)", server.name, server.url)
    return MCPServerOut(
        id=str(server.id), name=server.name, url=server.url,
        is_active=server.is_active, created_at=server.created_at.isoformat(), tool_count=0,
    )


@router.delete("/servers/{server_id}", status_code=204)
async def delete_server(server_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MCPServer).where(MCPServer.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    await db.delete(server)
    await db.commit()


@router.post("/servers/{server_id}/sync", response_model=list[ToolOut])
async def sync_server(server_id: str, db: AsyncSession = Depends(get_db)):
    """
    Fetch the tool list from the MCP server and upsert Tool records.
    Returns the synced tools.
    """
    result = await db.execute(select(MCPServer).where(MCPServer.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    remote_tools = await _list_mcp_tools(server.url, server.api_key)

    synced = []
    for rt in remote_tools:
        tool_key = rt.get("name", "")
        display_name = f"{server.name}/{tool_key}"
        description = rt.get("description", "")

        existing = await db.execute(
            select(Tool).where(Tool.mcp_server_id == server.id, Tool.tool_key == tool_key)
        )
        tool = existing.scalar_one_or_none()
        if tool:
            tool.name = display_name
            tool.description = description
        else:
            tool = Tool(
                name=display_name,
                description=description,
                mcp_server_id=server.id,
                tool_key=tool_key,
            )
            db.add(tool)
        synced.append(tool)

    await db.commit()
    for t in synced:
        await db.refresh(t)

    logger.info("Synced %d tools from MCP server %s", len(synced), server.name)
    return [
        ToolOut(
            id=str(t.id), name=t.name, description=t.description,
            tool_key=t.tool_key, mcp_server_id=str(t.mcp_server_id) if t.mcp_server_id else None,
        )
        for t in synced
    ]


@router.get("/tools", response_model=list[ToolOut])
async def list_mcp_tools(db: AsyncSession = Depends(get_db)):
    """Return all tools linked to active MCP servers."""
    result = await db.execute(
        select(Tool)
        .join(MCPServer, Tool.mcp_server_id == MCPServer.id)
        .where(MCPServer.is_active == True)
        .order_by(Tool.name)
    )
    tools = result.scalars().all()
    return [
        ToolOut(
            id=str(t.id), name=t.name, description=t.description,
            tool_key=t.tool_key, mcp_server_id=str(t.mcp_server_id) if t.mcp_server_id else None,
        )
        for t in tools
    ]
