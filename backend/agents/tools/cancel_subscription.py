from langchain_core.tools import tool


@tool
def cancel_subscription(subscription_id: str, reason: str = "") -> str:
    """Cancel a subscription. Use only for hard declines (card_stolen, card_expired
    after update request failed) or when retry_count >= 3.
    Triggers end-of-billing-period access retention and offboarding flow.
    subscription_id: the subscription to cancel.
    reason: brief reason for audit log (e.g. 'hard_decline_card_stolen')."""
    return (
        f"subscription_cancelled | subscription_id={subscription_id} | "
        f"reason={reason or 'payment_failure'} | "
        f"access=retained_until_period_end | offboarding=triggered"
    )
