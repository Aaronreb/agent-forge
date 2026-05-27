"use client";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  OnNodesChange,
  OnEdgesChange,
  Connection,
  Edge,
  Node,
  NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback } from "react";
import AgentNode from "./AgentNode";
import RouterNode from "./RouterNode";
import StartNode from "./StartNode";
import EndNode from "./EndNode";
import ConditionEdge from "./ConditionEdge";
import { Agent } from "@/lib/api";

const nodeTypes = {
  startNode: StartNode,
  agentNode: AgentNode,
  routerNode: RouterNode,
  endNode: EndNode,
};
const edgeTypes = { conditionEdge: ConditionEdge };

export function getDefaultNodeData(nodeType: string, agentRaw?: string): Record<string, unknown> {
  if (nodeType === "startNode") {
    return { nodeType, label: "Start", config: { trigger_type: "manual", cron: "" } };
  }
  if (nodeType === "routerNode") {
    return { nodeType, label: "Condition", config: { router_prompt: "", router_model: "gpt-4o" } };
  }
  if (nodeType === "endNode") {
    return { nodeType, label: "End", config: {} };
  }
  // agentNode
  const agent: Agent | null = agentRaw ? JSON.parse(agentRaw) : null;
  return {
    nodeType,
    label: agent?.name ?? "Agent",
    agentId: agent?.id ?? null,
    agentEmoji: agent?.emoji ?? null,
    config: {},
  };
}

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (params: Connection) => void;
  onNodeAdded: (node: Node) => void;
  onNodeSelect: (node: Node | null) => void;
}

// Inner component has access to useReactFlow (must be inside ReactFlowProvider)
function WorkflowCanvasInner({
  nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeAdded, onNodeSelect,
}: Props) {
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData("nodeType");
      if (!nodeType) return;
      const agentRaw = e.dataTransfer.getData("agentData") || undefined;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const newNode: Node = {
        id: crypto.randomUUID(),
        type: nodeType,
        position,
        data: getDefaultNodeData(nodeType, agentRaw),
      };
      onNodeAdded(newNode);
    },
    [screenToFlowPosition, onNodeAdded]
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => { onNodeSelect(node); },
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  return (
    <div className="flex-1 min-w-0 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode="Delete"
        fitView
      >
        <Background color="#374151" gap={20} />
        <Controls />
        <MiniMap nodeColor="#4f46e5" maskColor="rgba(0,0,0,0.7)" />
      </ReactFlow>
    </div>
  );
}

export default function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
