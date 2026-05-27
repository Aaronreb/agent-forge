ROOT_DIR := $(shell pwd)

CONDA_ENV     ?= agentplatform
PYTHON_VERSION ?= 3.11
DB_URL        ?= postgresql://agent:agent@localhost:5432/agentdb
ASYNC_DB_URL  ?= postgresql+asyncpg://agent:agent@localhost:5432/agentdb
REDIS_URL     ?= redis://localhost:6379/0

CONDA_RUN = conda run --no-capture-output -n $(CONDA_ENV)

.PHONY: help conda-create install-backend install-frontend install env \
        redis-start redis-stop redis-status \
        migrate migrate-down \
        backend celery frontend dev \
        test clean \
        docker-up docker-down docker-logs shell-backend test-docker

# ── Help ──────────────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "AgentPlatform – local dev (no Docker)"
	@echo ""
	@echo "  Setup"
	@echo "    make conda-create       Create conda env '$(CONDA_ENV)' (Python $(PYTHON_VERSION))"
	@echo "    make install            Install backend + frontend deps"
	@echo "    make install-backend    pip install backend/requirements.txt"
	@echo "    make install-frontend   npm install in frontend/"
	@echo "    make env                Copy .env.example -> .env (if missing)"
	@echo ""
	@echo "  Infrastructure"
	@echo "    make redis-start        Start redis-server (daemonised)"
	@echo "    make redis-stop         Stop redis-server"
	@echo "    make redis-status       Check redis is reachable"
	@echo ""
	@echo "  Database"
	@echo "    make migrate            alembic upgrade head (local postgres)"
	@echo "    make migrate-down       alembic downgrade -1"
	@echo ""
	@echo "  Run"
	@echo "    make backend            uvicorn api.main:app --reload  (port 8000)"
	@echo "    make celery             celery worker + beat"
	@echo "    make frontend           Next.js dev server              (port 3000)"
	@echo "    make dev                redis + backend + celery + frontend (all-in-one)"
	@echo ""
	@echo "  Other"
	@echo "    make test               pytest (in conda env)"
	@echo "    make clean              Remove build artefacts"
	@echo ""
	@echo "  Docker"
	@echo "    make docker-up          docker compose up -d (all 5 services)"
	@echo "    make docker-down        docker compose down"
	@echo "    make docker-logs        Stream logs from all containers"
	@echo "    make shell-backend      bash shell inside the backend container"
	@echo "    make test-docker        pytest inside the backend container"
	@echo ""
	@echo "  Override variables:"
	@echo "    CONDA_ENV=$(CONDA_ENV)  DB_URL=...  REDIS_URL=..."
	@echo ""

# ── Setup ─────────────────────────────────────────────────────────────────────

conda-create:
	conda create -y -n $(CONDA_ENV) python=$(PYTHON_VERSION)
	@echo ""
	@echo "Conda env '$(CONDA_ENV)' ready. Run 'make install' next."

install-backend:
	$(CONDA_RUN) pip install -r backend/requirements.txt

install-frontend:
	cd frontend && npm install

install: install-backend install-frontend

env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo ".env created from .env.example — fill in your API keys."; \
	else \
		echo ".env already exists."; \
	fi

# ── Redis ─────────────────────────────────────────────────────────────────────

redis-start:
	redis-server --daemonize yes --logfile /tmp/redis-agentplatform.log
	@echo "Redis started on port 6379. Log: /tmp/redis-agentplatform.log"

redis-stop:
	redis-cli shutdown || true

redis-status:
	@redis-cli ping && echo "Redis is UP" || echo "Redis is DOWN"

# ── Alembic ───────────────────────────────────────────────────────────────────
# backend/alembic.ini has script_location=/app/alembic (Docker path).
# We override it at runtime so local runs work without editing the committed ini.

migrate:
	$(CONDA_RUN) python -c "\
from alembic.config import Config; \
from alembic import command; \
cfg = Config('$(ROOT_DIR)/backend/alembic.ini'); \
cfg.set_main_option('script_location', '$(ROOT_DIR)/alembic'); \
cfg.set_main_option('sqlalchemy.url', '$(DB_URL)'); \
command.upgrade(cfg, 'head')"

migrate-down:
	$(CONDA_RUN) python -c "\
from alembic.config import Config; \
from alembic import command; \
cfg = Config('$(ROOT_DIR)/backend/alembic.ini'); \
cfg.set_main_option('script_location', '$(ROOT_DIR)/alembic'); \
cfg.set_main_option('sqlalchemy.url', '$(DB_URL)'); \
command.downgrade(cfg, '-1')"

# ── Services ──────────────────────────────────────────────────────────────────

backend:
	cd backend && \
	DATABASE_URL=$(ASYNC_DB_URL) \
	SYNC_DATABASE_URL=$(DB_URL) \
	REDIS_URL=$(REDIS_URL) \
	$(CONDA_RUN) uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

celery:
	cd backend && \
	DATABASE_URL=$(ASYNC_DB_URL) \
	SYNC_DATABASE_URL=$(DB_URL) \
	REDIS_URL=$(REDIS_URL) \
	$(CONDA_RUN) celery -A runtime.scheduler worker --beat --loglevel=info

frontend:
	cd frontend && \
	NEXT_PUBLIC_API_URL=http://localhost:8000 \
	NEXT_PUBLIC_WS_URL=ws://localhost:8000 \
	npm run dev

# ── Dev (all services) ────────────────────────────────────────────────────────

dev: redis-start
	@echo "Starting backend, celery, and frontend. Press Ctrl+C to stop all."
	@trap 'kill 0' INT; \
	( cd backend && \
	  DATABASE_URL=$(ASYNC_DB_URL) SYNC_DATABASE_URL=$(DB_URL) REDIS_URL=$(REDIS_URL) \
	  $(CONDA_RUN) uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload ) & \
	( cd backend && \
	  DATABASE_URL=$(ASYNC_DB_URL) SYNC_DATABASE_URL=$(DB_URL) REDIS_URL=$(REDIS_URL) \
	  $(CONDA_RUN) celery -A runtime.scheduler worker --beat --loglevel=info ) & \
	( cd frontend && \
	  NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_WS_URL=ws://localhost:8000 \
	  npm run dev ) & \
	wait

# ── Test ──────────────────────────────────────────────────────────────────────

test:
	cd backend && $(CONDA_RUN) pytest

# ── Clean ─────────────────────────────────────────────────────────────────────

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	rm -rf frontend/.next frontend/node_modules
	@echo "Cleaned build artefacts."

# ── Docker ────────────────────────────────────────────────────────────────────

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

shell-backend:
	docker compose exec backend bash

test-docker:
	docker compose exec backend pytest
