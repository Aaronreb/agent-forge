"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, Workflow } from "@/lib/api";
import WorkflowGraphPreview from "@/components/workflow/WorkflowGraphPreview";

const NODE_TYPE_COLORS: Record<string, string> = {
  trigger: "text-green-400",
  compiled_agent: "text-indigo-400",
  router_prompt: "text-amber-400",
  end: "text-red-400",
};

export default function WorkflowsPage() {
  const searchParams = useSearchParams();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [initialised, setInitialised] = useState(false);

  const load = async () => {
    const wf = await api.listWorkflows();
    setWorkflows(wf);
    if (!initialised) {
      const selectId = searchParams.get("selected");
      if (selectId) setSelected(wf.find((w) => w.id === selectId) ?? null);
      setInitialised(true);
    } else if (selected) {
      setSelected(wf.find((w) => w.id === selected.id) ?? null);
    }
  };

  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm("Delete this workflow?")) return;
    await api.deleteWorkflow(id);
    if (selected?.id === id) setSelected(null);
    load();
  };

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workflows</h1>
        <Link
          href="/workflows/new"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition"
        >
          + New Workflow
        </Link>
      </div>

      <div className="flex flex-1 gap-4 min-h-0" style={{ minHeight: 500 }}>
        {/* Left: workflow list */}
        <div className="w-80 min-w-[288px] flex flex-col gap-2 overflow-y-auto">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">Your Workflows</h2>
          {workflows.length === 0 && (
            <p className="text-gray-500 text-sm py-8 text-center">No workflows yet. Create one to get started.</p>
          )}
          {workflows.map((wf) => (
            <button
              key={wf.id}
              onClick={() => setSelected(wf.id === selected?.id ? null : wf)}
              className={`w-full text-left bg-gray-900 rounded-xl px-4 py-3 border transition ${
                selected?.id === wf.id
                  ? "border-indigo-500 ring-1 ring-indigo-500"
                  : "border-gray-800 hover:border-gray-600"
              }`}
            >
              <div className="font-semibold text-sm">{wf.name}</div>
              {wf.description && (
                <div className="text-gray-400 text-xs mt-0.5 truncate">{wf.description}</div>
              )}
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {wf.nodes.map((n) => (
                  <span
                    key={n.id}
                    className={`text-xs font-mono ${NODE_TYPE_COLORS[n.type] ?? "text-gray-400"}`}
                  >
                    {(n.config as { label?: string })?.label ?? n.type}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Link
                  href={`/workflows/${wf.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition"
                >
                  Edit
                </Link>
                <Link
                  href={`/monitor?workflow=${wf.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-2.5 py-1 bg-indigo-900/60 hover:bg-indigo-800 rounded text-xs transition"
                >
                  Run
                </Link>
                <button
                  onClick={(e) => { e.stopPropagation(); del(wf.id); }}
                  className="px-2.5 py-1 bg-red-900/60 hover:bg-red-800 rounded text-xs transition"
                >
                  Delete
                </button>
              </div>
            </button>
          ))}
        </div>

        {/* Right: graph preview */}
        <div className="flex-1 min-w-0 rounded-xl border border-gray-800 overflow-hidden bg-gray-950">
          {selected ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
                <div>
                  <div className="font-semibold text-sm">{selected.name}</div>
                  {selected.description && (
                    <div className="text-gray-400 text-xs mt-0.5">{selected.description}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/workflows/${selected.id}`}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/monitor?workflow=${selected.id}`}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-medium transition"
                  >
                    Run
                  </Link>
                </div>
              </div>
              <div className="flex-1">
                <WorkflowGraphPreview workflow={selected} />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-600 text-sm">
              Select a workflow to preview its graph
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
