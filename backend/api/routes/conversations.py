"""
Conversation routes — read-only access to channel conversations (Telegram, Slack, etc.).

Conversations are created by the messaging layer (e.g. telegram.py) when a user
sends a message through a connected channel. These routes expose them for the UI's
Conversations page.

Endpoints:
  GET  /conversations                      — list all conversations with last-message preview
  GET  /conversations/{id}/messages        — full message history for one conversation
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db import get_db
from models import Conversation, ConversationMessage

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def _convo_out(c: Conversation, preview: str = "") -> dict:
    """Serialise a Conversation ORM object to a dict, including a message preview."""
    return {
        "id": str(c.id),
        "channel_type": c.channel_type,
        "user_id": c.user_id,
        "user_name": c.user_name,
        "agent_id": str(c.agent_id) if c.agent_id else None,
        "started_at": c.started_at.isoformat(),
        "last_message_at": c.last_message_at.isoformat(),
        "preview": preview,
    }


def _msg_out(m: ConversationMessage) -> dict:
    """Serialise a ConversationMessage ORM object to a dict."""
    return {
        "id": str(m.id),
        "role": m.role,
        "agent_name": m.agent_name,
        "content": m.content,
        "created_at": m.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_conversations(db: AsyncSession = Depends(get_db)):
    """
    Return all conversations ordered by most recently active.

    Each item includes a short preview taken from the last message's content
    (truncated to 80 characters).
    """
    logger.debug("Listing conversations")
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .order_by(Conversation.last_message_at.desc())
    )
    convos = result.scalars().all()
    logger.debug("Found %d conversation(s)", len(convos))

    out = []
    for c in convos:
        preview = c.messages[-1].content[:80] if c.messages else ""
        out.append(_convo_out(c, preview))
    return out


@router.get("/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return all messages for a single conversation ordered by creation time.

    Returns 404 if the conversation_id does not exist.
    """
    logger.debug("Fetching messages for conversation id=%s", conversation_id)
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == uuid.UUID(conversation_id))
    )
    convo = result.scalar_one_or_none()
    if not convo:
        logger.warning("Conversation id=%s not found", conversation_id)
        raise HTTPException(404, "Conversation not found")

    logger.debug("Returning %d message(s) for conversation id=%s", len(convo.messages), conversation_id)
    return [_msg_out(m) for m in convo.messages]
