"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Node, Edge, Connection,
  applyNodeChanges, applyEdgeChanges, addEdge,
  OnNodesChange, OnEdgesChange,
} from "@xyflow/react";
import { api, Agent, Workflow, CanvasNode, CanvasEdge } from "@/lib/api";
import WorkflowCanvas from "@/components/workflow/WorkflowCanvas";
import NodePalette from "@/components/workflow/NodePalette";
import NodeConfigPanel from "@/components/workflow/NodeConfigPanel";

// Maps the JSONB type field → React Flow visual node type
const SAVE_TO_REACT: Record<string, string> = {
  trigger: "startNode",
  compiled_agent: "agentNode",
  router_prompt: "routerNode",
  end: "endNode",
};

// Maps React Flow visual node type → JSONB type field
const REACT_TO_SAVE: Record<string, string> = {
  startNode: "trigger",
  agentNode: "compiled_agent",
  routerNode: "router_prompt",
  endNode: "end",
};

// Auto-layout: BFS from trigger node, left-to-right by depth
function computePositions(
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const outEdges = new Map<string, string[]>();
  for (const e of edges) {
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    outEdges.get(e.source)!.push(e.target);
  }

  const startNode = nodes.find((n) => n.type === "trigger") ?? nodes[0];
  if (!startNode) return positions;

  const queue: { id: string; depth: number }[] = [{ id: startNode.id, depth: 0 }];
  const depthCount = new Map<number, number>();
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const count = depthCount.get(depth) ?? 0;
    positions.set(id, { x: depth * 260, y: count * 130 });
    depthCount.set(depth, count + 1);

    for (const target of outEdges.get(id) ?? []) {
      if (!visited.has(target)) queue.push({ id: target, depth: depth + 1 });
    }
  }

  // Place any isolated nodes below the graph
  let iso = 0;
  for (const n of nodes) {
    if (!positions.has(n.id)) {
      positions.set(n.id, { x: 0, y: ((depthCount.get(0) ?? 0) + iso) * 130 });
      iso++;
    }
  }

  return positions;
}

interface Props {
  workflow?: Workflow;
}

