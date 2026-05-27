"""Seed built-in tools on startup."""
from sqlalchemy import select
from db import AsyncSessionLocal
from models import Tool

BUILT_IN_TOOLS = [
    # Customer Support Triage
    {"name": "knowledge_base_search",    "description": "Search the internal knowledge base for relevant support articles."},
    {"name": "ticket_logger",            "description": "Log a classified support ticket (category, priority, KB articles) to the Excel tracker."},
    # Subscription Dunning Agent
    {"name": "get_decline_reason",       "description": "Fetch the decline reason and soft/hard classification for a failed subscription payment."},
    {"name": "get_subscription_profile", "description": "Fetch customer LTV tier, tenure, retry count and plan for dunning strategy decisions."},
    {"name": "schedule_payment_retry",   "description": "Schedule a future retry attempt for a failed subscription payment."},
    {"name": "send_dunning_notification","description": "Send a dunning email using a template (friendly_reminder, payment_update_request, plan_pause_offer, final_warning, cancellation_confirmed)."},
    {"name": "offer_plan_pause",         "description": "Pause a subscription temporarily as a retention alternative to cancellation."},
    {"name": "cancel_subscription",      "description": "Cancel a subscription after hard decline or exhausted retries."},
    {"name": "dunning_ledger",           "description": "Log a dunning event (retry/pause/cancel) to the Excel dunning ledger."},
]


async def seed_tools_and_templates():
    async with AsyncSessionLocal() as db:
        for t in BUILT_IN_TOOLS:
            result = await db.execute(select(Tool).where(Tool.name == t["name"]))
            if not result.scalar_one_or_none():
                db.add(Tool(name=t["name"], description=t["description"]))
        await db.commit()
