from langchain_core.messages import SystemMessage
from models import Agent


async def build_memory_context(agent: Agent, thread_id: str) -> str:
    """Return a text block of recent memory to inject into the system prompt."""
    if not agent.memory_enabled:
        return ""
    # pgvector semantic search can be wired here; for now return empty string
    # so the feature is structurally present and testable.
    return ""
