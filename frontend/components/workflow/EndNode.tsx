"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";

export default function EndNode({ data, selected }: NodeProps) {
  const label = (data as { label?: string }).label ?? "End";
  return (
    <div
      className={`bg-gray-900 border-2 rounded-xl px-4 py-3 min-w-[140px] text-center shadow-lg transition ${
        selected ? "border-red-400" : "border-red-700"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-red-500" />
      <div className="text-xs font-bold text-red-400 mb-1">⏹ END</div>
      <div className="font-semibold text-sm text-white">{label}</div>
    </div>
  );
}
