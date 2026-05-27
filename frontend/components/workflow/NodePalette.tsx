"use client";
import { Agent } from "@/lib/api";

interface Props {
  agents: Agent[];
}

const NODE_TYPES = [
  { type: "startNode", icon: "▶", label: "Start", color: "border-green-600 text-green-400 hover:border-green-400" },
  { type: "routerNode", icon: "◆", label: "Condition", color: "border-amber-600 text-amber-400 hover:border-amber-400" },
  { type: "endNode", icon: "⏹", label: "End", color: "border-red-700 text-red-400 hover:border-red-500" },
];

export default function NodePalette({ agents }: Props) {
  const onDragStart = (e: React.DragEvent, nodeType: string, agent?: Agent) => {
    e.dataTransfer.setData("nodeType", nodeType);
    if (agent) e.dataTransfer.setData("agentData", JSON.stringify(agent));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-52 min-w-[208px] bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-3 py-4 flex flex-col gap-2">
        <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">Node Types</div>
        {NODE_TYPES.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            className={`flex items-center gap-2 px-3 py-2 bg-gray-800 border rounded-lg cursor-grab active:cursor-grabbing text-sm font-medium select-none transition ${item.color}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}

        {agents.length > 0 && (
          <>
            <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider mt-3 mb-1">Agents</div>
            {agents.map((a) => (
              <div
                key={a.id}
                draggable
                onDragStart={(e) => onDragStart(e, "agentNode", a)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-indigo-700 hover:border-indigo-400 rounded-lg cursor-grab active:cursor-grabbing text-sm font-medium text-indigo-300 select-none transition"
              >
                <span>{a.emoji ?? "🤖"}</span>
                <span className="truncate">{a.name}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
