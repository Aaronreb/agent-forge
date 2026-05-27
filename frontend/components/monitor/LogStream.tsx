"use client";
import { useLogStream } from "@/lib/ws";

const TYPE_COLORS: Record<string, string> = {
  run_start: "text-green-400",
  run_done: "text-green-300",
  run_error: "text-red-400",
  agent_start: "text-indigo-400",
  agent_done: "text-indigo-300",
  guardrail: "text-yellow-400",
};

export default function LogStream({ runId }: { runId: string }) {
  const events = useLogStream(runId) as Array<Record<string, unknown>>;

  if (!events.length) {
    return <p className="text-gray-500 text-sm text-center py-6">Waiting for events…</p>;
  }

  return (
    <div className="font-mono text-xs space-y-1 max-h-72 overflow-y-auto pr-2">
      {events.map((ev, i) => {
        const type = String(ev.type ?? "event");
        const color = TYPE_COLORS[type] ?? "text-gray-400";
        return (
          <div key={i} className={`flex gap-2 ${color}`}>
            <span className="shrink-0 text-gray-600">[{type}]</span>
            {ev.agent != null && <span className="text-white shrink-0">{String(ev.agent)}</span>}
            {ev.content != null && <span className="truncate">{String(ev.content)}</span>}
            {ev.tokens != null && <span className="text-gray-500 shrink-0">{String(ev.tokens)}tok</span>}
            {ev.error != null && <span className="text-red-300">{String(ev.error)}</span>}
          </div>
        );
      })}
    </div>
  );
}
