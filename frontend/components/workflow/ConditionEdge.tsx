"use client";
import { EdgeProps, getBezierPath, EdgeLabelRenderer, BaseEdge } from "@xyflow/react";

export default function ConditionEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const label = (data as { condition?: string; label?: string })?.label || (data as { condition?: string })?.condition || "";

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: "#6366f1", strokeWidth: 2 }} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
            className="absolute bg-gray-800 text-indigo-300 text-xs px-2 py-0.5 rounded border border-indigo-800 pointer-events-none"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
