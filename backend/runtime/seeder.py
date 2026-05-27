"""Seed built-in tools and the Customer Support Triage playbook on startup."""
from sqlalchemy import select
from db import AsyncSessionLocal
from models import Tool, Agent, Playbook

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

_MODEL = "gpt-5.4-mini-2026-03-17"

_CLASSIFIER_PROMPT = """\
You are a customer support ticket classifier.

When given a support ticket, output a JSON object with these fields:
- category: one of "billing", "technical", "account", "feature_request", "general"
- priority: one of "low", "medium", "high", "urgent"
- summary: one sentence describing the core issue
- sentiment: one of "neutral", "frustrated", "angry", "satisfied"

Rules:
- urgent = service completely down or data loss
- high = paid feature broken or billing error
- medium = something broken with a workaround
- low = question, feature request, general inquiry

Always output valid JSON only.\
"""

_RESOLUTION_PROMPT = """\
You are a support resolution specialist with two responsibilities.

Given a ticket classification (category, priority, sentiment, summary):

Step 1 — Search the knowledge base:
  Call knowledge_base_search twice:
  - First with the ticket category as the query
  - Then with 2-3 keywords from the ticket summary
  Identify the top 3 most relevant articles and note their IDs.

Step 2 — Log the ticket to the tracker:
  Call ticket_logger with:
  - ticket_id: generate a short ID like "TKT-XXXXXX" (6 random chars)
  - category, priority, sentiment, summary: from the classification
  - kb_articles_used: comma-separated IDs of the articles you found

Return all article content (IDs + text) for the response drafter to use,
plus confirmation that the ticket was logged.\
"""

_DRAFTER_PROMPT = """\
You are an empathetic customer support specialist who writes clear,
helpful, and warm responses.

Given:
- The original support ticket
- The ticket classification (category, priority, sentiment)
- Relevant KB articles

Write a complete customer-facing response that:
1. Opens with acknowledgment appropriate to their sentiment
   (calm for neutral, empathetic for frustrated/angry)
2. Directly addresses their specific issue
3. Provides step-by-step guidance drawn from the KB articles
4. Ends with an offer for further help
5. Signs off as "The Support Team"

Keep it concise (under 200 words). Do not mention internal
classifications or KB article IDs in the response.\
"""

_PLAYBOOK_TEXT = """\
You are orchestrating a 3-step customer support triage pipeline.

When a support ticket is received:

Step 1 — Classification:
  Ask ticket_classifier to classify the ticket (category, priority,
  sentiment, one-line summary). Wait for the JSON result.

Step 2 — KB Lookup + Ticket Logging:
  Pass the classification result to resolution_finder. It will search
  the knowledge base (knowledge_base_search) AND log the ticket to
  the Excel tracker (ticket_logger). Wait for the articles and log confirmation.

Step 3 — Response Drafting:
  Pass the original ticket, classification, and KB articles to
  response_drafter. Ask it to write the final customer response.

Your final output must be the complete, ready-to-send customer
response from response_drafter, preceded by a one-line header:
  Priority: [priority] | Category: [category] | Sentiment: [sentiment]\
"""


async def seed_tools_and_templates():
    async with AsyncSessionLocal() as db:
        for t in BUILT_IN_TOOLS:
            result = await db.execute(select(Tool).where(Tool.name == t["name"]))
            if not result.scalar_one_or_none():
                db.add(Tool(name=t["name"], description=t["description"]))
        await db.commit()

        # Skip if playbook already seeded
        existing = await db.execute(select(Playbook).where(Playbook.name == "Customer Support Triage"))
        if existing.scalar_one_or_none():
            return

        async def _get_tool(name):
            r = await db.execute(select(Tool).where(Tool.name == name))
            return r.scalar_one()

        kb  = await _get_tool("knowledge_base_search")
        log = await _get_tool("ticket_logger")

        classifier = Agent(
            name="Ticket Classifier",
            role="classifier",
            model=_MODEL,
            emoji="🎫",
            color="blue",
            system_prompt=_CLASSIFIER_PROMPT,
        )
        classifier.tools = []

        resolver = Agent(
            name="Resolution Finder",
            role="support resolution specialist",
            model=_MODEL,
            emoji="🔍",
            color="green",
            system_prompt=_RESOLUTION_PROMPT,
        )
        resolver.tools = [kb, log]

        drafter = Agent(
            name="Response Drafter",
            role="customer support specialist",
            model=_MODEL,
            emoji="✍️",
            color="purple",
            system_prompt=_DRAFTER_PROMPT,
        )
        drafter.tools = []

        db.add_all([classifier, resolver, drafter])
        await db.flush()

        playbook = Playbook(
            name="Customer Support Triage",
            description="3-step pipeline: classify ticket → search KB + log → draft customer response.",
            playbook_text=_PLAYBOOK_TEXT,
            agent_ids=[str(classifier.id), str(resolver.id), str(drafter.id)],
            supervisor_model=_MODEL,
            trigger_type="manual",
        )
        db.add(playbook)
        await db.commit()
