"use client";
import { useEffect, useState } from "react";
import { api, Message } from "@/lib/api";

const ROLE_COLORS: Record<string, string> = {
  human: "bg-gray-800 text-gray-200",
  assistant: "bg-indigo-900/40 text-indigo-100",
  tool: "bg-yellow-900/30 text-yellow-200",
};

export default function MessageTimeline({ runId }: { runId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!runId) return;
    const poll = async () => {
      const msgs = await api.getRunMessages(runId).catch(() => []);
      setMessages(msgs);
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, [runId]);

  if (!messages.length) {
    return <p className="text-gray-500 text-sm text-center py-6">No messages yet.</p>;
  }

  const totalTokens = messages.reduce((s, m) => s + m.tokens_used, 0);
  const totalCost = messages.reduce((s, m) => s + m.cost_usd, 0);

  return (
    <div>
      <div className="flex gap-6 text-xs text-gray-500 mb-3">
        <span>Total tokens: <span className="text-white">{totalTokens}</span></span>
        <span>Est. cost: <span className="text-white">${totalCost.toFixed(4)}</span></span>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
        {messages.map((m) => (
          <div key={m.id} className={`rounded-lg px-3 py-2 text-sm ${ROLE_COLORS[m.role] ?? "bg-gray-800"}`}>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{m.role}{m.from_agent_id ? ` · agent ${m.from_agent_id.slice(0, 8)}` : ""}</span>
              <span>{new Date(m.created_at).toLocaleTimeString()}</span>
            </div>
            <div className="whitespace-pre-wrap break-words">{m.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
