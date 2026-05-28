import json
import redis.asyncio as aioredis
from config import settings

_HISTORY_TTL = 3600  # seconds


async def publish_event(run_id: str, event: dict):
    """Publish a run event to Redis pub/sub and persist it to a list for late subscribers."""
    r = aioredis.from_url(settings.redis_url)
    try:
        payload = json.dumps(event)
        key = f"runs:{run_id}:history"
        pipe = r.pipeline()
        pipe.rpush(key, payload)
        pipe.expire(key, _HISTORY_TTL)
        pipe.publish(f"runs:{run_id}:events", payload)
        await pipe.execute()
    finally:
        await r.aclose()


async def get_run_events(run_id: str) -> list:
    """Return all events published for a run, in order."""
    r = aioredis.from_url(settings.redis_url)
    try:
        items = await r.lrange(f"runs:{run_id}:history", 0, -1)
        return [json.loads(item) for item in items]
    finally:
        await r.aclose()
