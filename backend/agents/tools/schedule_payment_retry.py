from datetime import datetime, timedelta
from langchain_core.tools import tool


@tool
def schedule_payment_retry(subscription_id: str, delay_days: int) -> str:
    """Schedule a future retry attempt for a failed subscription payment.
    Use delay_days=0 for immediate retry, 1-3 for soft declines, 7 for final attempts.
    Returns the scheduled retry timestamp.
    subscription_id: the subscription to retry.
    delay_days: how many days from now to schedule the retry."""
    retry_at = datetime.now() + timedelta(days=delay_days)
    return (
        f"retry_scheduled | subscription_id={subscription_id} | "
        f"retry_at={retry_at.strftime('%Y-%m-%d %H:%M')} | delay_days={delay_days}"
    )
