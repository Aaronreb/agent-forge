"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { api, Run, Workflow } from "@/lib/api";
import LogStream from "@/components/monitor/LogStream";
import MessageTimeline from "@/components/monitor/MessageTimeline";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400",
  running: "text-blue-400",
  done: "text-green-400",
  failed: "text-red-400",
};

export default function MonitorPage() {
  const params = useSearchParams();
  const workflowIdParam = params.get("workflow") ?? "";

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>("");
  const [workflowId, setWorkflowId] = useState(workflowIdParam);
  const [inputText, setInputText] = useState("");
  const [launching, setLaunching] = useState(false);

  const loadRuns = async () => {
    const r = await api.listRuns().catch(() => []);
    setRuns(r);
  };

  useEffect(() => {
    api.listWorkflows().then(setWorkflows);
    loadRuns();
    const iv = setInterval(loadRuns, 5000);
    return () => clearInterval(iv);
  }, []);

  const launch = async () => {
    if (!workflowId) return;
    setLaunching(true);
    try {
      const run = await api.createRun({ workflow_id: workflowId, input_text: inputText });
      setSelectedRun(run.id);
      loadRuns();
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">Monitor</h1>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="font-semibold mb-3 text-gray-300">Launch a Run</h2>
          <div className="flex flex-col gap-3">
            <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}
              className="bg-gray-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-500">
              <option value="">Select workflow…</option>
              {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input value={inputText} onChange={(e) => setInputText(e.target.value)}
              placeholder="Input text / message for the workflow"
              className="bg-gray-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-500" />
            <button onClick={launch} disabled={launching || !workflowId}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition self-start">
              {launching ? "Launching…" : "Launch"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run list */}
        <div className="lg:col-span-1">
          <h2 className="font-semibold mb-3 text-gray-300">Recent Runs</h2>
          <div className="space-y-2">
            {runs.map((r) => (
              <button key={r.id} onClick={() => setSelectedRun(r.id)}
                className={`w-full text-left bg-gray-900 border rounded-lg px-3 py-2 text-sm transition ${
                  selectedRun === r.id ? "border-indigo-500" : "border-gray-800 hover:border-gray-600"
                }`}>
                <div className="flex justify-between">
                  <span className="font-mono text-xs text-gray-500">{r.id.slice(0, 8)}</span>
                  <span className={`text-xs font-semibold ${STATUS_COLORS[r.status] ?? "text-gray-400"}`}>
                    {r.status}
                  </span>
                </div>
                <div className="text-gray-400 text-xs mt-1 truncate">{r.input_text || "(no input)"}</div>
                <div className="text-gray-600 text-xs mt-0.5">{r.trigger} · {new Date(r.started_at).toLocaleString()}</div>
              </button>
            ))}
            {runs.length === 0 && <p className="text-gray-500 text-sm">No runs yet.</p>}
          </div>
        </div>

        {/* Run detail */}
        <div className="lg:col-span-2 space-y-6">
          {selectedRun ? (
            <>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="font-semibold mb-3 text-gray-300">Live Event Stream</h2>
                <LogStream runId={selectedRun} />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="font-semibold mb-3 text-gray-300">Message History</h2>
                <MessageTimeline runId={selectedRun} />
              </div>
            </>
          ) : (
            <div className="text-gray-500 text-center py-20">Select a run to view details</div>
          )}
        </div>
      </div>
    </div>
  );
}
