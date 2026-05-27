"use client";
import { useState, useEffect } from "react";
import { api, Agent, Tool, PlatformConfig } from "@/lib/api";
import ModelCombobox from "@/components/ModelCombobox";

interface Props {
  agent?: Agent;
  tools: Tool[];
  onSave: (data: Partial<Agent>) => Promise<void>;
  onCancel: () => void;
}

export default function AgentForm({ agent, tools, onSave, onCancel }: Props) {
  const [name, setName] = useState(agent?.name ?? "");
  const [role, setRole] = useState(agent?.role ?? "assistant");
  const [systemPrompt, setSystemPrompt] = useState(agent?.system_prompt ?? "");
  const [model, setModel] = useState(agent?.model ?? "gpt-5.4-mini-2026-03-17");
  const [config, setConfig] = useState<PlatformConfig>({ models: [], channels: [] });

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
  }, []);
  const [memoryEnabled, setMemoryEnabled] = useState(agent?.memory_enabled ?? false);
  const [scheduleCron, setScheduleCron] = useState(agent?.schedule_cron ?? "");
  const [maxTokens, setMaxTokens] = useState<number>(
    (agent?.guardrails as { max_tokens?: number })?.max_tokens ?? 0
  );
  const [bannedTopics, setBannedTopics] = useState(
    ((agent?.guardrails as { banned_topics?: string[] })?.banned_topics ?? []).join(", ")
  );
  const [selectedTools, setSelectedTools] = useState<string[]>(agent?.tools.map((t) => t.id) ?? []);
  const [saving, setSaving] = useState(false);

  const toggleTool = (id: string) =>
    setSelectedTools((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave({
        name,
        role,
        system_prompt: systemPrompt,
        model,
        memory_enabled: memoryEnabled,
        schedule_cron: scheduleCron || null,
        guardrails: {
          max_tokens: maxTokens || undefined,
          banned_topics: bannedTopics.split(",").map((s) => s.trim()).filter(Boolean),
        },
        tool_ids: selectedTools,
        channel_ids: agent?.channels.map((c) => c.id) ?? [],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">{agent ? "Edit Agent" : "New Agent"}</h2>

      <label className="block">
        <span className="text-sm text-gray-400">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full bg-gray-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-500" />
      </label>

      <label className="block">
        <span className="text-sm text-gray-400">Role</span>
        <input value={role} onChange={(e) => setRole(e.target.value)}
          className="mt-1 w-full bg-gray-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-500" />
      </label>

      <label className="block">
        <span className="text-sm text-gray-400">Model</span>
        <ModelCombobox
          value={model}
          onChange={setModel}
          models={config.models}
          className="mt-1"
        />
      </label>

      <label className="block">
        <span className="text-sm text-gray-400">System Prompt</span>
        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={4}
          className="mt-1 w-full bg-gray-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-500 resize-none" />
      </label>

      <div>
        <span className="text-sm text-gray-400 block mb-2">Tools</span>
        <div className="flex flex-wrap gap-2">
          {tools.map((t) => (
            <button key={t.id} type="button" onClick={() => toggleTool(t.id)}
              className={`px-3 py-1 rounded text-xs border transition ${selectedTools.includes(t.id)
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "bg-gray-800 border-gray-700 text-gray-400"}`}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={memoryEnabled} onChange={(e) => setMemoryEnabled(e.target.checked)}
          className="rounded" />
        <span className="text-sm text-gray-400">Enable memory</span>
      </label>

      <label className="block">
        <span className="text-sm text-gray-400">Schedule (cron, optional)</span>
        <input value={scheduleCron} onChange={(e) => setScheduleCron(e.target.value)}
          placeholder="e.g. 0 9 * * 1"
          className="mt-1 w-full bg-gray-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-500" />
      </label>

      <div className="border-t border-gray-800 pt-4">
        <span className="text-sm text-gray-400 font-semibold block mb-2">Guardrails</span>
        <label className="block mb-2">
          <span className="text-xs text-gray-500">Max output tokens (0 = no limit)</span>
          <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} min={0}
            className="mt-1 w-full bg-gray-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-500" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Banned topics (comma-separated)</span>
          <input value={bannedTopics} onChange={(e) => setBannedTopics(e.target.value)}
            placeholder="violence, spam"
            className="mt-1 w-full bg-gray-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-500" />
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={handleSubmit} disabled={saving || !name}
          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel}
          className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-semibold transition">
          Cancel
        </button>
      </div>
    </div>
  );
}
