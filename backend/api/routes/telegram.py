"""
Telegram webhook route.

Receives incoming updates from the Telegram Bot API and dispatches them to
the messaging handler as a background task so the HTTP response returns
immediately (Telegram requires a 200 within ~5 seconds).

Endpoint:
  POST /telegram/webhook  — receives Telegram update JSON payloads
"""
import logging

from fastapi import APIRouter, Request, BackgroundTasks
from messaging.telegram import handle_telegram_update

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receive a Telegram Bot API update and hand it off to the message handler.

    The update is processed asynchronously so this endpoint always returns
    immediately with {"ok": true}, satisfying Telegram's response-time requirement.
    Actual message routing, agent selection, and reply delivery happen in
    `messaging.telegram.handle_telegram_update`.
    """
    data = await request.json()
    update_id = data.get("update_id", "?")
    logger.info("Received Telegram update id=%s", update_id)
    background_tasks.add_task(handle_telegram_update, data)
    return {"ok": True}
