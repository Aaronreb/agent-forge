"use client";
import { useEffect, useState } from "react";
import { Node } from "@xyflow/react";
import { api, Agent, StartNodeConfig, RouterNodeConfig } from "@/lib/api";

const MODELS = ["gpt-4o", "gpt-4o-mini", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

const NODE_TYPE_LABELS: Record<string, string> = {
  startNode: "Start",
  agentNode: "Agent",
  routerNode: "Condition",
  endNode: "End",
};

interface Props {
  node: Node | null;
  nodeType: string;
  onDataChange: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export default function NodeConfigPanel({ node, nodeType, onDataChange, onDeleteNode, onClose }: Props) {
  const resolvedType = nodeType;
  const [agentDetail, setAgentDetail] = useState<Agent | null>(null);

  useEffect(() => {
    setAgentDetail(null);
    if (resolvedType === "agentNode") {
      const agentId = (node?.data as { agentId?: string | null }).agentId;
      if (agentId) {
        api.getAgent(agentId).then(setAgentDetail).catch(() => null);
      }
    }
  }, [node?.id, resolvedType]);

  if (!node) return null;

  const cfg = (node.data as { config?: Record<string, unknown> }).config ?? {};
  const typeLabel = NODE_TYPE_LABELS[resolvedType] ?? (resolvedType || "Node");

  const updateConfig = (patch: Record<string, unknown>) => {
    onDataChange(node.id, { config: { ...cfg, ...patch } });
  };

  return (
    <div className="w-72 min-w-[288px] bg-gray-900 border-l border-gray-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-sm font-semibold text-gray-200">{typeLabel} Config</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {resolvedType === "startNode" && (
          <StartConfig
            nodeId={node.id}
            cfg={cfg as unknown as StartNodeConfig}
            onSave={updateConfig}
          />
        )}
        {resolvedType === "agentNode" && (
          <AgentConfig node={node} agentDetail={agentDetail} />
        )}
        {resolvedType === "routerNode" && (
          <RouterConfig
            nodeId={node.id}
            cfg={cfg as unknown as RouterNodeConfig}
            onSave={updateConfig}
          />
        )}
        {resolvedType === "endNode" && (
          <p className="text-xs text-gray-500">
            End nodes mark the termination of a workflow path. No configuration needed.
          </p>
        )}
      </div>

      {/* Footer — delete button */}
      <div className="px-4 py-3 border-t border-gray-800">
        <button
          onClick={() => onDeleteNode(node.id)}
          className="w-full px-3 py-2 bg-red-900/40 hover:bg-red-900/70 border border-red-800 hover:border-red-600 text-red-400 hover:text-red-300 rounded-lg text-xs font-medium transition"
        >
          Remove node
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Start node config — trigger type + optional cron
// Uses local state so selects don't re-render during edits; propagates on change
// ---------------------------------------------------------------------------
function StartConfig({
  nodeId,
  cfg,
  onSave,
}: {
  nodeId: string;
  cfg: StartNodeConfig;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [triggerType, setTriggerType] = useState<string>(cfg.trigger_type ?? "manual");
  const [cron, setCron] = useState<string>(cfg.cron ?? "");

  // Sync when a different node is selected
  useEffect(() => {
    setTriggerType(cfg.trigger_type ?? "manual");
    setCron(cfg.cron ?? "");
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTriggerChange = (val: string) => {
    setTriggerType(val);
    onSave({ trigger_type: val, cron });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs text-gray-400 block mb-1">Trigger type</label>
        <select
          value={triggerType}
          onChange={(e) => handleTriggerChange(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:ring-2 ring-green-500"
        >
          <option value="manual">Manual</option>
          <option value="schedule">Schedule (cron)</option>
          <option value="webhook">Webhook</option>
        </select>
      </div>

      {triggerType === "schedule" && (
        <div>
          <label className="text-xs text-gray-400 block mb-1">Cron expression</label>
          <input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            onBlur={() => onSave({ trigger_type: triggerType, cron })}
            placeholder="e.g. 0 9 * * 1-5"
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:ring-2 ring-green-500 font-mono"
          />
          <p className="text-xs text-gray-500 mt-1">Standard 5-field cron syntax</p>
        </div>
      )}

      {triggerType === "webhook" && (
        <p className="text-xs text-gray-500">
          This workflow will be triggered via an incoming webhook POST request.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent node config — read-only view of the linked agent record
// ---------------------------------------------------------------------------
function AgentConfig({ node, agentDetail }: { node: Node; agentDetail: Agent | null }) {
  const d = node.data as { label?: string; agentId?: string | null; agentEmoji?: string | null };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {d.agentEmoji && <span className="text-2xl">{d.agentEmoji}</span>}
        <div>
          <div className="text-sm font-semibold text-white">{d.label ?? "—"}</div>
          <div className="text-xs text-gray-500">agent</div>
        </div>
      </div>

      {!d.agentId && (
        <div className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800/50 rounded px-2 py-1.5">
          No agent assigned — drag an agent from the palette
        </div>
      )}

      {d.agentId && !agentDetail && (
        <div className="text-xs text-gray-500 animate-pulse">Loading agent details…</div>
      )}

      {agentDetail && (
        <>
          <div>
            <div className="text-xs text-gray-400 font-medium mb-1">System prompt</div>
            <textarea
              readOnly
              value={agentDetail.system_prompt || "(none)"}
              rows={5}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 resize-none outline-none font-mono"
            />
          </div>
          <div>
            <div className="text-xs text-gray-400 font-medium mb-1">Model</div>
            <div className="text-xs text-gray-300 bg-gray-800 border border-gray-700 rounded px-2 py-1.5">
              {agentDetail.model}
            </div>
          </div>
          {agentDetail.tools.length > 0 ? (
            <div>
              <div className="text-xs text-gray-400 font-medium mb-1">Tools</div>
              <div className="flex flex-wrap gap-1">
                {agentDetail.tools.map((t) => (
                  <span key={t.name} className="text-xs bg-indigo-900/60 text-indigo-300 border border-indigo-800/60 px-2 py-0.5 rounded-full">
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">No tools assigned</div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Router node config — prompt textarea + model picker
// Uses local state for the textarea so typing doesn't re-render the whole tree.
// Saves to parent state on blur (textarea) or on change (select).
// ---------------------------------------------------------------------------
function RouterConfig({
  nodeId,
  cfg,
  onSave,
}: {
  nodeId: string;
  cfg: RouterNodeConfig;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [prompt, setPrompt] = useState<string>((cfg.routing_prompt ?? cfg.router_prompt ?? "") as string);
  const [model, setModel] = useState<string>((cfg.router_model ?? "gpt-4o-mini") as string);

  // Sync when a different node is selected
  useEffect(() => {
    setPrompt((cfg.routing_prompt ?? cfg.router_prompt ?? "") as string);
    setModel((cfg.router_model ?? "gpt-4o-mini") as string);
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModelChange = (val: string) => {
    setModel(val);
    onSave({ routing_prompt: prompt, router_model: val });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs text-gray-400 font-medium block mb-1">Routing prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => onSave({ routing_prompt: prompt, router_model: model })}
          rows={6}
          placeholder="Based on the previous agent's output, decide which agent should handle the next step. Reply with only the routing keyword."
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white resize-none outline-none focus:ring-2 ring-amber-500"
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 font-medium block mb-1">LLM model</label>
        <select
          value={model}
          onChange={(e) => handleModelChange(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:ring-2 ring-amber-500"
        >
          {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="bg-gray-800/60 border border-gray-700 rounded px-3 py-2">
        <div className="text-xs text-gray-400 font-medium mb-1">How routing works</div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Set each outbound edge label to a keyword your router prompt will return (e.g. "billing", "support"). The first edge whose label appears in the router's reply wins.
        </p>
      </div>
    </div>
  );
}
