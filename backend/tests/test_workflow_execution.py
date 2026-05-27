"""
Integration test for workflow execution with two mocked agents.

We patch execute_workflow so no real LLM calls are made.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_workflow_two_agents_executes(client):
    # Create two agents
    r1 = await client.post("/agents", json={"name": "AgentA", "model": "gpt-4o", "system_prompt": "You are A."})
    r2 = await client.post("/agents", json={"name": "AgentB", "model": "gpt-4o", "system_prompt": "You are B."})
    assert r1.status_code == 201
    assert r2.status_code == 201
    a1_id = r1.json()["id"]
    a2_id = r2.json()["id"]

    # Create a workflow: trigger → agent_A → agent_B → end (new JSONB schema)
    trigger_id = "node-trigger"
    n1_id = "node-a1"
    n2_id = "node-a2"
    end_id = "node-end"

    wf_resp = await client.post("/workflows", json={
        "name": "A-to-B",
        "nodes": [
            {"id": trigger_id, "type": "trigger", "config": {"trigger_type": "manual"}},
            {"id": n1_id, "type": "compiled_agent", "config": {"agent_db_id": a1_id, "label": "AgentA"}},
            {"id": n2_id, "type": "compiled_agent", "config": {"agent_db_id": a2_id, "label": "AgentB"}},
            {"id": end_id, "type": "end", "config": {}},
        ],
        "edges": [
            {"source": trigger_id, "target": n1_id},
            {"source": n1_id, "target": n2_id},
            {"source": n2_id, "target": end_id},
        ],
    })
    assert wf_resp.status_code == 201
    wf_id = wf_resp.json()["id"]

    from runtime import coordinator

    async def fake_execute(run_id: str, input_text: str, thread_id=None):
        from db import AsyncSessionLocal
        from models import Run, Message
        from datetime import datetime
        async with AsyncSessionLocal() as db:
            run = await db.get(Run, uuid.UUID(run_id))
            run.status = "done"
            run.finished_at = datetime.utcnow()
            db.add(Message(run_id=run.id, role="assistant", content="Result from AgentA"))
            db.add(Message(run_id=run.id, role="assistant", content="Summary from AgentB"))
            await db.commit()
        return "Summary from AgentB"

    with patch.object(coordinator, "execute_workflow", fake_execute):
        run_resp = await client.post("/runs", json={"workflow_id": wf_id, "input_text": "Tell me about AI"})
        assert run_resp.status_code == 201
        run_id = run_resp.json()["id"]

    import asyncio
    await asyncio.sleep(0.2)

    msgs = await client.get(f"/runs/{run_id}/messages")
    assert msgs.status_code == 200
    contents = [m["content"] for m in msgs.json()]
    assert any("AgentA" in c for c in contents)
    assert any("AgentB" in c for c in contents)


@pytest.mark.asyncio
async def test_run_status_transitions(client):
    r = await client.post("/agents", json={"name": "StatusAgent", "model": "gpt-4o"})
    a_id = r.json()["id"]

    wf = await client.post("/workflows", json={
        "name": "StatusWF",
        "nodes": [
            {"id": "node-trigger", "type": "trigger", "config": {"trigger_type": "manual"}},
            {"id": "node-agent", "type": "compiled_agent", "config": {"agent_db_id": a_id, "label": "StatusAgent"}},
        ],
        "edges": [{"source": "node-trigger", "target": "node-agent"}],
    })
    wf_id = wf.json()["id"]

    from runtime import coordinator
    with patch.object(coordinator, "execute_workflow", AsyncMock(return_value="ok")):
        run_resp = await client.post("/runs", json={"workflow_id": wf_id, "input_text": "hello"})
    assert run_resp.status_code == 201
    assert run_resp.json()["status"] == "pending"
