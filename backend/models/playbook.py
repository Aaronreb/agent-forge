import uuid
from datetime import datetime
from sqlalchemy import String, Text, JSON, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from .base import Base


class Playbook(Base):
    __tablename__ = "playbooks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    playbook_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    agent_ids: Mapped[list] = mapped_column(JSON, default=list)
    supervisor_model: Mapped[str] = mapped_column(String(64), default="gpt-5.4-mini-2026-03-17")
    trigger_type: Mapped[str] = mapped_column(String(32), default="manual")
    schedule_cron: Mapped[str | None] = mapped_column(String(64), nullable=True)
    telegram_config: Mapped[dict] = mapped_column(JSON, default=dict)
    is_live: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
