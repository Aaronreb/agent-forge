from langchain_core.tools import tool

_TEMPLATES = {
    "friendly_reminder":      "Subject: Quick reminder about your payment — we'll retry soon.",
    "payment_update_request": "Subject: Please update your payment method to keep your plan active.",
    "plan_pause_offer":       "Subject: We've paused your plan — resume anytime when ready.",
    "final_warning":          "Subject: Final notice — your subscription will be cancelled in 48 hours.",
    "cancellation_confirmed": "Subject: Your subscription has been cancelled. We're sorry to see you go.",
}


@tool
def send_dunning_notification(customer_id: str, template: str) -> str:
    """Send a dunning notification email to the customer using a predefined template.
    Choose the template that fits the situation:
    - 'friendly_reminder': first soft decline, low urgency, will retry automatically
    - 'payment_update_request': card expired or needs updating by customer
    - 'plan_pause_offer': high-LTV customer on 2nd+ retry, offer to pause instead of cancel
    - 'final_warning': last attempt before cancellation
    - 'cancellation_confirmed': sent after subscription is cancelled
    customer_id: the customer or subscription ID.
    template: one of the template names listed above."""
    preview = _TEMPLATES.get(template, "Subject: Important notice about your account.")
    return (
        f"notification_sent | customer_id={customer_id} | template={template} | "
        f"preview='{preview}'"
    )
