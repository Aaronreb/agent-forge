"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";

export interface AgentNodeData {
  label: string;
  agentId?: string | null;
  agentEmoji?: string | null;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export default function AgentNode({ data, selected }: NodeProps) {
  const d = data as AgentNodeData;
  return (
    <div
      className={`bg-gray-900 border-2 rounded-xl px-4 py-3 min-w-[140px] text-center shadow-lg transition ${
        selected ? "border-indigo-500" : "border-gray-700"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-indigo-500" />
      <div className="text-xs text-gray-500 mb-1">agent</div>
      <div className="font-semibold text-sm text-white">
        {d.agentEmoji ? `${d.agentEmoji} ` : ""}{d.label}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-indigo-500" />
    </div>
  );
}
