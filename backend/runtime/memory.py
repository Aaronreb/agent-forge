"""
Module-level LangGraph checkpointer shared across all graph invocations.

Using a single MemorySaver instance means any graph compiled with this
checkpointer can maintain conversation state across multiple invocations
as long as the caller passes the same thread_id in the config.

Lives for the lifetime of the server process. On restart, all conversation
histories are lost — use langgraph-checkpoint-postgres for persistence.
"""
from langgraph.checkpoint.memory import MemorySaver

CHECKPOINTER = MemorySaver()
