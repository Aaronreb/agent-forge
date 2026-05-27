"use client";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Workflow, CanvasNode, CanvasEdge } from "@/lib/api";
import StartNode from "./StartNode";
import AgentNode from "./AgentNode";
import RouterNode from "./RouterNode";
import EndNode from "./EndNode";
import ConditionEdge from "./ConditionEdge";

const nodeTypes = {
  startNode: StartNode,
  agentNode: AgentNode,
  routerNode: RouterNode,
  endNode: EndNode,
};
const edgeTypes = { conditionEdge: ConditionEdge };

const SAVE_TO_REACT: Record<string, string> = {
  trigger: "startNode",
  compiled_agent: "agentNode",
  router_prompt: "routerNode",
  end: "endNode",
};

// BFS layout matching the editor's computePositions
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
  workflow: Workflow;
}

export default function WorkflowGraphPreview({ workflow }: Props) {
  const positions = computePositions(workflow.nodes, workflow.edges);

  const nodes: Node[] = workflow.nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    const cfg = n.config ?? {};
    return {
      id: n.id,
      type: SAVE_TO_REACT[n.type] ?? "agentNode",
      position: pos,
      data: {
        label: (cfg.label as string) ?? n.type,
        agentId: cfg.agent_db_id ?? null,
        config: cfg,
      },
    };
  });

  const edges: Edge[] = workflow.edges.map((e) => ({
    id: `${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    type: "conditionEdge",
    data: { condition: e.condition_value ?? "", label: e.condition_value ?? "" },
  }));

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={true}
        panOnScroll={false}
        fitView
        fitViewOptions={{ padding: 0.3 }}
      >
        <Background color="#374151" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
