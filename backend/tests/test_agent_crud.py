import pytest


@pytest.mark.asyncio
async def test_create_and_list_agent(client):
    resp = await client.post("/agents", json={
        "name": "TestBot",
        "role": "assistant",
        "system_prompt": "You are helpful.",
        "model": "gpt-4o",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "TestBot"
    agent_id = data["id"]

    resp = await client.get("/agents")
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()]
    assert "TestBot" in names

    resp = await client.get(f"/agents/{agent_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == agent_id


@pytest.mark.asyncio
async def test_update_agent(client):
    resp = await client.post("/agents", json={"name": "OldName", "model": "gpt-4o"})
    agent_id = resp.json()["id"]

    resp = await client.put(f"/agents/{agent_id}", json={"name": "NewName"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "NewName"


@pytest.mark.asyncio
async def test_delete_agent(client):
    resp = await client.post("/agents", json={"name": "ToDelete", "model": "gpt-4o"})
    agent_id = resp.json()["id"]

    resp = await client.delete(f"/agents/{agent_id}")
    assert resp.status_code == 204

    resp = await client.get(f"/agents/{agent_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_agent_guardrails(client):
    resp = await client.post("/agents", json={
        "name": "GuardedBot",
        "model": "gpt-4o",
        "guardrails": {"max_tokens": 100, "banned_topics": ["violence"]},
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["guardrails"]["banned_topics"] == ["violence"]
