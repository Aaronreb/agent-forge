from langchain_core.tools import tool

_DECLINE_CODES = {
    "1": ("insufficient_funds", "soft", "Customer account has insufficient balance."),
    "2": ("card_expired",       "hard", "Card expiry date has passed. Customer must update payment method."),
    "3": ("card_stolen",        "hard", "Card reported stolen. Do not retry. Contact customer via alternate channel."),
    "4": ("do_not_honor",       "soft", "Issuer declined without specific reason. Safe to retry with delay."),
    "5": ("gateway_timeout",    "soft", "PSP gateway timed out. Retry immediately with same or alternate PSP."),
}
_DEFAULT = ("insufficient_funds", "soft", "Generic soft decline. Retry after short delay.")


@tool
def get_decline_reason(transaction_id: str) -> str:
    """Fetch the decline reason for a failed subscription payment transaction.
    Returns the decline code, whether it is a soft or hard decline, and
    a description of what it means for retry eligibility.
    transaction_id: the failed payment transaction ID (e.g. 'TXN-1001').
    The last digit of the transaction ID determines the decline scenario."""
    suffix = transaction_id.strip()[-1]
    code, decline_type, description = _DECLINE_CODES.get(suffix, _DEFAULT)
    retryable = "YES" if decline_type == "soft" else "NO"
    return (
        f"decline_code={code} | decline_type={decline_type} | "
        f"retryable={retryable} | description={description}"
    )
