from langchain_core.tools import tool

_KB: dict[str, list[dict]] = {
    "billing": [
        {"id": "KB001", "title": "How to update payment method",
         "content": "Go to Settings > Billing > Payment Methods. Click 'Add card' or 'Replace'. Changes take effect on the next billing cycle."},
        {"id": "KB002", "title": "Understanding your invoice",
         "content": "Invoices are generated on the 1st of each month. Line items include subscription, overages, and add-ons. Download PDFs from Billing > History."},
        {"id": "KB003", "title": "Requesting a refund",
         "content": "Refunds are available within 14 days of charge. Contact support with your invoice number. Processed in 5-7 business days."},
    ],
    "technical": [
        {"id": "KB010", "title": "API rate limits and 429 errors",
         "content": "Free tier: 60 req/min. Pro: 600 req/min. Enterprise: unlimited. On 429, back off exponentially and retry after the Retry-After header."},
        {"id": "KB011", "title": "Fixing 500 internal server errors",
         "content": "500s are usually transient. Retry after 30s. If persistent, check our status page at status.example.com. Include your request ID when contacting support."},
        {"id": "KB012", "title": "Webhook setup and troubleshooting",
         "content": "Webhooks require HTTPS endpoints. We retry failed deliveries 3 times with exponential backoff. Check delivery logs in Settings > Webhooks."},
    ],
    "account": [
        {"id": "KB020", "title": "Resetting your password",
         "content": "Click 'Forgot password' on the login page and enter your email. Reset link expires in 1 hour. Check spam if not received."},
        {"id": "KB021", "title": "Setting up two-factor authentication",
         "content": "Go to Settings > Security > Two-Factor Auth. Scan the QR code with an authenticator app (Google Authenticator, Authy). Save backup codes securely."},
        {"id": "KB022", "title": "Updating account email address",
         "content": "Go to Settings > Profile > Email. A verification link is sent to the new address. Old address receives a notification."},
    ],
    "feature_request": [
        {"id": "KB030", "title": "How to submit a feature request",
         "content": "Use the feedback portal at feedback.example.com. Upvote existing requests before creating new ones. Our PM team reviews weekly."},
        {"id": "KB031", "title": "Checking the product roadmap",
         "content": "Public roadmap is at roadmap.example.com. Items marked 'In Progress' ship within the quarter. 'Planned' items are 1-2 quarters out."},
    ],
    "general": [
        {"id": "KB040", "title": "Getting started — quick setup guide",
         "content": "Step 1: Create your workspace. Step 2: Invite teammates. Step 3: Connect your first integration. Full docs at docs.example.com."},
        {"id": "KB041", "title": "Support hours and SLAs",
         "content": "Free: email only, 48h response. Pro: email + chat, 8h response. Enterprise: 24/7 phone + dedicated CSM, 1h response."},
    ],
}


@tool
def knowledge_base_search(query: str) -> str:
    """Search the internal knowledge base for articles relevant to a support query.
    Pass keywords, a category name (billing, technical, account, feature_request, general),
    or a short description of the issue. Returns matching article titles and content."""
    query_lower = query.lower()
    results = []

    for category, articles in _KB.items():
        for article in articles:
            searchable = f"{category} {article['title']} {article['content']}".lower()
            if any(word in searchable for word in query_lower.split()):
                results.append(f"[{article['id']}] {article['title']}\n{article['content']}")

    if not results:
        return "No matching articles found. Suggest escalating to a human agent."

    return "\n\n---\n\n".join(results[:3])
