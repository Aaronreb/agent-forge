"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { RouterNodeConfig } from "@/lib/api";

export interface RouterNodeData {
  label: string;
  config: RouterNodeConfig;
  [key: string]: unknown;
}

export default function RouterNode({ data, selected }: NodeProps) {
  const d = data as RouterNodeData;
  const model = d.config?.router_model ?? "gpt-4o";
  return (
    <div
      className={`bg-gray-900 border-2 rounded-xl px-4 py-3 min-w-[140px] text-center shadow-lg transition ${
        selected ? "border-amber-400" : "border-amber-600"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />
      <div className="text-xs font-bold text-amber-400 mb-1">◆ CONDITION</div>
      <div className="font-semibold text-sm text-white">{d.label}</div>
      <div className="text-xs text-gray-400 mt-1">{model}</div>
      <Handle type="source" position={Position.Right} className="!bg-amber-500" />
    </div>
  );
}
