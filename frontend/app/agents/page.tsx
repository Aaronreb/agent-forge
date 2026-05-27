"use client";
import { useState, useEffect } from "react";
import { api, Agent, Tool } from "@/lib/api";
import AgentForm from "./AgentForm";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const [a, t] = await Promise.all([api.listAgents(), api.listTools()]);
    setAgents(a);
    setTools(t);
  };

  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm("Delete this agent?")) return;
    await api.deleteAgent(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition"
        >
          + New Agent
        </button>
      </div>

      {(creating || editing) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <AgentForm
              agent={editing ?? undefined}
              tools={tools}
              onSave={async (data) => {
                if (editing) {
                  await api.updateAgent(editing.id, data);
                } else {
                  await api.createAgent(data);
                }
                setEditing(null);
                setCreating(false);
                load();
              }}
              onCancel={() => { setEditing(null); setCreating(false); }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {agents.map((a) => (
          <div key={a.id} className="bg-gray-900 rounded-xl p-5 flex items-start justify-between border border-gray-800">
            <div>
              <div className="font-semibold text-lg">{a.name}</div>
              <div className="text-gray-400 text-sm mt-1">{a.role} · {a.model}</div>
              <div className="text-gray-500 text-xs mt-1 line-clamp-2">{a.system_prompt}</div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {a.tools.map((t) => (
                  <span key={t.id} className="px-2 py-0.5 bg-indigo-900/50 text-indigo-300 rounded text-xs">{t.name}</span>
                ))}
                {a.channels.map((c) => (
                  <span key={c.id} className="px-2 py-0.5 bg-green-900/50 text-green-300 rounded text-xs">{c.type}</span>
                ))}
              </div>
            </div>
            <div className="flex gap-2 ml-4 shrink-0">
              <button
                onClick={() => setEditing(a)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
              >
                Edit
              </button>
              <button
                onClick={() => del(a.id)}
                className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800 rounded text-sm transition"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {agents.length === 0 && (
          <p className="text-gray-500 text-center py-12">No agents yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
