import uuid
from datetime import datetime
from sqlalchemy import String, Text, Boolean, Integer, JSON, DateTime, ForeignKey, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from typing import TYPE_CHECKING
from .base import Base

if TYPE_CHECKING:
    from .mcp_server import MCPServer

agent_tools = Table(
    "agent_tools",
    Base.metadata,
    Column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id"), primary_key=True),
    Column("tool_id", UUID(as_uuid=True), ForeignKey("tools.id"), primary_key=True),
)

agent_channels = Table(
    "agent_channels",
    Base.metadata,
    Column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id"), primary_key=True),
    Column("channel_id", UUID(as_uuid=True), ForeignKey("channels.id"), primary_key=True),
)


class Tool(Base):
    __tablename__ = "tools"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    mcp_server_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mcp_servers.id", ondelete="CASCADE"), nullable=True
    )
    tool_key: Mapped[str | None] = mapped_column(String(64), nullable=True)

    agents: Mapped[list["Agent"]] = relationship("Agent", secondary=agent_tools, back_populates="tools")
    mcp_server: Mapped["MCPServer | None"] = relationship("MCPServer", back_populates="tools")


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type: Mapped[str] = mapped_column(String(32), nullable=False)  # telegram, slack, etc.
    config: Mapped[dict] = mapped_column(JSON, default=dict)       # chat_id, token overrides, etc.

    agents: Mapped[list["Agent"]] = relationship("Agent", secondary=agent_channels, back_populates="channels")


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(128), nullable=False, default="assistant")
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="gpt-4o")
    memory_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    memory_window_k: Mapped[int] = mapped_column(Integer, default=5)
    guardrails: Mapped[dict] = mapped_column(JSON, default=dict)   # {max_tokens, banned_topics}
    schedule_cron: Mapped[str | None] = mapped_column(String(64), nullable=True)
    emoji: Mapped[str] = mapped_column(String(8), nullable=False, default="🤖")
    color: Mapped[str] = mapped_column(String(32), nullable=False, default="purple")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="idle")
    is_live: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tools: Mapped[list[Tool]] = relationship("Tool", secondary=agent_tools, back_populates="agents")
    channels: Mapped[list[Channel]] = relationship("Channel", secondary=agent_channels, back_populates="agents")
