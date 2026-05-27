import asyncio
import json
import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from config import settings

router = APIRouter()


@router.websocket("/ws/logs")
async def ws_logs(websocket: WebSocket, run_id: str = ""):
    await websocket.accept()
    r = aioredis.from_url(settings.redis_url)
    channel = f"runs:{run_id}:events" if run_id else "runs:*:events"
    pubsub = r.pubsub()

    try:
        if run_id:
            await pubsub.subscribe(channel)
        else:
            await pubsub.psubscribe("runs:*:events")

        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg["data"]:
                data = msg["data"]
                if isinstance(data, bytes):
                    data = data.decode()
                await websocket.send_text(data)
            await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe()
        await r.aclose()
