import json
import redis.asyncio as aioredis
from config import settings


async def publish_event(run_id: str, event: dict):
    """Publish a run event to Redis so the WebSocket stream picks it up."""
    r = aioredis.from_url(settings.redis_url)
    try:
        await r.publish(f"runs:{run_id}:events", json.dumps(event))
    finally:
        await r.aclose()
