from langchain_core.tools import tool

_PROFILES = {
    "SUB-001": {"ltv_tier": "high",   "tenure_months": 24, "retry_count": 0, "plan": "Enterprise", "customer_name": "Acme Corp"},
    "SUB-002": {"ltv_tier": "medium", "tenure_months":  8, "retry_count": 1, "plan": "Pro",        "customer_name": "Beta LLC"},
    "SUB-003": {"ltv_tier": "low",    "tenure_months":  2, "retry_count": 2, "plan": "Starter",    "customer_name": "Gamma Inc"},
    "SUB-004": {"ltv_tier": "high",   "tenure_months": 36, "retry_count": 0, "plan": "Enterprise", "customer_name": "Delta Co"},
}
_DEFAULT = {"ltv_tier": "medium", "tenure_months": 6, "retry_count": 0, "plan": "Pro", "customer_name": "Unknown"}


@tool
def get_subscription_profile(subscription_id: str) -> str:
    """Fetch the subscription and customer profile for dunning strategy decisions.
    Returns LTV tier, tenure, current retry count, and plan type.
    ltv_tier: high / medium / low — determines how aggressively to retain.
    retry_count: how many dunning attempts have already been made this cycle.
    subscription_id: e.g. 'SUB-001'. Only call this for soft declines."""
    p = _PROFILES.get(subscription_id.upper(), _DEFAULT)
    return (
        f"customer={p['customer_name']} | ltv_tier={p['ltv_tier']} | "
        f"tenure_months={p['tenure_months']} | retry_count={p['retry_count']} | "
        f"plan={p['plan']} | subscription_id={subscription_id}"
    )
