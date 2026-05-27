# Customer Support Triage
from .knowledge_base_search import knowledge_base_search
from .ticket_logger import ticket_logger

# Subscription Dunning Agent
from .get_decline_reason import get_decline_reason
from .get_subscription_profile import get_subscription_profile
from .schedule_payment_retry import schedule_payment_retry
from .send_dunning_notification import send_dunning_notification
from .offer_plan_pause import offer_plan_pause
from .cancel_subscription import cancel_subscription
from .dunning_ledger import dunning_ledger_tool

TOOL_REGISTRY = {
    # Customer Support Triage
    "knowledge_base_search":    knowledge_base_search,
    "ticket_logger":            ticket_logger,
    # Subscription Dunning Agent
    "get_decline_reason":       get_decline_reason,
    "get_subscription_profile": get_subscription_profile,
    "schedule_payment_retry":   schedule_payment_retry,
    "send_dunning_notification": send_dunning_notification,
    "offer_plan_pause":         offer_plan_pause,
    "cancel_subscription":      cancel_subscription,
    "dunning_ledger":           dunning_ledger_tool,
}

__all__ = ["TOOL_REGISTRY"]
