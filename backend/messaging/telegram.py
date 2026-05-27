"""
Telegram bot integration.

On incoming webhook update:
1. Find a live agent that has a Telegram channel configured for this chat_id.
   If found, create a workflow Run and execute it.
2. If no agent matches, find a live playbook with trigger_type="telegram"
   and a matching (or blank) chat_id in its telegram_config.
   Run it via the supervisor graph and reply.
"""
import uuid
from config import settings


async def send_message(chat_id: int | str, text: str, bot_token: str | None = None):
    """Send a Telegram message. Uses per-channel/playbook bot_token if provided, else falls back to settings."""
    token = bot_token or settings.telegram_bot_token
    if not token:
        return
    import httpx
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    async with httpx.AsyncClient() as client:
        await client.post(url, json={"chat_id": chat_id, "text": text})


async def handle_telegram_update(data: dict):
    message = data.get("message") or data.get("edited_message")
    if not message:
        return

    chat_id = message["chat"]["id"]
    text = message.get("text", "")
    if not text:
        return

    from db import AsyncSessionLocal
    from models import Agent, Channel, Workflow, Run, Playbook
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    async with AsyncSessionLocal() as db:
        # ── 1. Try to find a live workflow with a matching telegram trigger ───
        wf_result = await db.execute(select(Workflow).where(Workflow.is_live == True))
        matched_wf: Workflow | None = None
        wf_reply_token: str | None = None
        for wf in wf_result.scalars().all():
            for node in (wf.nodes or []):
                if node.get("type") != "trigger":
                    continue
                cfg = node.get("config", {})
                if cfg.get("trigger_type") != "telegram":
                    continue
                configured_chat = str(cfg.get("chat_id", ""))
                if not configured_chat or configured_chat == str(chat_id):
                    matched_wf = wf
                    wf_reply_token = cfg.get("bot_token") or None
                    break
            if matched_wf:
                break

        if matched_wf:
            run = Run(workflow_id=matched_wf.id, trigger="telegram", status="pending", input_text=text)
            db.add(run)
            await db.commit()
            await db.refresh(run)
            from runtime.coordinator import execute_workflow
            output = await execute_workflow(str(run.id), text)
            await send_message(chat_id, output or "Done.", bot_token=wf_reply_token)
            return

        # ── 2. Try to find a live agent with a Telegram channel ──────────────
        result = await db.execute(
            select(Agent)
            .options(selectinload(Agent.channels), selectinload(Agent.tools))
            .join(Agent.channels)
            .where(Channel.type == "telegram", Agent.is_live == True)
        )
        agents = result.scalars().all()

        agent = None
        reply_token: str | None = None
        for a in agents:
            for ch in a.channels:
                if ch.type == "telegram":
                    configured_chat = str(ch.config.get("chat_id", ""))
                    if not configured_chat or configured_chat == str(chat_id):
                        agent = a
                        reply_token = ch.config.get("bot_token") or None
                        break
            if agent:
                break

        if agent:
            # Find or create a single-agent workflow for this agent (JSONB format)
            wf_result = await db.execute(select(Workflow))
            workflow = None
            for wf in wf_result.scalars().all():
                nodes = wf.nodes or []
                if nodes and nodes[0].get("config", {}).get("agent_db_id") == str(agent.id):
                    workflow = wf
                    break

            if not workflow:
                trigger_id = str(uuid.uuid4())
                agent_node_id = str(uuid.uuid4())
                workflow = Workflow(
                    name=f"{agent.name} Solo",
                    description="Auto-created for Telegram",
                    nodes=[
                        {"id": trigger_id, "type": "trigger", "config": {"trigger_type": "telegram"}},
                        {"id": agent_node_id, "type": "compiled_agent",
                         "config": {"agent_db_id": str(agent.id), "label": agent.name}},
                    ],
                    edges=[{"source": trigger_id, "target": agent_node_id}],
                )
                db.add(workflow)
                await db.commit()
                await db.refresh(workflow)

            run = Run(workflow_id=workflow.id, trigger="telegram", status="pending", input_text=text)
            db.add(run)
            await db.commit()
            await db.refresh(run)

            from runtime.coordinator import execute_workflow
            output = await execute_workflow(str(run.id), text)
            await send_message(chat_id, output or "Done.", bot_token=reply_token)
            return

        # ── 2. Fall back to a live playbook with trigger_type="telegram" ─────
        pb_result = await db.execute(
            select(Playbook).where(Playbook.trigger_type == "telegram", Playbook.is_live == True)
        )
        matched_pb = None
        for pb in pb_result.scalars().all():
            cfg = pb.telegram_config or {}
            configured_chat = str(cfg.get("chat_id", ""))
            if not configured_chat or configured_chat == str(chat_id):
                matched_pb = pb
                reply_token = cfg.get("bot_token") or None
                break

        if not matched_pb:
            await send_message(chat_id, "No active agent or playbook is configured for this chat.")
            return

        # Load agents for the playbook
        agent_uuids = [uuid.UUID(aid) for aid in (matched_pb.agent_ids or [])]
        pb_agents: list[Agent] = []
        for aid in agent_uuids:
            q = await db.execute(select(Agent).options(selectinload(Agent.tools)).where(Agent.id == aid))
            a = q.scalar_one_or_none()
            if a:
                pb_agents.append(a)

        if not pb_agents:
            await send_message(chat_id, "Playbook has no agents configured.", bot_token=reply_token)
            return

        run = Run(playbook_id=matched_pb.id, trigger="telegram", status="running", input_text=text)
        db.add(run)
        await db.commit()
        await db.refresh(run)

    # Run outside DB session to avoid holding connection during LLM call
    from runtime.sync_runner import run_playbook_sync
    from db import AsyncSessionLocal
    from datetime import datetime

    try:
        result = await run_playbook_sync(matched_pb, pb_agents, text, f"tg-{chat_id}")
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Telegram playbook run failed: playbook=%s", matched_pb.name)
        await send_message(chat_id, "Sorry, something went wrong.", bot_token=reply_token)
        async with AsyncSessionLocal() as db2:
            r = await db2.get(Run, run.id)
            if r:
                r.status = "failed"
                r.finished_at = datetime.utcnow()
                await db2.commit()
        return

    from models import Message as MsgModel
    async with AsyncSessionLocal() as db2:
        r = await db2.get(Run, run.id)
        if r:
            r.status = "done"
            r.finished_at = datetime.utcnow()
            _COST_PER_TOKEN = 0.0000004
            tokens = result["tokens"]
            cost = round(tokens * _COST_PER_TOKEN, 7)
            if result["output"]:
                db2.add(MsgModel(run_id=run.id, role="assistant", content=result["output"], tokens_used=tokens, cost_usd=cost))
            await db2.commit()

    await send_message(chat_id, result["output"] or "Done.", bot_token=reply_token)
