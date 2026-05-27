"""
AgentPlatform FastAPI application entry point.

Registers all routers, configures CORS, and runs startup hooks:
  - Creates all database tables (idempotent via create_all)
  - Seeds built-in tools and workflow templates via `runtime.seeder`

Routers mounted:
  /agents         — agent CRUD + test endpoint
  /workflows      — workflow CRUD + templates
  /runs           — run creation and inspection
  /telegram       — Telegram webhook receiver
  /conversations  — channel conversation read access
  /ws             — WebSocket stream for live run events
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from api.routes import agents, workflows, runs, telegram, conversations, playbooks, chat, config_options
from api.websockets import router as ws_router
from db import engine
from models import Base

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="AgentPlatform API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router, prefix="/agents", tags=["agents"])
app.include_router(workflows.router, prefix="/workflows", tags=["workflows"])
app.include_router(runs.router, prefix="/runs", tags=["runs"])
app.include_router(telegram.router, prefix="/telegram", tags=["telegram"])
app.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
app.include_router(playbooks.router, prefix="/playbooks", tags=["playbooks"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(config_options.router, prefix="/config", tags=["config"])
app.include_router(ws_router)


@app.on_event("startup")
async def startup():
    """
    Application startup hook.

    1. Ensures all SQLAlchemy-mapped tables exist in the database.
    2. Seeds built-in tools (web_search, calculator, etc.) and workflow
       templates if they are not already present.
    """
    import os
    from config import settings
    if settings.langchain_tracing_v2:
        os.environ.setdefault("LANGCHAIN_TRACING_V2", settings.langchain_tracing_v2)
    if settings.langchain_api_key:
        os.environ.setdefault("LANGCHAIN_API_KEY", settings.langchain_api_key)
    if settings.langchain_project:
        os.environ.setdefault("LANGCHAIN_PROJECT", settings.langchain_project)

    logger.info("Starting AgentPlatform API")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add columns introduced after initial table creation (safe on fresh DBs too)
        migrations = [
            "ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE workflows ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE runs ADD COLUMN IF NOT EXISTS playbook_id UUID REFERENCES playbooks(id)",
            "ALTER TABLE runs ALTER COLUMN workflow_id DROP NOT NULL",
            "ALTER TABLE runs ADD COLUMN IF NOT EXISTS thread_id VARCHAR(64)",
            "ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS telegram_config JSON DEFAULT '{}'",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE runs ADD COLUMN IF NOT EXISTS agent_id UUID",
            "ALTER TABLE runs ADD COLUMN IF NOT EXISTS langsmith_url VARCHAR(512)",
            "ALTER TABLE runs ADD COLUMN IF NOT EXISTS trace JSONB",
        ]
        for stmt in migrations:
            try:
                await conn.execute(text(stmt))
            except Exception as exc:
                logger.warning("Migration skipped (%s): %s", stmt[:60], exc)
    logger.info("Database tables ensured")

    from runtime.seeder import seed_tools_and_templates
    await seed_tools_and_templates()
    logger.info("Startup complete")


@app.get("/health")
async def health():
    """Simple liveness probe. Returns 200 with status='ok' when the server is up."""
    return {"status": "ok"}
