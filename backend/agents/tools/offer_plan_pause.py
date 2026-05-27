from datetime import datetime, timedelta
from langchain_core.tools import tool


@tool
def offer_plan_pause(subscription_id: str, pause_days: int) -> str:
    """Pause a subscription temporarily instead of cancelling.
    Use this for high-LTV customers on their 2nd retry as a retention move.
    The customer will not be charged during the pause period and can resume anytime.
    pause_days: how long to pause, typically 30 or 60 days.
    subscription_id: the subscription to pause."""
    resume_at = datetime.now() + timedelta(days=pause_days)
    return (
        f"subscription_paused | subscription_id={subscription_id} | "
        f"pause_days={pause_days} | resumes_at={resume_at.strftime('%Y-%m-%d')} | "
        f"status=no_charge_during_pause"
    )
