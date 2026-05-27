"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { StartNodeConfig } from "@/lib/api";

export interface StartNodeData {
  label: string;
  config: StartNodeConfig;
  [key: string]: unknown;
}

export default function StartNode({ data, selected }: NodeProps) {
  const d = data as StartNodeData;
  const triggerType = d.config?.trigger_type ?? "manual";
  return (
    <div
      className={`bg-gray-900 border-2 rounded-xl px-4 py-3 min-w-[140px] text-center shadow-lg transition ${
        selected ? "border-green-400" : "border-green-600"
      }`}
    >
      <div className="text-xs font-bold text-green-400 mb-1">▶ START</div>
      <div className="font-semibold text-sm text-white">{d.label}</div>
      <div className="text-xs text-gray-400 mt-1">{triggerType}</div>
      <Handle type="source" position={Position.Right} className="!bg-green-500" />
    </div>
  );
}
