# AgentPlatform

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green?logo=fastapi)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![LangGraph](https://img.shields.io/badge/LangGraph-1.0-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)

A production-ready multi-agent AI platform: create agents, wire them into collaborative workflows with a visual builder, and interact with them over Telegram. Built on LangGraph, FastAPI, Next.js, and PostgreSQL.

---

## Features

- **Agent Studio** — Create agents with custom model, system prompt, tools, and memory
- **Visual Workflow Builder** — Drag-and-drop canvas (React Flow) to wire agents into graphs with conditional routing
- **Playbooks** — Form-based workflow creation using a supervisor agent pattern
- **Live Monitor** — WebSocket-powered real-time log stream with token accounting
- **Telegram Integration** — Wire any agent to a Telegram bot via webhook
- **Scheduled Agents** — Run agents on a cron schedule via Celery beat
- **Semantic Memory** — pgvector embeddings for long-term agent memory
- **Docker-ready** — Single `docker compose up -d` launches all five services

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Web UI (Next.js 14)                                             │
│  /agents  /workflows  /monitor                                   │
└─────────────┬──────────────────────────────┬────────────────────┘
              │ REST                          │ WebSocket (/ws/logs)
┌─────────────▼──────────────────────────────▼────────────────────┐
│  FastAPI Backend                                                  │
│  Routes: /agents  /workflows  /runs  /telegram/webhook           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Runtime Coordinator                                      │   │
│  │  • Loads agents → create_react_agent (LangGraph)          │   │
│  │  • Builds workflow StateGraph (supervisor / handoff)      │   │
│  │  • Streams events via Redis Pub/Sub → WebSocket           │   │
│  │  • Celery beat for scheduled agents                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────┬─────────────────────────┬────────────────────┘
                   │                          │
            PostgreSQL                    Redis
            pgvector                      Pub/Sub + Celery
                   │
            Telegram Bot API (webhook)
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Single-agent runtime | `create_react_agent` | Pre-built ReAct loop — agents are simple to configure (model + tools) |
| Multi-agent workflow | `StateGraph` (supervisor/handoff) | Composes agent graphs; supports cycles for feedback loops |
| Persistence | PostgreSQL + pgvector | One service for relational data and semantic memory |
| Real-time | Redis Pub/Sub + FastAPI WebSocket | Events published during graph execution stream straight to the UI |
| External channel | Telegram webhook | Stateless, simple to self-host, works behind ngrok for local dev |
| Scheduling | Celery beat | Standard Python solution; plugs into the same Redis broker |

---

## Project Structure

```
agentplatform/
├── backend/
│   ├── api/              # FastAPI routes + WebSocket
│   ├── agents/           # create_react_agent builder, tools, memory, guardrails
│   ├── runtime/          # Coordinator, workflow builder, scheduler, event stream, seeder
│   ├── messaging/        # Telegram bot adapter
│   ├── models/           # SQLAlchemy ORM (Agent, Workflow, Run, Message)
│   ├── workflow_templates/  # JSON definitions for pre-built templates
│   └── tests/
├── frontend/
│   ├── app/
│   │   ├── agents/       # Agent CRUD
│   │   ├── workflows/    # Visual workflow builder (React Flow)
│   │   └── monitor/      # Live logs + message history
│   ├── components/
│   │   ├── workflow/     # WorkflowCanvas, AgentNode, ConditionEdge
│   │   └── monitor/      # LogStream, MessageTimeline
│   └── lib/              # Typed API client, WebSocket hook
├── alembic/              # DB migrations
├── docker-compose.yml
└── .env.example
```

---

## Quick Start

### 1. Clone and configure

```bash
git clone <repo-url> agentplatform
cd agentplatform
cp .env.example .env
# Edit .env — add OPENAI_API_KEY or ANTHROPIC_API_KEY
```

### 2. Start all services

```bash
docker compose up -d
```

Services: `postgres` (5432), `redis` (6379), `backend` (8000), `frontend` (3000), `celery` (worker+beat).

The backend automatically creates and migrates all database tables on first startup.

### 3. Open the UI

Navigate to **http://localhost:3000**

### 4. Connect Telegram (optional)

```bash
# Expose local backend with ngrok
ngrok http 8000

# Register the webhook with Telegram
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://<ngrok-id>.ngrok.io/telegram/webhook"
```

Create a Channel of type `telegram` in the UI, attach it to an agent, and messages sent to your bot will trigger that agent.

---

## Development

### Backend

```bash
cd backend
pip install -r requirements.txt
# Run locally (needs postgres + redis running)
uvicorn api.main:app --reload
```

#### Run tests

```bash
cd backend
pytest
```

Tests require a local PostgreSQL instance at `localhost:5432` with database `agentdb_test` (same user/pass as `.env`):
```bash
createdb -U agent agentdb_test
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

---

## End-to-End Demo

1. Open the UI → **Agents** → create two agents:
   - **ResearchAgent**: model `gpt-4o`, tool `web_search`, system prompt: *"You are a research assistant. Use web_search to find information."*
   - **SummaryAgent**: model `gpt-4o`, no tools, system prompt: *"You are a summarizer. Write a concise report from the research provided."*

2. **Workflows** → click **Research & Report** template → agents are pre-placed on the canvas → save as *"Research & Report Demo"*.

3. **Monitor** → select the workflow → type *"What is LangGraph?"* → **Launch**.

4. Watch the live event stream: ResearchAgent calls web_search, then hands off to SummaryAgent.

5. Check the **Message History** panel — all inter-agent messages with token counts are persisted.

6. If Telegram is configured: send the same question to your bot and receive the summary as a reply.

---

## Pre-Built Workflow Templates

| Template | Agents | Flow |
|---|---|---|
| Research & Report | ResearchAgent → SummaryAgent | Linear: research then summarise |
| Customer Support Triage | TriageAgent ↔ SpecialistAgent | Conditional with feedback loop |

---

## How to Add a New Workflow Template

1. Create `backend/workflow_templates/my_template.json`:
```json
{
  "slug": "my-template",
  "name": "My Template",
  "description": "What it does.",
  "definition": {
    "nodes": [
      { "key": "agent_a", "label": "AgentA", "role": "...", "system_prompt": "...", "model": "gpt-4o", "tools": [], "is_entry": true, "position_x": 100, "position_y": 200 }
    ],
    "edges": []
  }
}
```
2. Restart the backend — the seeder picks it up automatically on startup.
3. The template appears in the Workflows page gallery.

---

## How to Add a New Messaging Channel

1. Create `backend/messaging/my_channel.py` with:
   - `async def send(chat_id, text)` — sends a reply
   - A webhook handler function
2. Add the channel type string to your UI (the `Channel.type` field is free-form text).
3. Register a FastAPI router in `api/main.py` at `/my_channel/webhook`.
4. In `messaging/telegram.py`, use as a reference for how to look up the agent and call `execute_workflow`.

---

## API Reference (summary)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/agents` | List / create agents |
| GET/PUT/DELETE | `/agents/{id}` | Get / update / delete agent |
| GET | `/agents/tools/list` | Available tools |
| GET/POST | `/workflows` | List / create workflows |
| GET | `/workflows/templates` | Pre-built templates |
| POST | `/runs` | Start a workflow run |
| GET | `/runs/{id}/messages` | Message history for a run |
| WS | `/ws/logs?run_id=X` | Live event stream |
| POST | `/telegram/webhook` | Telegram bot webhook |

---

## License

MIT © 2025 Aaron Rebello