export default function WorkflowEditor({ workflow }: Props) {
  const router = useRouter();
  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listAgents().then(setAgents);
  }, []);

  // Restore canvas from saved JSONB when editing an existing workflow
  useEffect(() => {
    if (!workflow) return;

    const positions = computePositions(workflow.nodes, workflow.edges);

    setNodes(
      workflow.nodes.map((n) => {
        const pos = positions.get(n.id) ?? { x: 0, y: 0 };
        const reactType = SAVE_TO_REACT[n.type] ?? "agentNode";
        const cfg = n.config ?? {};

        let data: Record<string, unknown>;

        if (n.type === "compiled_agent") {
          data = {
            nodeType: reactType,
            label: (cfg.label as string) ?? "Agent",
            agentId: cfg.agent_db_id ?? null,
            agentName: null,
            agentEmoji: null,
            config: {},
          };
        } else if (n.type === "trigger") {
          data = { nodeType: reactType, label: "Start", config: cfg };
        } else if (n.type === "router_prompt") {
          data = { nodeType: reactType, label: "Router", config: cfg };
        } else {
          // end node
          data = { nodeType: reactType, label: "End", config: {} };
        }

        return { id: n.id, type: reactType, position: pos, data };
      })
    );

    setEdges(
      workflow.edges.map((e) => ({
        id: `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        type: "conditionEdge",
        data: { condition: e.condition_value ?? "", label: "" },
      }))
    );
  }, [workflow]);

  // Enrich agent nodes with emoji/name once agents list is loaded
  useEffect(() => {
    if (!agents.length) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.type !== "agentNode") return n;
        const agentId = (n.data as { agentId?: string }).agentId;
        if (!agentId) return n;
        const agent = agents.find((a) => a.id === agentId);
        if (!agent) return n;
        return {
          ...n,
          data: {
            ...n.data,
            label: agent.name,
            agentName: agent.name,
            agentEmoji: agent.emoji ?? null,
          },
        };
      })
    );
  }, [agents]);

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    const removals = changes.filter((c) => c.type === "remove").map((c) => (c as { id: string }).id);
    if (removals.length > 0) {
      setSelectedNode((sel) => (sel && removals.includes(sel.id) ? null : sel));
      setEdges((eds) => eds.filter((e) => !removals.includes(e.source) && !removals.includes(e.target)));
    }
  }, []);

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) =>
      addEdge({ ...params, type: "conditionEdge", data: { condition: "" } }, eds)
    );
  }, []);

  const onNodeAdded = useCallback((node: Node) => {
    setNodes((nds) => [...nds, node]);
    setSelectedNode(node);
  }, []);

  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;

  const handleNodeSelect = useCallback((node: Node | null) => {
    if (node) {
      const fresh = nodesRef.current.find((n) => n.id === node.id);
      setSelectedNode(fresh ?? node);
    } else {
      setSelectedNode(null);
    }
  }, []);

  const handleNodeDataChange = useCallback((nodeId: string, newData: Record<string, unknown>) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n))
    );
    setSelectedNode((prev) =>
      prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev
    );
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // Derive semantic CanvasNode[] from React Flow state — no positions stored
      const canvasNodes: CanvasNode[] = nodes.map((n) => {
        const saveType = REACT_TO_SAVE[n.type ?? ""] ?? "compiled_agent";
        const d = n.data as Record<string, unknown>;

        let config: Record<string, unknown> = {};

        if (saveType === "trigger") {
          config = (d.config as Record<string, unknown>) ?? {};
        } else if (saveType === "compiled_agent") {
          config = { agent_db_id: d.agentId ?? null, label: d.label ?? "" };
        } else if (saveType === "router_prompt") {
          const cfg = (d.config as Record<string, unknown>) ?? {};
          config = {
            routing_prompt: cfg.router_prompt ?? cfg.routing_prompt ?? "",
            router_model: cfg.router_model ?? "gpt-4o-mini",
          };
        }

        return { id: n.id, type: saveType as CanvasNode["type"], config };
      });

      // Derive CanvasEdge[] — only include condition_value when non-empty
      const canvasEdges: CanvasEdge[] = edges.map((e) => {
        const condition = (e.data as { condition?: string })?.condition ?? "";
        const edge: CanvasEdge = { source: e.source, target: e.target };
        if (condition) edge.condition_value = condition;
        return edge;
      });

      const payload = { name, description, nodes: canvasNodes, edges: canvasEdges };

      let savedId: string;
      if (workflow) {
        const updated = await api.updateWorkflow(workflow.id, payload);
        savedId = updated.id;
      } else {
        const created = await api.createWorkflow(payload);
        savedId = created.id;
      }
      router.push(`/workflows?selected=${savedId}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workflow name"
          className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-500"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-500"
        />
      </div>

      <div
        className="flex flex-1 gap-0 rounded-xl overflow-hidden border border-gray-800"
        style={{ minHeight: 560 }}
      >
        <NodePalette agents={agents} />
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeAdded={onNodeAdded}
          onNodeSelect={handleNodeSelect}
        />
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            nodeType={((selectedNode.data as { nodeType?: string })?.nodeType ?? selectedNode.type ?? "") as string}
            onDataChange={handleNodeDataChange}
            onDeleteNode={handleDeleteNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      <div className="text-xs text-gray-500">
        Drag node types or agents from the left palette · Connect handles to wire them · Edge labels become routing conditions · Select a node and press Delete to remove it
      </div>

      <div className="flex gap-3">
        <button
          onClick={save}
          disabled={saving || !name}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition"
        >
          {saving ? "Saving…" : "Save Workflow"}
        </button>
        <button
          onClick={() => router.push("/workflows")}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-semibold transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
