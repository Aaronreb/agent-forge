from models import Agent


def check_input(agent: Agent, text: str) -> str | None:
    """Return an error string if input violates guardrails, else None."""
    guardrails = agent.guardrails or {}
    banned = guardrails.get("banned_topics", [])
    lower = text.lower()
    for topic in banned:
        if topic.lower() in lower:
            return f"Input contains a banned topic: '{topic}'"
    return None


def check_output(agent: Agent, text: str) -> str:
    """Truncate or filter output according to guardrails."""
    guardrails = agent.guardrails or {}
    max_tokens = guardrails.get("max_tokens")
    if max_tokens and len(text.split()) > max_tokens:
        words = text.split()[:max_tokens]
        return " ".join(words) + " [truncated]"
    return text
