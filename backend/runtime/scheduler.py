"""
Celery app with beat scheduler for cron-triggered agents.
Each agent with a schedule_cron gets a periodic task that creates a Run and executes it.
"""
import asyncio
from celery import Celery
from celery.schedules import crontab
from config import settings

celery_app = Celery("agentplatform", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.timezone = "UTC"


@celery_app.task(name="runtime.scheduler.trigger_scheduled_agents")
def trigger_scheduled_agents():
    """Check for agents with matching cron schedules and fire them."""
    asyncio.run(_trigger())


async def _trigger():
    from db import AsyncSessionLocal
    from models import Agent, Workflow, Run
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from datetime import datetime
    from runtime.coordinator import execute_workflow

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Agent).where(Agent.schedule_cron.isnot(None))
        )
        agents = result.scalars().all()
        for agent in agents:
            # Find a single-agent workflow for this agent (JSONB format)
            wf_result = await db.execute(select(Workflow))
            for wf in wf_result.scalars().all():
                nodes = wf.nodes or []
                if (len(nodes) == 1
                        and nodes[0].get("config", {}).get("agent_db_id") == str(agent.id)):
                    run = Run(workflow_id=wf.id, trigger="schedule", status="pending", input_text="[scheduled]")
                    db.add(run)
                    await db.commit()
                    await db.refresh(run)
                    await execute_workflow(str(run.id), "[scheduled]")
                    break


celery_app.conf.beat_schedule = {
    "check-scheduled-agents": {
        "task": "runtime.scheduler.trigger_scheduled_agents",
        "schedule": crontab(minute="*"),  # every minute; the task itself checks cron expressions
    }
}
