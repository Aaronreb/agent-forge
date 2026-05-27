"use client";
import { useState, useEffect, useCallback, memo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls,
  useNodesState, useEdgesState, addEdge, useReactFlow,
  Handle, Position, MarkerType,
} from "@xyflow/react";
import { api, type Playbook, type ChatSession } from "@/lib/api";
import ModelCombobox from "@/components/ModelCombobox";

const theme = {
  bg: "#0a0b0f",
  surface: "#12141a",
  surfaceHover: "#1a1d26",
  border: "#1e2130",
  borderLight: "#2a2d3e",
  accent: "#6c63ff",
  accentDim: "#6c63ff22",
  accentHover: "#8b85ff",
  green: "#22d3a0",
  greenDim: "#22d3a022",
  red: "#ff5c5c",
  redDim: "#ff5c5c22",
  yellow: "#f5c542",
  yellowDim: "#f5c54222",
  text: "#e8eaf0",
  textMuted: "#6b7280",
  textDim: "#9ca3af",
};

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap');

  body { background: ${theme.bg}; color: ${theme.text}; font-family: 'Syne', sans-serif; }

  .app { display: flex; height: 100vh; overflow: hidden; }

  .sidebar {
    width: 220px; min-width: 220px;
    background: ${theme.surface};
    border-right: 1px solid ${theme.border};
    display: flex; flex-direction: column;
    padding: 24px 0;
  }
  .logo {
    padding: 0 20px 28px;
    font-size: 18px; font-weight: 800;
    letter-spacing: -0.5px;
    display: flex; align-items: center; gap: 10px;
  }
  .logo-icon {
    width: 32px; height: 32px; border-radius: 8px;
    background: ${theme.accent};
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
  }
  .nav-section { padding: 0 12px; margin-bottom: 8px; }
  .nav-label {
    font-size: 10px; font-weight: 600; letter-spacing: 1.5px;
    color: ${theme.textMuted}; padding: 0 8px; margin-bottom: 6px;
    text-transform: uppercase;
  }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: 8px;
    cursor: pointer; font-size: 14px; font-weight: 500;
    color: ${theme.textDim}; transition: all 0.15s;
    margin-bottom: 2px;
  }
  .nav-item:hover { background: ${theme.surfaceHover}; color: ${theme.text}; }
  .nav-item.active { background: ${theme.accentDim}; color: ${theme.accent}; }
  .nav-item .icon { font-size: 16px; width: 20px; text-align: center; }

  .main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
  .topbar {
    height: 60px; min-height: 60px;
    border-bottom: 1px solid ${theme.border};
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 28px;
  }
  .page-title { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
  .topbar-actions { display: flex; gap: 10px; align-items: center; }
  .content { flex: 1; overflow-y: auto; padding: 28px; }

  .btn {
    padding: 8px 16px; border-radius: 8px; border: none;
    font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 6px;
  }
  .btn-primary { background: ${theme.accent}; color: white; }
  .btn-primary:hover { background: ${theme.accentHover}; }
  .btn-ghost { background: transparent; color: ${theme.textDim}; border: 1px solid ${theme.border}; }
  .btn-ghost:hover { background: ${theme.surfaceHover}; color: ${theme.text}; border-color: ${theme.borderLight}; }
  .btn-sm { padding: 5px 12px; font-size: 12px; }
  .btn-danger { background: ${theme.redDim}; color: ${theme.red}; border: 1px solid ${theme.red}44; }

  .card { background: ${theme.surface}; border: 1px solid ${theme.border}; border-radius: 12px; padding: 20px; }
  .card:hover { border-color: ${theme.borderLight}; }

  .agents-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .agent-card {
    background: ${theme.surface}; border: 1px solid ${theme.border};
    border-radius: 12px; padding: 20px; cursor: pointer;
    transition: all 0.2s; position: relative; overflow: hidden;
  }
  .agent-card:hover { border-color: ${theme.accent}44; transform: translateY(-1px); }
  .agent-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
  .agent-card.purple::before { background: ${theme.accent}; }
  .agent-card.green::before { background: ${theme.green}; }
  .agent-card.yellow::before { background: ${theme.yellow}; }
  .agent-card.red::before { background: ${theme.red}; }

  .agent-avatar { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 14px; }
  .agent-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .agent-role { font-size: 12px; color: ${theme.textMuted}; margin-bottom: 14px; }
  .agent-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .tag { font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 5px; font-family: 'DM Mono', monospace; }
  .tag-purple { background: ${theme.accentDim}; color: ${theme.accent}; }
  .tag-green { background: ${theme.greenDim}; color: ${theme.green}; }
  .tag-yellow { background: ${theme.yellowDim}; color: ${theme.yellow}; }
  .tag-gray { background: #1e2130; color: ${theme.textDim}; }
  .agent-actions { display: flex; gap: 8px; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 5px; }
  .status-dot.idle { background: ${theme.textMuted}; }
  .status-dot.running { background: ${theme.green}; box-shadow: 0 0 6px ${theme.green}; }

  .overlay { position: fixed; inset: 0; background: #00000088; z-index: 100; display: flex; align-items: center; justify-content: center; }
  .drawer { background: ${theme.surface}; border: 1px solid ${theme.border}; border-radius: 16px; width: 520px; max-height: 85vh; overflow-y: auto; padding: 28px; }
  .drawer-title { font-size: 18px; font-weight: 700; margin-bottom: 24px; }
  .form-group { margin-bottom: 18px; }
  .form-label { font-size: 12px; font-weight: 600; color: ${theme.textMuted}; margin-bottom: 6px; display: block; text-transform: uppercase; letter-spacing: 0.5px; }
  .form-input { width: 100%; padding: 10px 14px; border-radius: 8px; background: ${theme.bg}; border: 1px solid ${theme.border}; color: ${theme.text}; font-family: 'Syne', sans-serif; font-size: 14px; outline: none; transition: border-color 0.15s; }
  .form-input:focus { border-color: ${theme.accent}; }
  .form-textarea { resize: vertical; min-height: 90px; line-height: 1.5; }
  .form-select { width: 100%; padding: 10px 14px; border-radius: 8px; background: ${theme.bg}; border: 1px solid ${theme.border}; color: ${theme.text}; font-family: 'Syne', sans-serif; font-size: 14px; outline: none; cursor: pointer; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .tools-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tool-checkbox { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; border: 1px solid ${theme.border}; cursor: pointer; font-size: 13px; transition: all 0.15s; }
  .tool-checkbox:hover { border-color: ${theme.accent}44; }
  .tool-checkbox.checked { border-color: ${theme.accent}; background: ${theme.accentDim}; color: ${theme.accent}; }
  .drawer-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px; padding-top: 20px; border-top: 1px solid ${theme.border}; }

  .workflow-canvas { flex: 1; background: ${theme.bg}; background-image: radial-gradient(${theme.border} 1px, transparent 1px); background-size: 24px 24px; position: relative; overflow: hidden; }
  .workflow-toolbar { height: 56px; background: ${theme.surface}; border-bottom: 1px solid ${theme.border}; display: flex; align-items: center; padding: 0 20px; gap: 12px; }
  .workflow-sidebar { width: 220px; background: ${theme.surface}; border-right: 1px solid ${theme.border}; padding: 16px; overflow-y: auto; }
  .workflow-layout { display: flex; flex: 1; overflow: hidden; }
  .node-palette-item { padding: 10px 12px; border-radius: 8px; border: 1px solid ${theme.border}; margin-bottom: 8px; cursor: grab; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; transition: all 0.15s; }
  .node-palette-item:hover { border-color: ${theme.accent}44; background: ${theme.accentDim}; color: ${theme.accent}; }

  .wf-node { position: absolute; background: ${theme.surface}; border: 1.5px solid ${theme.border}; border-radius: 12px; padding: 14px 18px; min-width: 160px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 20px #00000044; transition: border-color 0.15s; }
  .wf-node:hover { border-color: ${theme.accent}; }
  .wf-node.start { border-color: ${theme.green}; }
  .wf-node.end { border-color: ${theme.red}; }
  .wf-node.condition { border-color: ${theme.yellow}; }
  .wf-node-label { font-size: 11px; color: ${theme.textMuted}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .wf-node-name { font-size: 14px; font-weight: 700; }
  .wf-node-icon { font-size: 20px; margin-bottom: 8px; }
  .canvas-svg { position: absolute; inset: 0; pointer-events: none; }

  .runs-table { width: 100%; border-collapse: collapse; }
  .runs-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid ${theme.border}; }
  .runs-table td { padding: 14px 16px; border-bottom: 1px solid ${theme.border}; font-size: 13px; }
  .runs-table tr:hover td { background: ${theme.surfaceHover}; cursor: pointer; }
  .status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .status-success { background: ${theme.greenDim}; color: ${theme.green}; }
  .status-running { background: ${theme.accentDim}; color: ${theme.accent}; }
  .status-failed { background: ${theme.redDim}; color: ${theme.red}; }

  .timeline-step { display: flex; gap: 14px; margin-bottom: 12px; align-items: flex-start; }
  .timeline-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
  .timeline-line { width: 1px; height: 24px; background: ${theme.border}; margin: 2px 0 2px 4.5px; }
  .step-card { flex: 1; background: ${theme.bg}; border: 1px solid ${theme.border}; border-radius: 8px; padding: 12px 14px; }
  .step-name { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
  .step-meta { font-size: 11px; color: ${theme.textMuted}; font-family: 'DM Mono', monospace; }

  .convo-layout { display: flex; height: 100%; gap: 0; }
  .convo-list { width: 280px; min-width: 280px; border-right: 1px solid ${theme.border}; overflow-y: auto; }
  .convo-item { padding: 14px 16px; border-bottom: 1px solid ${theme.border}; cursor: pointer; transition: background 0.1s; }
  .convo-item:hover { background: ${theme.surfaceHover}; }
  .convo-item.active { background: ${theme.accentDim}; border-right: 2px solid ${theme.accent}; }
  .convo-name { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
  .convo-preview { font-size: 12px; color: ${theme.textMuted}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .convo-time { font-size: 11px; color: ${theme.textMuted}; }

  .chat-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .chat-header { padding: 16px 20px; border-bottom: 1px solid ${theme.border}; display: flex; align-items: center; gap: 12px; }
  .chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .message { max-width: 70%; }
  .message.human { align-self: flex-end; }
  .message.agent { align-self: flex-start; }
  .message-bubble { padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
  .message.human .message-bubble { background: ${theme.accent}; color: white; border-radius: 12px 12px 2px 12px; }
  .message.agent .message-bubble { background: ${theme.surface}; border: 1px solid ${theme.border}; border-radius: 12px 12px 12px 2px; }
  .message-meta { font-size: 11px; color: ${theme.textMuted}; margin-top: 4px; }
  .agent-tag { font-size: 11px; color: ${theme.accent}; font-weight: 600; margin-bottom: 3px; }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 2px; }

  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
  .stat-card { background: ${theme.surface}; border: 1px solid ${theme.border}; border-radius: 12px; padding: 18px 20px; }
  .stat-label { font-size: 11px; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }
  .stat-value { font-size: 28px; font-weight: 800; letter-spacing: -1px; }
  .stat-sub { font-size: 12px; color: ${theme.textMuted}; margin-top: 4px; }

  .empty-state { text-align: center; padding: 60px 20px; color: ${theme.textMuted}; }
  .empty-icon { font-size: 48px; margin-bottom: 14px; }
  .empty-title { font-size: 16px; font-weight: 600; color: ${theme.textDim}; margin-bottom: 6px; }

  .chat-layout { display: flex; height: 100%; overflow: hidden; }
  .chat-sessions { width: 220px; min-width: 220px; border-right: 1px solid ${theme.border}; background: ${theme.surface}; display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
  .chat-sessions-header { padding: 12px; border-bottom: 1px solid ${theme.border}; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .chat-sessions-list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 3px; }
  .chat-session-item { padding: 9px 10px; border-radius: 7px; cursor: pointer; border: 1px solid transparent; transition: all 0.12s; }
  .chat-session-item:hover { background: ${theme.surfaceHover}; }
  .chat-session-item.active { background: ${theme.accentDim}; border-color: ${theme.accent}44; }
  .chat-left { flex: 1; display: flex; flex-direction: column; border-right: 1px solid ${theme.border}; overflow: hidden; }
  .chat-messages-area { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .chat-input-area { padding: 12px 16px; border-top: 1px solid ${theme.border}; display: flex; gap: 10px; flex-shrink: 0; }
  .chat-trace { width: 340px; background: ${theme.surface}; display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
  .trace-header { padding: 12px 16px; border-bottom: 1px solid ${theme.border}; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .trace-body { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
  .trace-agent-block { border: 1px solid ${theme.border}; border-radius: 8px; overflow: hidden; }
  .trace-agent-header { padding: 7px 12px; background: ${theme.surfaceHover}; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; }
  .trace-tool-row { padding: 6px 12px; border-top: 1px solid ${theme.border}22; font-size: 11px; font-family: 'DM Mono', monospace; }
  .trace-agent-footer { padding: 5px 12px; border-top: 1px solid ${theme.border}; font-size: 11px; color: ${theme.textMuted}; font-family: 'DM Mono', monospace; background: ${theme.surface}; display: flex; gap: 12px; }
  .trace-routing { padding: 4px 12px; font-size: 11px; color: ${theme.accent}; display: flex; align-items: center; gap: 6px; }
  .chat-source-bar { padding: 10px 20px; border-bottom: 1px solid ${theme.border}; background: ${theme.surface}; display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  .playbooks-layout { display: flex; height: 100%; overflow: hidden; }
  .playbooks-list { width: 260px; min-width: 260px; border-right: 1px solid ${theme.border}; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
  .playbook-item { padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; color: ${theme.textDim}; border: 1px solid transparent; transition: all 0.15s; }
  .playbook-item:hover { background: ${theme.surfaceHover}; color: ${theme.text}; }
  .playbook-item.active { background: ${theme.accentDim}; color: ${theme.accent}; border-color: ${theme.accent}44; }
  .playbook-item-name { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
  .playbook-item-sub { font-size: 11px; color: ${theme.textMuted}; }
  .playbook-form { flex: 1; overflow-y: auto; padding: 28px; max-width: 760px; }
  .playbook-form-title { font-size: 18px; font-weight: 700; margin-bottom: 24px; }
  .agent-check-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .radio-group { display: flex; gap: 12px; }
  .radio-option { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1px solid ${theme.border}; cursor: pointer; font-size: 13px; transition: all 0.15s; }
  .radio-option:hover { border-color: ${theme.accent}44; }
  .radio-option.selected { border-color: ${theme.accent}; background: ${theme.accentDim}; color: ${theme.accent}; }

  .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 8px; background: ${theme.bg}; border: 1px solid ${theme.border}; }
  .toggle-label { font-size: 13px; font-weight: 500; }
  .toggle { position: relative; width: 36px; height: 20px; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-slider { position: absolute; inset: 0; background: ${theme.border}; border-radius: 20px; cursor: pointer; transition: 0.2s; }
  .toggle-slider:before { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px; background: white; border-radius: 50%; transition: 0.2s; }
  .toggle input:checked + .toggle-slider { background: ${theme.accent}; }
  .toggle input:checked + .toggle-slider:before { transform: translateX(16px); }
  .section-label { font-size: 11px; font-weight: 700; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.8px; margin: 20px 0 12px; padding-bottom: 8px; border-bottom: 1px solid ${theme.border}; }
`;



function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [platformConfig, setPlatformConfig] = useState<{ models: string[]; channels: string[] }>({ models: [], channels: [] });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [testAgent, setTestAgent] = useState<any>(null);
  const [testMessage, setTestMessage] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", role: "", model: "gpt-5.4-mini-2026-03-17", channel: "None", chat_id: "", systemPrompt: "", tools: [], memory_enabled: false, memory_window_k: 5, schedule_cron: "", guardrails: { max_tokens: "", banned_topics: "" } });

  const COLORS = ["purple", "green", "yellow", "red"];
  const EMOJIS = ["🔍", "📝", "📣", "🤖", "⚡", "🧠"];
  const TOOL_NAMES = availableTools.length > 0
    ? availableTools.map((t: any) => t.name)
    : ["web_search", "summarize", "format", "send_message", "code_exec", "calculator"];

  const normalizeAgent = (a: any) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    emoji: a.emoji ?? "🤖",
    color: a.color ?? "purple",
    model: a.model,
    channel: a.channels?.[0]?.type
      ? (a.channels[0].type.charAt(0).toUpperCase() + a.channels[0].type.slice(1))
      : "None",
    chat_id: a.channels?.[0]?.config?.chat_id ?? "",
    channels_raw: a.channels ?? [],
    is_live: a.is_live ?? false,
    tools: (a.tools ?? []).map((t: any) => t.name),
    status: a.status ?? "idle",
    systemPrompt: a.system_prompt ?? "",
    memory_enabled: a.memory_enabled ?? false,
    memory_window_k: a.memory_window_k ?? 5,
    schedule_cron: a.schedule_cron ?? "",
    guardrails: {
      max_tokens: a.guardrails?.max_tokens ?? "",
      banned_topics: Array.isArray(a.guardrails?.banned_topics)
        ? a.guardrails.banned_topics.join(", ")
        : (a.guardrails?.banned_topics ?? ""),
    },
  });

  useEffect(() => {
    api.listAgents().then(data => setAgents(data.map(normalizeAgent))).catch(() => {});
    api.listTools().then(setAvailableTools).catch(() => {});
    api.getConfig().then(setPlatformConfig).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", role: "", model: "gpt-5.4-mini-2026-03-17", channel: "None", chat_id: "", systemPrompt: "", tools: [], memory_enabled: false, memory_window_k: 5, schedule_cron: "", guardrails: { max_tokens: "", banned_topics: "" } });
    setShowModal(true);
  };

  const openEdit = (agent: any) => {
    setEditing(agent);
    setForm({
      name: agent.name, role: agent.role, model: agent.model || "gpt-4o", channel: agent.channel, chat_id: agent.chat_id ?? "",
      systemPrompt: agent.systemPrompt, tools: [...agent.tools],
      memory_enabled: agent.memory_enabled ?? false,
      memory_window_k: agent.memory_window_k ?? 5,
      schedule_cron: agent.schedule_cron ?? "",
      guardrails: {
        max_tokens: agent.guardrails?.max_tokens ?? "",
        banned_topics: Array.isArray(agent.guardrails?.banned_topics)
          ? agent.guardrails.banned_topics.join(", ")
          : (agent.guardrails?.banned_topics ?? ""),
      },
    });
    setShowModal(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const toolIdMap = Object.fromEntries(availableTools.map((t: any) => [t.name, t.id]));
      const toolIds = form.tools.map((name: string) => toolIdMap[name]).filter(Boolean);
      const guardrailsPayload: Record<string, unknown> = {};
      if (form.guardrails.max_tokens !== "" && form.guardrails.max_tokens !== 0) {
        guardrailsPayload.max_tokens = Number(form.guardrails.max_tokens);
      }
      if (form.guardrails.banned_topics) {
        guardrailsPayload.banned_topics = form.guardrails.banned_topics
          .split(",").map((t: string) => t.trim()).filter(Boolean);
      }
      let channelIds: string[] = [];
      if (form.channel && form.channel !== "None") {
        const config: Record<string, string> = {};
        if (form.chat_id) config.chat_id = form.chat_id;
        const ch = await api.createChannel({ type: form.channel.toLowerCase(), config });
        channelIds = [ch.id];
      }

      const payload: any = {
        name: form.name,
        role: form.role,
        system_prompt: form.systemPrompt,
        model: form.model,
        memory_enabled: form.memory_enabled,
        memory_window_k: form.memory_window_k,
        guardrails: guardrailsPayload,
        schedule_cron: form.schedule_cron || null,
        tool_ids: toolIds,
        channel_ids: channelIds,
        emoji: editing?.emoji ?? EMOJIS[agents.length % EMOJIS.length],
        color: editing?.color ?? COLORS[agents.length % COLORS.length],
        status: editing?.status ?? "idle",
      };
      if (editing) {
        const updated = await api.updateAgent(editing.id, payload);
        setAgents(agents.map((a: any) => a.id === editing.id ? normalizeAgent(updated) : a));
      } else {
        const created = await api.createAgent(payload);
        setAgents([...agents, normalizeAgent(created)]);
      }
      setShowModal(false);
    } catch (err) {
      console.error("Failed to save agent:", err);
      alert("Failed to save agent. See console for details.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAgent = async (id: string, name: string) => {
    if (!window.confirm(`Delete agent "${name}"? This cannot be undone.`)) return;
    try {
      await api.deleteAgent(id);
      setAgents(agents.filter((a: any) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete agent:", err);
    }
  };

  const toggleTool = (tool: string) => {
    setForm((f: any) => ({ ...f, tools: f.tools.includes(tool) ? f.tools.filter((t: string) => t !== tool) : [...f.tools, tool] }));
  };

  return (
    <div>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-label">Total Agents</div><div className="stat-value" style={{color: theme.accent}}>{agents.length}</div></div>
        <div className="stat-card"><div className="stat-label">Deployed</div><div className="stat-value" style={{color: theme.green}}>{agents.filter((a: any) => a.is_live).length}</div></div>
      </div>

      <div className="agents-grid">
        {agents.map((agent: any) => (
          <div key={agent.id} className={`agent-card ${agent.color}`}>
            <div className="agent-avatar" style={{background: agent.color === "purple" ? theme.accentDim : agent.color === "green" ? theme.greenDim : agent.color === "yellow" ? theme.yellowDim : theme.redDim}}>
              {agent.emoji}
            </div>
            <div className="agent-name">{agent.name}</div>
            <div className="agent-role">{agent.role}</div>
            <div className="agent-meta">
              <span className="tag tag-gray">{agent.model}</span>
              {agent.channel !== "None" && <span className="tag tag-green">📡 {agent.channel}</span>}
              {agent.is_live
                ? <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:10,background:theme.greenDim,color:theme.green}}>🟢 Live</span>
                : <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:10,background:theme.surface,color:theme.textMuted,border:`1px solid ${theme.border}`}}>Offline</span>}
            </div>
            <div style={{fontSize:12,color:theme.textMuted,marginBottom:14}}>
              Tools: {agent.tools.map((t: string) => <span key={t} className="tag tag-purple" style={{marginRight:4}}>{t}</span>)}
            </div>
            <div className="agent-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(agent)}>✏️ Edit</button>
              <button className="btn btn-ghost btn-sm" style={{color:theme.green,borderColor:theme.green+"44"}} onClick={() => { setTestAgent(agent); setTestMessage(""); setTestResult(null); }}>▶ Test</button>
              {agent.is_live
                ? <button className="btn btn-ghost btn-sm" style={{color:theme.yellow,borderColor:theme.yellow+"44"}} onClick={async () => { const u = await api.stopAgent(agent.id); setAgents((prev: any[]) => prev.map((a: any) => a.id === agent.id ? normalizeAgent(u) : a)); }}>⏹ Stop</button>
                : <button className="btn btn-ghost btn-sm" style={{color:theme.accent,borderColor:theme.accent+"44"}} onClick={async () => { const u = await api.deployAgent(agent.id); setAgents((prev: any[]) => prev.map((a: any) => a.id === agent.id ? normalizeAgent(u) : a)); }}>🚀 Deploy</button>}
              <button className="btn btn-danger btn-sm" onClick={() => deleteAgent(agent.id, agent.name)}>🗑</button>
            </div>
          </div>
        ))}

        <div
          onClick={openCreate}
          style={{background:"transparent",border:`2px dashed ${theme.border}`,borderRadius:12,padding:20,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:200,color:theme.textMuted,transition:"all 0.2s",gap:8}}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = theme.accent; (e.currentTarget as HTMLElement).style.color = theme.accent; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = theme.border; (e.currentTarget as HTMLElement).style.color = theme.textMuted; }}
        >
          <div style={{fontSize:32}}>+</div>
          <div style={{fontSize:14,fontWeight:600}}>New Agent</div>
        </div>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-title">{editing ? "Edit Agent" : "Create New Agent"}</div>

            <div className="section-label">Identity</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Agent Name</label>
                <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. ResearchBot" />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <input className="form-input" value={form.role} onChange={e => setForm({...form, role: e.target.value})} placeholder="e.g. Web Research Specialist" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">System Prompt</label>
              <textarea className="form-input form-textarea" value={form.systemPrompt} onChange={e => setForm({...form, systemPrompt: e.target.value})} placeholder="Describe how this agent should behave..." />
            </div>

            <div className="section-label">Model & Channel</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Model</label>
                <ModelCombobox value={form.model} onChange={m => setForm({...form, model: m})} models={platformConfig.models} inputClassName="form-select" />
              </div>
              <div className="form-group">
                <label className="form-label">Channel</label>
                <select className="form-select" value={form.channel} onChange={e => setForm({...form, channel: e.target.value, chat_id: ""})}>
                  <option>None</option>
                  {platformConfig.channels.map((c: string) => (
                    <option key={c} value={c.charAt(0).toUpperCase() + c.slice(1)}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {form.channel === "Telegram" && (
              <div className="form-group" style={{marginTop:8}}>
                <label className="form-label">Chat ID <span style={{color:theme.textMuted,fontWeight:400}}>(leave blank to respond to anyone)</span></label>
                <input className="form-input" value={form.chat_id} onChange={e => setForm({...form, chat_id: e.target.value})} placeholder="e.g. 123456789 — message @userinfobot to find yours" style={{fontFamily:"'DM Mono',monospace"}} />
              </div>
            )}

            <div className="section-label">Tools</div>
            <div className="tools-grid">
              {TOOL_NAMES.map(tool => (
                <div key={tool} className={`tool-checkbox ${form.tools.includes(tool) ? "checked" : ""}`} onClick={() => toggleTool(tool)}>
                  <span>{form.tools.includes(tool) ? "✓" : "○"}</span>
                  <span style={{fontFamily:"'DM Mono', monospace",fontSize:12}}>{tool}</span>
                </div>
              ))}
            </div>

            <div className="section-label">Memory</div>
            <div className="toggle-row" style={{marginBottom:12}}>
              <span className="toggle-label">Enable Memory</span>
              <label className="toggle">
                <input type="checkbox" checked={form.memory_enabled} onChange={e => setForm({...form, memory_enabled: e.target.checked})} />
                <span className="toggle-slider"></span>
              </label>
            </div>
            {form.memory_enabled && (
              <div className="form-group">
                <label className="form-label">Memory Window (last K messages)</label>
                <input className="form-input" type="number" min={1} max={50} value={form.memory_window_k} onChange={e => setForm({...form, memory_window_k: parseInt(e.target.value) || 5})} />
              </div>
            )}

            <div className="section-label">Guardrails</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Max Tokens per Response</label>
                <input className="form-input" type="number" min={0} value={form.guardrails.max_tokens} onChange={e => setForm({...form, guardrails: {...form.guardrails, max_tokens: e.target.value}})} placeholder="e.g. 1000 (0 = unlimited)" />
              </div>
              <div className="form-group">
                <label className="form-label">Banned Topics</label>
                <input className="form-input" value={form.guardrails.banned_topics} onChange={e => setForm({...form, guardrails: {...form.guardrails, banned_topics: e.target.value}})} placeholder="e.g. violence, adult (comma separated)" />
              </div>
            </div>

            <div className="section-label">Schedule</div>
            <div className="form-group">
              <label className="form-label">Cron Schedule</label>
              <input className="form-input" value={form.schedule_cron} onChange={e => setForm({...form, schedule_cron: e.target.value})} placeholder="e.g. 0 9 * * * (every day at 9am) — leave blank to disable" style={{fontFamily:"'DM Mono', monospace"}} />
            </div>

            <div className="drawer-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Create Agent"}</button>
            </div>
          </div>
        </div>
      )}

      {testAgent && (
        <div className="overlay" onClick={() => setTestAgent(null)}>
          <div className="drawer" style={{width:600}} onClick={e => e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <div style={{fontSize:28}}>{testAgent.emoji}</div>
              <div>
                <div className="drawer-title" style={{marginBottom:2}}>Test — {testAgent.name}</div>
                <div style={{fontSize:12,color:theme.textMuted}}>{testAgent.role} · {testAgent.model}</div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Message</label>
              <textarea
                className="form-input form-textarea"
                style={{minHeight:80}}
                value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
                placeholder="Type a message to send to this agent…"
                disabled={testLoading}
              />
            </div>

            <div style={{display:"flex",gap:10,marginBottom:20}}>
              <button
                className="btn btn-primary"
                disabled={testLoading || !testMessage.trim()}
                onClick={async () => {
                  setTestLoading(true);
                  setTestResult(null);
                  try {
                    const res = await api.testAgent(testAgent.id, testMessage.trim());
                    setTestResult(res);
                  } catch (err: any) {
                    setTestResult({ status: "error", error: err.message });
                  } finally {
                    setTestLoading(false);
                  }
                }}
              >
                {testLoading ? "Running…" : "▶ Run"}
              </button>
              {testResult && <button className="btn btn-ghost" onClick={() => setTestResult(null)}>Clear</button>}
            </div>

            {testLoading && (
              <div style={{textAlign:"center",padding:"24px 0",color:theme.textMuted,fontSize:13}}>
                <div style={{fontSize:24,marginBottom:8}}>⚙️</div>
                Agent is thinking…
              </div>
            )}

            {testResult && testResult.status === "error" && (
              <div style={{background:theme.redDim,border:`1px solid ${theme.red}44`,borderRadius:8,padding:14,color:theme.red,fontSize:13}}>
                {testResult.error}
              </div>
            )}

            {testResult && testResult.status === "success" && (
              <div style={{display:"flex",flexDirection:"column",gap:10,maxHeight:360,overflowY:"auto"}}>
                <div style={{fontSize:11,fontWeight:700,color:theme.textMuted,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:4}}>
                  Trace · {testResult.tokens_used} tokens · {testResult.duration_seconds}s
                </div>
                {testResult.messages.map((msg: any, i: number) => {
                  if (msg.role === "human") return (
                    <div key={i} style={{alignSelf:"flex-end",background:theme.accent,color:"white",borderRadius:"12px 12px 2px 12px",padding:"10px 14px",fontSize:13,maxWidth:"80%"}}>
                      {msg.content}
                    </div>
                  );
                  if (msg.role === "tool") return (
                    <div key={i} style={{background:theme.yellowDim,border:`1px solid ${theme.yellow}33`,borderRadius:8,padding:"8px 12px",fontSize:12,fontFamily:"'DM Mono',monospace",color:theme.yellow}}>
                      🔧 {msg.tool_name ?? "tool"}: {msg.content.length > 200 ? msg.content.slice(0,200)+"…" : msg.content}
                    </div>
                  );
                  if (msg.role === "ai") return (
                    <div key={i}>
                      {msg.tool_calls?.map((tc: any, j: number) => (
                        <div key={j} style={{background:theme.accentDim,border:`1px solid ${theme.accent}33`,borderRadius:8,padding:"8px 12px",fontSize:12,fontFamily:"'DM Mono',monospace",color:theme.accent,marginBottom:6}}>
                          📡 Calling {tc.name}({JSON.stringify(tc.args)})
                        </div>
                      ))}
                      {msg.content && (
                        <div style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:"12px 12px 12px 2px",padding:"10px 14px",fontSize:13,lineHeight:1.5,maxWidth:"85%",whiteSpace:"pre-wrap"}}>
                          <div style={{fontSize:11,color:theme.accent,fontWeight:600,marginBottom:4}}>🤖 {testAgent.name}</div>
                          {msg.content}
                        </div>
                      )}
                    </div>
                  );
                  return null;
                })}
              </div>
            )}

            <div className="drawer-footer">
              <button className="btn btn-ghost" onClick={() => setTestAgent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Workflow node types ───────────────────────────────────────────────────────

type WFNodeData = { label?: string; agentId?: string | null; agentName?: string | null; agentEmoji?: string | null; isEntry?: boolean; conditionExpr?: string; };

const StartNodeCmp = memo(({ selected }: any) => (
  <div style={{ background: theme.surface, border: `1.5px solid ${theme.green}${selected ? "" : "88"}`, borderRadius: 10, padding: "12px 16px", minWidth: 100, textAlign: "center" }}>
    <Handle type="source" position={Position.Right} style={{ background: theme.green, width: 8, height: 8 }} />
    <div style={{ fontSize: 22, marginBottom: 4 }}>▶</div>
    <div style={{ fontSize: 11, color: theme.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Start</div>
  </div>
));
StartNodeCmp.displayName = "StartNodeCmp";

const EndNodeCmp = memo(({ selected }: any) => (
  <div style={{ background: theme.surface, border: `1.5px solid ${theme.red}${selected ? "" : "88"}`, borderRadius: 10, padding: "12px 16px", minWidth: 100, textAlign: "center" }}>
    <Handle type="target" position={Position.Left} style={{ background: theme.red, width: 8, height: 8 }} />
    <div style={{ fontSize: 22, marginBottom: 4 }}>⏹</div>
    <div style={{ fontSize: 11, color: theme.red, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>End</div>
  </div>
));
EndNodeCmp.displayName = "EndNodeCmp";

const AgentNodeCmp = memo(({ data, selected }: any) => {
  const d = data as WFNodeData;
  return (
    <div style={{ background: theme.surface, border: `1.5px solid ${selected ? theme.accent : theme.border}`, borderRadius: 10, padding: "12px 16px", minWidth: 140 }}>
      <Handle type="target" position={Position.Left} style={{ background: theme.accent, width: 8, height: 8 }} />
      <div style={{ fontSize: 22, marginBottom: 4 }}>{d.agentEmoji || "🤖"}</div>
      <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Agent</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{d.agentName || d.label || "Agent"}</div>
      {d.isEntry && <div style={{ fontSize: 10, color: theme.green, marginTop: 4, fontWeight: 600 }}>⬤ Entry</div>}
      <Handle type="source" position={Position.Right} style={{ background: theme.accent, width: 8, height: 8 }} />
    </div>
  );
});
AgentNodeCmp.displayName = "AgentNodeCmp";

const ConditionNodeCmp = memo(({ data, selected }: any) => {
  const d = data as WFNodeData;
  return (
    <div style={{ background: theme.surface, border: `1.5px solid ${selected ? theme.yellow : theme.yellow + "88"}`, borderRadius: 10, padding: "12px 16px", minWidth: 130 }}>
      <Handle type="target" position={Position.Left} style={{ background: theme.yellow, width: 8, height: 8 }} />
      <div style={{ fontSize: 18, marginBottom: 4 }}>◆</div>
      <div style={{ fontSize: 10, color: theme.yellow, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Condition</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{d.conditionExpr || "—"}</div>
      <Handle type="source" position={Position.Right} style={{ background: theme.yellow, width: 8, height: 8 }} />
    </div>
  );
});
ConditionNodeCmp.displayName = "ConditionNodeCmp";

const WF_NODE_TYPES = { agentNode: AgentNodeCmp, startNode: StartNodeCmp, endNode: EndNodeCmp, conditionNode: ConditionNodeCmp };
const TYPE_TO_API: Record<string, string> = { agentNode: "compiled_agent", startNode: "trigger", endNode: "end", conditionNode: "router_prompt" };
const API_TO_TYPE: Record<string, string> = { compiled_agent: "agentNode", trigger: "startNode", end: "endNode", router_prompt: "conditionNode" };

// ── WorkflowCanvas (must be inside ReactFlowProvider for useReactFlow) ────────

function WorkflowCanvas() {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [activeWfId, setActiveWfId] = useState<string | null>(null);
  const [wfName, setWfName] = useState("New Workflow");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runModal, setRunModal] = useState(false);
  const [inputText, setInputText] = useState("");
  const [activeRun, setActiveRun] = useState<{ id: string; status: string } | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [paletteAgents, setPaletteAgents] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    api.listWorkflows().then(setWorkflows).catch(() => {});
    api.listAgents().then(setPaletteAgents).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeRun?.id) return;
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    const ws = new WebSocket(`${WS_URL}/ws/logs?run_id=${activeRun.id}`);
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        setLogs(prev => [...prev, event]);
        if (["run_done", "run_error", "run_cancelled"].includes(event.type))
          setActiveRun(r => r ? { ...r, status: event.type } : null);
      } catch {}
    };
    return () => ws.close();
  }, [activeRun?.id]);

  const selectedNode = nodes.find((n: any) => n.id === selectedNodeId) || null;
  const isRunActive = activeRun && ["pending", "running"].includes(activeRun.status);

  const loadWorkflow = (wf: any) => {
    // Auto-layout: BFS from trigger node left-to-right
    const outEdges = new Map<string, string[]>();
    for (const e of (wf.edges || [])) {
      if (!outEdges.has(e.source)) outEdges.set(e.source, []);
      outEdges.get(e.source)!.push(e.target);
    }
    const startNode = (wf.nodes || []).find((n: any) => n.type === "trigger") ?? wf.nodes?.[0];
    const positions = new Map<string, { x: number; y: number }>();
    if (startNode) {
      const queue: { id: string; depth: number }[] = [{ id: startNode.id, depth: 0 }];
      const depthCount = new Map<number, number>();
      const visited = new Set<string>();
      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const count = depthCount.get(depth) ?? 0;
        positions.set(id, { x: depth * 220, y: count * 120 });
        depthCount.set(depth, count + 1);
        for (const t of outEdges.get(id) ?? []) {
          if (!visited.has(t)) queue.push({ id: t, depth: depth + 1 });
        }
      }
      let iso = 0;
      for (const n of (wf.nodes || [])) {
        if (!positions.has(n.id)) { positions.set(n.id, { x: 0, y: ((depthCount.get(0) ?? 0) + iso) * 120 }); iso++; }
      }
    }

    setNodes((wf.nodes || []).map((n: any) => {
      const cfg = n.config || {};
      const reactType = API_TO_TYPE[n.type] || "agentNode";
      const pos = positions.get(n.id) ?? { x: 0, y: 0 };
      let data: any = {};
      if (n.type === "trigger") {
        data = { label: "Start", triggerType: cfg.trigger_type || "manual", cron: cfg.cron || "", chatId: cfg.chat_id || "" };
      } else if (n.type === "compiled_agent") {
        data = { label: cfg.label || "Agent", agentId: cfg.agent_db_id || null };
      } else if (n.type === "router_prompt") {
        data = { label: "Condition", routingPrompt: cfg.routing_prompt || "", routerModel: cfg.router_model || "gpt-4o-mini" };
      } else {
        data = { label: "End" };
      }
      return { id: n.id, type: reactType, position: pos, data };
    }));

    setEdges((wf.edges || []).map((e: any) => ({
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label: e.condition_value || "",
      data: { conditionExpr: e.condition_value || "" },
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: theme.borderLight, strokeWidth: 1.5 },
    })));
    setWfName(wf.name);
    setActiveWfId(wf.id);
    setSelectedNodeId(null);
  };

  const saveWorkflow = async () => {
    setSaving(true);
    const payload = {
      name: wfName, description: "",
      nodes: nodes.map((n: any) => {
        const saveType = TYPE_TO_API[n.type] || "compiled_agent";
        let config: any = {};
        if (saveType === "trigger") {
          config = { trigger_type: n.data.triggerType || "manual", cron: n.data.cron || "", chat_id: n.data.chatId || "" };
        } else if (saveType === "compiled_agent") {
          config = { agent_db_id: n.data.agentId || null, label: n.data.label || "" };
        } else if (saveType === "router_prompt") {
          config = { routing_prompt: n.data.routingPrompt || "", router_model: n.data.routerModel || "gpt-4o-mini" };
        }
        return { id: n.id, type: saveType, config };
      }),
      edges: edges.map((e: any) => {
        const edge: any = { source: e.source, target: e.target };
        if (e.data?.conditionExpr) edge.condition_value = e.data.conditionExpr;
        return edge;
      }),
    };
    try {
      if (activeWfId) {
        const updated = await api.updateWorkflow(activeWfId, payload as any);
        setWorkflows((wfs: any[]) => wfs.map(w => w.id === activeWfId ? updated : w));
      } else {
        const created = await api.createWorkflow(payload as any);
        setWorkflows((wfs: any[]) => [...wfs, created]);
        setActiveWfId(created.id);
      }
    } catch (err) { alert("Save failed: " + err); }
    finally { setSaving(false); }
  };

  const onDragStart = (e: React.DragEvent, nodeType: string, agentData?: any) => {
    e.dataTransfer.setData("nodeType", nodeType);
    if (agentData) e.dataTransfer.setData("agentData", JSON.stringify(agentData));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData("nodeType");
    if (!nodeType) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const agentDataStr = e.dataTransfer.getData("agentData");
    const agentData = agentDataStr ? JSON.parse(agentDataStr) : null;
    setNodes((nds: any[]) => [...nds, {
      id: crypto.randomUUID(), type: nodeType, position,
      data: { label: agentData?.name || nodeType.replace("Node", ""), agentId: agentData?.id || null, agentName: agentData?.name || null, agentEmoji: agentData?.emoji || null, isEntry: false, conditionExpr: "" },
    }]);
  }, [screenToFlowPosition, setNodes]);

  const onConnect = useCallback((params: any) => {
    setEdges((eds: any[]) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: theme.borderLight, strokeWidth: 1.5 }, data: { conditionExpr: "" } }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNodeId(id => id === node.id ? null : node.id);
  }, []);

  const updateNodeData = (id: string, data: any) =>
    setNodes((nds: any[]) => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...data } } : n));

  const deleteNode = (id: string) => {
    setNodes((nds: any[]) => nds.filter(n => n.id !== id));
    setEdges((eds: any[]) => eds.filter(e => e.source !== id && e.target !== id));
    setSelectedNodeId(null);
  };

  const activeWf = workflows.find((w: any) => w.id === activeWfId) ?? null;
  const isLive = activeWf?.is_live ?? false;

  const startRun = async () => {
    if (!activeWfId) { alert("Save the workflow first"); return; }
    try {
      const run = await api.createRun(activeWfId, inputText, "manual", true);
      setActiveRun({ id: run.id, status: run.status });
      setLogs([]);
      setRunModal(false);
    } catch (err) { alert("Failed to start run: " + err); }
  };

  const stopRun = async () => { if (activeRun) try { await api.cancelRun(activeRun.id); } catch {} };

  const deployWorkflow = async () => {
    if (!activeWfId) { alert("Save the workflow first"); return; }
    setDeploying(true);
    try {
      const updated = await api.deployWorkflow(activeWfId);
      setWorkflows((wfs: any[]) => wfs.map(w => w.id === activeWfId ? { ...w, is_live: updated.is_live } : w));
    } catch (err) { alert("Deploy failed: " + err); }
    finally { setDeploying(false); }
  };

  const stopDeployment = async () => {
    if (!activeWfId) return;
    setDeploying(true);
    try {
      const updated = await api.stopWorkflow(activeWfId);
      setWorkflows((wfs: any[]) => wfs.map(w => w.id === activeWfId ? { ...w, is_live: updated.is_live } : w));
    } catch (err) { alert("Stop failed: " + err); }
    finally { setDeploying(false); }
  };

  const deleteWorkflow = async () => {
    if (!activeWfId) return;
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    try {
      await api.deleteWorkflow(activeWfId);
      setWorkflows((wfs: any[]) => wfs.filter(w => w.id !== activeWfId));
      setNodes([]); setEdges([]); setWfName("New Workflow"); setActiveWfId(null); setSelectedNodeId(null);
    } catch (err) { alert("Delete failed: " + err); }
  };

  const newWorkflow = () => { setNodes([]); setEdges([]); setWfName("New Workflow"); setActiveWfId(null); setSelectedNodeId(null); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div className="workflow-toolbar">
        <input className="form-input" style={{ width: 200, height: 32, fontSize: 13, padding: "4px 10px" }} value={wfName} onChange={e => setWfName(e.target.value)} placeholder="Workflow name" />
        <div style={{ width: 1, height: 28, background: theme.border }} />
        <button className="btn btn-ghost btn-sm" onClick={saveWorkflow} disabled={saving}>{saving ? "Saving…" : "💾 Save"}</button>
        {activeWfId && (
          <button className="btn btn-danger btn-sm" onClick={deleteWorkflow} style={{ fontSize: 13 }}>🗑 Delete</button>
        )}
        <div style={{ flex: 1 }} />
        {activeWfId && (
          isLive ? (
            <>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: theme.greenDim, color: theme.green, fontWeight: 600, border: `1px solid ${theme.green}44` }}>● Live</span>
              <button className="btn btn-danger btn-sm" onClick={stopDeployment} disabled={deploying} style={{ fontSize: 13 }}>{deploying ? "Stopping…" : "⏹ Stop"}</button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={deployWorkflow} disabled={deploying} style={{ fontSize: 13, color: theme.green, borderColor: `${theme.green}66` }}>{deploying ? "Deploying…" : "🚀 Deploy"}</button>
          )
        )}
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => { if (!activeWfId) { alert("Save the workflow first"); return; } setRunModal(true); }}>🧪 Test Run</button>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left sidebar */}
        <div className="workflow-sidebar" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px" }}>Workflows</div>
            <button className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", fontSize: 11 }} onClick={newWorkflow}>+ New</button>
          </div>
          {workflows.map((wf: any) => (
            <div key={wf.id} className="node-palette-item"
              style={{ background: wf.id === activeWfId ? theme.accentDim : undefined, color: wf.id === activeWfId ? theme.accent : undefined, borderColor: wf.id === activeWfId ? theme.accent + "44" : undefined }}
              onClick={() => loadWorkflow(wf)}>
              🔀 {wf.name}
            </div>
          ))}
          {workflows.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted, textAlign: "center", padding: "4px 0" }}>No workflows yet</div>}

          <div style={{ height: 1, background: theme.border, margin: "8px 0" }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Add Nodes</div>
          {[{ type: "startNode", icon: "▶", label: "Start" }, { type: "endNode", icon: "⏹", label: "End" }, { type: "conditionNode", icon: "◆", label: "Condition" }].map(p => (
            <div key={p.type} className="node-palette-item" draggable onDragStart={e => onDragStart(e, p.type)}>{p.icon} {p.label}</div>
          ))}

          <div style={{ height: 1, background: theme.border, margin: "8px 0" }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Your Agents</div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {paletteAgents.map((a: any) => (
              <div key={a.id} className="node-palette-item" draggable onDragStart={e => onDragStart(e, "agentNode", a)}>
                {a.emoji || "🤖"} {a.name}
              </div>
            ))}
            {paletteAgents.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted, textAlign: "center", padding: "4px 0" }}>No agents</div>}
          </div>
        </div>

        {/* ReactFlow canvas */}
        <div style={{ flex: 1, position: "relative" }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedNodeId(null)}
            onDrop={onDrop} onDragOver={onDragOver}
            nodeTypes={WF_NODE_TYPES} fitView
            style={{ background: theme.bg }}
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: theme.borderLight, strokeWidth: 1.5 } }}
          >
            <Background color={theme.border} gap={24} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Right panel — node config */}
        {selectedNode && (
          <div style={{ width: 240, background: theme.surface, borderLeft: `1px solid ${theme.border}`, padding: 16, overflowY: "auto" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
              {{ startNode: "Start Config", agentNode: "Agent Config", conditionNode: "Condition Config", endNode: "End Node" }[selectedNode.type] || "Node Config"}
            </div>
            {selectedNode.type === "startNode" && (
              <>
                <div className="form-group">
                  <label className="form-label">Trigger</label>
                  <select className="form-select" value={selectedNode.data.triggerType || "manual"}
                    onChange={e => updateNodeData(selectedNode.id, { triggerType: e.target.value, chatId: "" })}>
                    <option value="manual">Manual</option>
                    <option value="telegram">Telegram</option>
                    <option value="webhook">Webhook</option>
                    <option value="schedule">Schedule (cron)</option>
                  </select>
                </div>
                {(selectedNode.data.triggerType || "manual") === "telegram" && (
                  <div className="form-group">
                    <label className="form-label">Chat ID <span style={{ color: theme.textMuted, fontWeight: 400 }}>(blank = respond to anyone)</span></label>
                    <input className="form-input" value={selectedNode.data.chatId || ""} onChange={e => updateNodeData(selectedNode.id, { chatId: e.target.value })} placeholder="e.g. 123456789 — message @userinfobot to find yours" style={{ fontFamily: "'DM Mono',monospace" }} />
                  </div>
                )}
                {(selectedNode.data.triggerType || "manual") === "webhook" && (
                  <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5, marginBottom: 8 }}>
                    Triggered via incoming webhook POST request.
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Cron Schedule <span style={{ color: theme.textMuted, fontWeight: 400 }}>(optional)</span></label>
                  <input className="form-input" value={selectedNode.data.cron || ""} onChange={e => updateNodeData(selectedNode.id, { cron: e.target.value })} placeholder="e.g. 0 9 * * 1-5 — leave blank to disable" style={{ fontFamily: "'DM Mono',monospace" }} />
                </div>
              </>
            )}
            {selectedNode.type === "agentNode" && (() => {
              const agent = paletteAgents.find((a: any) => a.id === selectedNode.data.agentId);
              if (!agent) return (
                <div style={{ fontSize: 12, color: theme.textMuted }}>No agent assigned to this node.</div>
              );
              const channel = agent.channels?.[0];
              const channelType = channel?.type ? channel.type.charAt(0).toUpperCase() + channel.type.slice(1) : null;
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${theme.border}` }}>
                    <span style={{ fontSize: 26 }}>{agent.emoji || "🤖"}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{agent.name}</div>
                      {agent.role && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{agent.role}</div>}
                    </div>
                  </div>
                  {agent.system_prompt && (
                    <div className="form-group">
                      <label className="form-label">System Prompt</label>
                      <textarea readOnly className="form-input form-textarea" value={agent.system_prompt} rows={4}
                        style={{ fontSize: 12, resize: "none", opacity: 0.75, cursor: "default", fontFamily: "'DM Mono',monospace" }} />
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Model</label>
                    <div style={{ fontSize: 12, color: theme.textDim, fontFamily: "'DM Mono',monospace", padding: "6px 10px", background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 6 }}>{agent.model}</div>
                  </div>
                  {channelType && channelType !== "None" && (
                    <div className="form-group">
                      <label className="form-label">Channel</label>
                      <div style={{ fontSize: 12, color: theme.textDim, padding: "6px 10px", background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 6 }}>
                        📡 {channelType}{channel?.config?.chat_id ? ` — ${channel.config.chat_id}` : ""}
                      </div>
                    </div>
                  )}
                  {agent.tools?.length > 0 && (
                    <div className="form-group">
                      <label className="form-label">Tools</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {agent.tools.map((t: any) => (
                          <span key={t.name || t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: theme.accentDim, color: theme.accent, border: `1px solid ${theme.accent}44`, fontFamily: "'DM Mono',monospace" }}>
                            {t.name || t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {agent.memory_enabled && (
                    <div className="form-group">
                      <label className="form-label">Memory</label>
                      <div style={{ fontSize: 12, color: theme.textDim, padding: "6px 10px", background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 6 }}>
                        Enabled — last {agent.memory_window_k || 5} messages
                      </div>
                    </div>
                  )}
                  {agent.schedule_cron && (
                    <div className="form-group">
                      <label className="form-label">Cron Schedule</label>
                      <div style={{ fontSize: 12, color: theme.textDim, fontFamily: "'DM Mono',monospace", padding: "6px 10px", background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 6 }}>{agent.schedule_cron}</div>
                    </div>
                  )}
                </>
              );
            })()}
            {selectedNode.type === "conditionNode" && (
              <>
                <div className="form-group">
                  <label className="form-label">Routing Prompt</label>
                  <textarea className="form-input form-textarea" style={{ minHeight: 100, fontSize: 12, fontFamily: "inherit", resize: "vertical" }}
                    value={selectedNode.data.routingPrompt || ""}
                    onChange={e => updateNodeData(selectedNode.id, { routingPrompt: e.target.value })}
                    placeholder="Based on the previous output, decide which agent handles next. Reply with only the routing keyword." />
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6, lineHeight: 1.4 }}>Set each outbound edge label to a keyword this prompt will return.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Model</label>
                  <select className="form-select" value={selectedNode.data.routerModel || "gpt-4o-mini"}
                    onChange={e => updateNodeData(selectedNode.id, { routerModel: e.target.value })}>
                    <option value="gpt-5.4-mini-2026-03-17">gpt-5.4-mini-2026-03-17</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4-turbo">gpt-4-turbo</option>
                    <option value="claude-opus-4-7">claude-opus-4-7</option>
                    <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                    <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                  </select>
                </div>
              </>
            )}
            <button className="btn btn-danger btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={() => deleteNode(selectedNode.id)}>
              🗑 Delete Node
            </button>
          </div>
        )}
      </div>

      {/* Log tray */}
      {activeRun && (
        <div style={{ height: 200, background: theme.surface, borderTop: `1px solid ${theme.border}`, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", borderBottom: `1px solid ${theme.border}`, gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px" }}>Run Log</div>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: isRunActive ? theme.accentDim : theme.greenDim, color: isRunActive ? theme.accent : theme.green, fontWeight: 600 }}>
              {isRunActive ? "● running" : activeRun.status}
            </span>
            <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: "'DM Mono',monospace" }}>{activeRun.id.slice(0, 8)}…</span>
            <div style={{ flex: 1 }} />
            {isRunActive && <button className="btn btn-danger btn-sm" onClick={stopRun}>■ Stop</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => { setActiveRun(null); setLogs([]); }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            {logs.map((log: any, i: number) => (
              <div key={i} style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", color: log.type === "run_error" ? theme.red : ["run_done", "run_cancelled"].includes(log.type) ? theme.green : ["agent_start", "agent_done"].includes(log.type) ? theme.accent : theme.textDim }}>
                [{log.type}]{log.agent ? ` ${log.agent}` : ""}{log.content ? ` — ${String(log.content).slice(0, 80)}` : ""}{log.tokens ? ` (${log.tokens} tokens)` : ""}
              </div>
            ))}
            {logs.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted }}>Waiting for events…</div>}
          </div>
        </div>
      )}

      {/* Run modal */}
      {runModal && (
        <div className="overlay" onClick={() => setRunModal(false)}>
          <div className="drawer" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
            <div className="drawer-title">🧪 Test Run</div>
            <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 20 }}>
              Workflow: <span style={{ color: theme.accent, fontWeight: 600 }}>{wfName}</span>
            </div>
            <div className="form-group">
              <label className="form-label">Input Message</label>
              <textarea className="form-input form-textarea" style={{ minHeight: 80 }} value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Enter the input for this workflow run…" />
            </div>
            <div className="drawer-footer">
              <button className="btn btn-ghost" onClick={() => setRunModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={startRun} disabled={!inputText.trim()}>▶ Start Run</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowPage() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}

function WorkflowsPage() {
  const [mode, setMode] = useState<"playbook" | "canvas">("playbook");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 48, borderBottom: `1px solid ${theme.border}`, background: theme.surface, gap: 6, flexShrink: 0 }}>
        <button
          className={`btn btn-sm ${mode === "playbook" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setMode("playbook")}
        >
          📋 Playbook
        </button>
        <button
          className={`btn btn-sm ${mode === "canvas" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setMode("canvas")}
        >
          🔀 Canvas
        </button>
        <div style={{ marginLeft: 8, fontSize: 12, color: theme.textMuted }}>
          {mode === "playbook"
            ? "Write a prompt, pick agents — supervisor routes automatically"
            : "Drag agents onto the canvas and wire edges manually"}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {mode === "playbook" ? <PlaybooksPage /> : <WorkflowPage />}
      </div>
    </div>
  );
}

function RunsPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [runTrace, setRunTrace] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api.listRuns().then(r => { setRuns(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const selectRun = async (run: any) => {
    setSelected(run);
    setMessages([]);
    setRunTrace([]);
    setLoadingDetail(true);
    try {
      const [msgs, trace] = await Promise.all([
        api.getRunMessages(run.id),
        api.getRunTrace(run.id).catch(() => []),
      ]);
      setMessages(msgs);
      setRunTrace(trace);
    } catch { setMessages([]); }
    finally { setLoadingDetail(false); }
  };

  const totalTokens = runs.reduce((s, r) => s + (r.tokens_used || 0), 0);
  const totalCost = runs.reduce((s, r) => s + (r.cost_usd || 0), 0);
  const doneCount = runs.filter(r => r.status === "done").length;
  const successRate = runs.length > 0 ? Math.round(doneCount / runs.length * 100) : 0;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  const triggerBadge = (trigger: string) => {
    const map: Record<string, { bg: string; color: string; icon: string }> = {
      chat:     { bg: theme.accentDim,  color: theme.accent,  icon: "💬" },
      telegram: { bg: "#06b6d422",      color: "#06b6d4",     icon: "📡" },
      schedule: { bg: theme.yellowDim,  color: theme.yellow,  icon: "⏰" },
      manual:   { bg: "#1e2130",        color: theme.textDim, icon: "▶" },
    };
    const s = map[trigger] || map.manual;
    return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: s.bg, color: s.color }}>{s.icon} {trigger}</span>;
  };

  const statusBadge = (status: string) => {
    const cls = status === "done" ? "status-success" : status === "running" ? "status-running" : status === "failed" ? "status-failed" : "";
    const color = status === "done" ? theme.green : status === "running" ? theme.accent : status === "failed" ? theme.red : theme.textMuted;
    return cls
      ? <span className={`status-badge ${cls}`}>{status}</span>
      : <span style={{ fontSize: 12, fontWeight: 600, color, padding: "2px 8px", borderRadius: 10, background: color + "22" }}>{status}</span>;
  };

  if (!selected) {
    return (
      <div>
        <div className="stats-row">
          <div className="stat-card"><div className="stat-label">Total Runs</div><div className="stat-value" style={{ color: theme.accent }}>{loading ? "…" : runs.length}</div></div>
          <div className="stat-card"><div className="stat-label">Success Rate</div><div className="stat-value" style={{ color: theme.green }}>{loading ? "…" : `${successRate}%`}</div></div>
          <div className="stat-card"><div className="stat-label">Total Tokens</div><div className="stat-value" style={{ color: theme.text, fontSize: 22 }}>{loading ? "…" : totalTokens.toLocaleString()}</div></div>
          <div className="stat-card"><div className="stat-label">Total Cost</div><div className="stat-value" style={{ color: theme.yellow, fontSize: 22 }}>{loading ? "…" : `$${totalCost.toFixed(4)}`}</div></div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: theme.textMuted, fontSize: 13 }}>Loading runs…</div>
        ) : runs.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">▶️</div><div className="empty-title">No runs yet</div><div>Runs from chat, Telegram, and scheduled jobs will appear here.</div></div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table className="runs-table">
              <thead>
                <tr><th>Run ID</th><th>Source</th><th>Trigger</th><th>Status</th><th>Input</th><th>Started</th><th>Duration</th><th>Tokens</th><th>Cost</th><th>Trace</th><th></th></tr>
              </thead>
              <tbody>
                {runs.map((run: any) => (
                  <tr key={run.id} onClick={() => selectRun(run)}>
                    <td><span style={{ fontFamily: "'DM Mono',monospace", color: theme.accent, fontSize: 11 }}>{run.id.slice(0, 8)}…</span></td>
                    <td style={{ fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.workflow_name || "—"}</td>
                    <td>{triggerBadge(run.trigger)}</td>
                    <td>{statusBadge(run.status)}</td>
                    <td style={{ color: theme.textMuted, fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.input_text || "—"}</td>
                    <td style={{ color: theme.textMuted, fontSize: 12 }}>{fmtDate(run.started_at)}</td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }}>{run.duration_seconds != null ? `${run.duration_seconds.toFixed(1)}s` : "—"}</td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }}>{run.tokens_used > 0 ? run.tokens_used.toLocaleString() : "—"}</td>
                    <td style={{ color: theme.green, fontFamily: "'DM Mono',monospace", fontSize: 12 }}>{run.cost_usd > 0 ? `$${run.cost_usd.toFixed(4)}` : "—"}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {run.langsmith_url ? (
                        <a href={run.langsmith_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ color: theme.green, textDecoration: "none" }}>🔗</a>
                      ) : (
                        <span style={{ color: theme.textMuted, fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td><button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); selectRun(run); }}>View →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // Detail view
  const assistantMsgs = messages.filter(m => m.role === "assistant" || m.role === "ai");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); setMessages([]); }}>← Back</button>
        <span style={{ fontFamily: "'DM Mono',monospace", color: theme.accent, fontSize: 13 }}>{selected.id.slice(0, 8)}…</span>
        {statusBadge(selected.status)}
        {triggerBadge(selected.trigger)}
        <span style={{ color: theme.textMuted, fontSize: 13 }}>{selected.workflow_name}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
        {/* Left: conversation */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14 }}>Conversation</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* User input */}
            {selected.input_text && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ maxWidth: "70%" }}>
                  <div style={{ fontSize: 11, color: theme.textMuted, textAlign: "right", marginBottom: 4 }}>{fmtDate(selected.started_at)}</div>
                  <div style={{ padding: "10px 14px", borderRadius: "12px 12px 2px 12px", background: theme.accent, color: "white", fontSize: 14, lineHeight: 1.5 }}>
                    {selected.input_text}
                  </div>
                </div>
              </div>
            )}
            {/* Assistant responses */}
            {loadingDetail && <div style={{ color: theme.textMuted, fontSize: 13, fontStyle: "italic" }}>Loading messages…</div>}
            {assistantMsgs.map((msg: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "flex-start", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: theme.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, marginTop: 2 }}>🤖</div>
                <div style={{ maxWidth: "70%" }}>
                  {msg.created_at && <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>{fmtDate(msg.created_at)}</div>}
                  <div style={{ padding: "10px 14px", borderRadius: "12px 12px 12px 2px", background: theme.surface, border: `1px solid ${theme.border}`, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            {!loadingDetail && assistantMsgs.length === 0 && selected.status !== "running" && (
              <div style={{ color: theme.textMuted, fontSize: 13 }}>No messages recorded for this run.</div>
            )}
          </div>
        </div>

        {/* Right: summary card */}
        <div className="card" style={{ alignSelf: "flex-start" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.8px" }}>Run Summary</div>
          {[
            ["Source",   selected.workflow_name || "—"],
            ["Run ID",   selected.id.slice(0, 8) + "…"],
            ["Started",  fmtDate(selected.started_at)],
            ["Duration", selected.duration_seconds != null ? `${selected.duration_seconds.toFixed(1)}s` : "—"],
            ["Tokens",   selected.tokens_used > 0 ? selected.tokens_used.toLocaleString() : "0"],
            ["Cost",     selected.cost_usd > 0 ? `$${selected.cost_usd.toFixed(4)}` : "$0.0000"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13 }}>
              <span style={{ color: theme.textMuted }}>{k}</span>
              <span style={{ fontWeight: 600, fontFamily: ["Tokens","Cost","Run ID"].includes(k) ? "'DM Mono',monospace" : "inherit", color: k === "Cost" ? theme.green : k === "Tokens" ? theme.text : theme.text }}>{v}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10, marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: theme.textMuted }}>Trigger</span>
              {triggerBadge(selected.trigger)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}>
              <span style={{ color: theme.textMuted }}>Status</span>
              {statusBadge(selected.status)}
            </div>
          </div>
          {selected.langsmith_url && (
            <div style={{ marginTop: 12 }}>
              <a href={selected.langsmith_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ display: "block", textAlign: "center", color: theme.green, textDecoration: "none" }}>
                View in LangSmith ↗
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Execution trace */}
      {(runTrace.length > 0 || loadingDetail) && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14 }}>Execution Trace</div>
          {loadingDetail
            ? <div style={{ color: theme.textMuted, fontSize: 13, fontStyle: "italic" }}>Loading trace…</div>
            : <TracePanel events={runTrace} />
          }
        </div>
      )}
    </div>
  );
}


// ── Trace event renderer ─────────────────────────────────────────────────────

// Cost estimate: rough gpt-5.x-mini pricing ~$0.40/M tokens
const COST_PER_TOKEN = 0.0000004;

function formatCost(tokens: number) {
  const c = tokens * COST_PER_TOKEN;
  return c < 0.0001 ? "<$0.0001" : `~$${c.toFixed(4)}`;
}

type ToolEntry = { name: string; input: string; output?: string };
type TraceBlock =
  | { kind: "run_start" }
  | { kind: "run_done"; output: string; tokens: number }
  | { kind: "run_cancelled" }
  | { kind: "agent"; name: string; tools: ToolEntry[]; tokens: number; input_tokens: number; output_tokens: number; content: string; done: boolean }
  | { kind: "llm_step"; agent: string; tokens: number; input_tokens: number; output_tokens: number }
  | { kind: "routing"; to: string }
  | { kind: "error"; error: string }
  | { kind: "guardrail"; agent: string; content: string };

function buildTraceGroups(events: any[]): TraceBlock[] {
  const blocks: TraceBlock[] = [];
  let current: Extract<TraceBlock, { kind: "agent" }> | null = null;
  const agentNames = new Set<string>();

  const findAgentBlock = (name: string) =>
    blocks.filter(b => b.kind === "agent" && b.name === name).pop() as Extract<TraceBlock, { kind: "agent" }> | undefined;

  const getOrCreateAgent = (name: string): Extract<TraceBlock, { kind: "agent" }> => {
    const existing = findAgentBlock(name);
    if (existing) return existing;
    const block: Extract<TraceBlock, { kind: "agent" }> = { kind: "agent", name, tools: [], tokens: 0, input_tokens: 0, output_tokens: 0, content: "", done: false };
    blocks.push(block);
    agentNames.add(name);
    return block;
  };

  for (const ev of events) {
    if (ev.type === "run_start") {
      blocks.push({ kind: "run_start" });
    } else if (ev.type === "run_done") {
      blocks.push({ kind: "run_done", output: String(ev.output || "").slice(0, 120), tokens: ev.tokens || 0 });
    } else if (ev.type === "run_cancelled") {
      blocks.push({ kind: "run_cancelled" });
    } else if (ev.type === "agent_start") {
      // Streaming path: explicit agent_start event
      const name = ev.agent || "Agent";
      agentNames.add(name);
      current = { kind: "agent", name, tools: [], tokens: 0, input_tokens: 0, output_tokens: 0, content: "", done: false };
      blocks.push(current);
    } else if (ev.type === "agent_done") {
      // Works for both streaming (agent_start already created block) and sync (create block here)
      const name = ev.agent || "Agent";
      const target = (current?.name === name ? current : null) || getOrCreateAgent(name);
      target.tokens = ev.tokens || 0;
      target.input_tokens = ev.input_tokens || 0;
      target.output_tokens = ev.output_tokens || 0;
      target.content = ev.content || "";
      target.done = true;
      if (current?.name === name) current = null;
    } else if (ev.type === "llm_step") {
      const name = ev.agent || "";
      if (!agentNames.has(name)) {
        blocks.push({ kind: "llm_step", agent: name, tokens: ev.tokens || 0, input_tokens: ev.input_tokens || 0, output_tokens: ev.output_tokens || 0 });
      } else {
        const target = findAgentBlock(name);
        if (target) target.tokens = (target.tokens || 0) + (ev.tokens || 0);
      }
    } else if (ev.type === "tool_call") {
      const agentName = ev.agent || current?.name || "";
      // Always find-or-create so tools are never dropped
      const target = agentName ? (findAgentBlock(agentName) || getOrCreateAgent(agentName)) : current;
      if (target?.kind === "agent") {
        current = target;
        target.tools.push({ name: ev.tool || "tool", input: String(ev.input || "").slice(0, 200) });
      }
    } else if (ev.type === "tool_result") {
      const agentBlock = (ev.agent ? findAgentBlock(ev.agent) : null) || current;
      if (agentBlock?.kind === "agent") {
        const tool = [...agentBlock.tools].reverse().find(t => t.name === ev.tool && !t.output);
        if (tool) tool.output = String(ev.output || "").slice(0, 200);
      }
    } else if (ev.type === "routing") {
      blocks.push({ kind: "routing", to: ev.to });
    } else if (ev.type === "guardrail") {
      blocks.push({ kind: "guardrail", agent: ev.agent || "", content: ev.content || "" });
    } else if (ev.type === "run_error") {
      blocks.push({ kind: "error", error: ev.error || "Unknown error" });
    }
  }
  return blocks;
}

function TracePanel({ events }: { events: any[] }) {
  const groups = buildTraceGroups(events);
  if (groups.length === 0) {
    return <div style={{ padding: "40px 20px", textAlign: "center", color: theme.textMuted, fontSize: 12 }}>Trace events will appear here when a run is active</div>;
  }
  return (
    <>
      {groups.map((b, i) => {
        if (b.kind === "run_start") return (
          <div key={i} style={{ padding: "5px 10px", fontSize: 11, color: theme.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: theme.accent }}>▶</span> Run started
          </div>
        );
        if (b.kind === "run_done") return (
          <div key={i} style={{ padding: "7px 12px", background: theme.greenDim, border: `1px solid ${theme.green}33`, borderRadius: 7, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: theme.green, fontWeight: 700 }}>✓ Complete</span>
            {b.tokens > 0 && <span style={{ color: theme.textDim, fontFamily: "'DM Mono',monospace" }}>{b.tokens.toLocaleString()} tokens · {formatCost(b.tokens)}</span>}
          </div>
        );
        if (b.kind === "run_cancelled") return (
          <div key={i} style={{ padding: "5px 10px", fontSize: 11, color: theme.textMuted }}>◼ Cancelled</div>
        );
        if (b.kind === "llm_step") return (
          <div key={i} className="trace-agent-block">
            <div className="trace-agent-header">
              <span style={{ color: theme.green, fontSize: 14 }}>✓</span>
              <span style={{ color: theme.text, flex: 1 }}>{b.agent || "Supervisor"}</span>
            </div>
            <div className="trace-agent-footer">
              <span>{b.input_tokens} in + {b.output_tokens} out = {b.tokens} tokens</span>
              <span>{formatCost(b.tokens)}</span>
            </div>
          </div>
        );
        if (b.kind === "routing") return (
          <div key={i} className="trace-routing">
            <span style={{ color: theme.textMuted }}>supervisor</span>
            <span style={{ color: theme.accent, margin: "0 4px" }}>→</span>
            <span style={{ fontWeight: 700, color: theme.text }}>{b.to}</span>
          </div>
        );
        if (b.kind === "error") return (
          <div key={i} style={{ padding: "8px 12px", background: theme.redDim, border: `1px solid ${theme.red}44`, borderRadius: 7, fontSize: 12, color: theme.red }}>
            ✗ {b.error}
          </div>
        );
        if (b.kind === "guardrail") return (
          <div key={i} style={{ padding: "8px 12px", background: theme.yellowDim, border: `1px solid ${theme.yellow}44`, borderRadius: 7, fontSize: 12, color: theme.yellow }}>
            ⚠ Guardrail [{b.agent}]: {b.content}
          </div>
        );
        // agent block
        return (
          <div key={i} className="trace-agent-block">
            <div className="trace-agent-header">
              <span style={{ color: (b as any).done ? theme.green : theme.accent, fontSize: 14 }}>{(b as any).done ? "✓" : "⚡"}</span>
              <span style={{ color: theme.text, flex: 1 }}>{(b as any).name}</span>
              {!(b as any).done && <span style={{ color: theme.accent, fontSize: 10, animation: "pulse 1s infinite" }}>running</span>}
            </div>
            {(b as any).tools.map((t: ToolEntry, j: number) => (
              <div key={j} className="trace-tool-row">
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ color: theme.yellow }}>🔧</span>
                  <span style={{ color: theme.yellow, fontWeight: 600 }}>{t.name}</span>
                </div>
                <div style={{ paddingLeft: 20 }}>
                  <div style={{ color: theme.textMuted, marginBottom: 2 }}>
                    <span style={{ color: theme.textDim }}>in: </span>
                    <span style={{ color: theme.text }}>{t.input || "—"}</span>
                  </div>
                  {t.output !== undefined && (
                    <div style={{ color: theme.textMuted }}>
                      <span style={{ color: theme.green }}>out: </span>
                      <span style={{ color: theme.textDim }}>{t.output || "—"}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {(b as any).done && (
              <div className="trace-agent-footer">
                <span>{(b as any).input_tokens || 0} in + {(b as any).output_tokens || 0} out = {(b as any).tokens.toLocaleString()} tokens</span>
                <span>{formatCost((b as any).tokens)}</span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Chat page ─────────────────────────────────────────────────────────────────

function ChatPage() {
  type ChatMsg = { role: "user" | "assistant"; content: string; pending?: boolean; error?: boolean };
  type Source = { id: string; name: string; type: "playbook" | "agent" | "workflow"; agentCount: number; trigger: string; emoji?: string };

  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [sourceType, setSourceType] = useState<"playbook" | "agent" | "workflow">("playbook");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [trace, setTrace] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useCallback((node: HTMLDivElement | null) => { node?.scrollIntoView({ behavior: "smooth" }); }, []);

  // Load live sources (playbooks + live agents + live workflows)
  useEffect(() => {
    Promise.all([api.listPlaybooks(), api.listAgents(), api.listWorkflows()]).then(([pbs, ags, wfs]) => {
      const combined: Source[] = [
        ...pbs.filter(p => p.is_live).map(p => ({ id: p.id, name: p.name, type: "playbook" as const, agentCount: p.agent_ids.length, trigger: p.trigger_type })),
        ...(ags as any[]).filter((a: any) => a.is_live).map((a: any) => ({ id: a.id, name: a.name, type: "agent" as const, agentCount: 1, trigger: a.channels?.[0]?.type ?? "manual", emoji: a.emoji })),
        ...(wfs as any[]).filter((w: any) => w.is_live).map((w: any) => ({ id: w.id, name: w.name, type: "workflow" as const, agentCount: (w.nodes || []).filter((n: any) => n.type === "compiled_agent").length, trigger: "manual", emoji: "🔀" })),
      ];
      setSources(combined);
      if (combined.length > 0) { setSourceId(combined[0].id); setSourceType(combined[0].type); }
    }).catch(() => {});
  }, []);

  // Load sessions when source changes
  useEffect(() => {
    if (!sourceId || !sourceType) return;
    api.listChatSessions(sourceType, sourceId).then(setSessions).catch(() => setSessions([]));
  }, [sourceId, sourceType]);


  const newChat = () => {
    const id = crypto.randomUUID();
    setSessionId(id);
    setMessages([]);
    setTrace([]);
  };

  const loadSession = async (sid: string) => {
    if (running) return;
    setSessionId(sid);
    setTrace([]);
    setLoadingHistory(true);
    try {
      const history = await api.getChatSessionMessages(sid);
      setMessages(history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })));
    } catch { setMessages([]); }
    finally { setLoadingHistory(false); }
  };

  const send = async () => {
    const userMsg = input.trim();
    if (!userMsg || !sourceId || running) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }, { role: "assistant", content: "", pending: true }]);
    setTrace([]);
    setRunning(true);
    try {
      const result = await api.chatSend(sourceType, sourceId, userMsg, sessionId);
      setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: result.output || "(no response)" }]);
      setTrace(result.trace);
      api.listChatSessions(sourceType, sourceId).then(setSessions).catch(() => {});
    } catch (err) {
      setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: "Failed: " + String(err), error: true }]);
    } finally {
      setRunning(false);
    }
  };

  const selectedSource = sources.find(s => s.id === sourceId);
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Source selector bar */}
      <div className="chat-source-bar">
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, flexShrink: 0 }}>Live source</div>
        {sources.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.yellow, background: theme.yellowDim, padding: "4px 12px", borderRadius: 6, border: `1px solid ${theme.yellow}44` }}>
            No live sources — deploy a playbook or agent first
          </div>
        ) : (
          <select className="form-select" style={{ width: 280, height: 34, padding: "4px 12px", fontSize: 13 }}
            value={sourceId}
            onChange={e => {
              const s = sources.find(x => x.id === e.target.value);
              setSourceId(e.target.value); setSourceType(s?.type || "playbook");
              newChat();
            }}>
            {sources.map(s => (
              <option key={s.id} value={s.id}>{s.type === "playbook" ? "📋" : s.type === "workflow" ? "🔀" : (s.emoji || "🤖")} {s.name}</option>
            ))}
          </select>
        )}
        {selectedSource && (
          <div style={{ fontSize: 12, color: theme.textMuted, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: theme.greenDim, color: theme.green, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>🟢 Live</span>
            <span style={{ background: selectedSource.type === "playbook" ? theme.accentDim : selectedSource.type === "workflow" ? theme.yellowDim : theme.greenDim, color: selectedSource.type === "playbook" ? theme.accent : selectedSource.type === "workflow" ? theme.yellow : theme.green, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
              {selectedSource.type === "playbook" ? "Playbook" : selectedSource.type === "workflow" ? "Workflow" : "Agent"}
            </span>
            {(selectedSource.type === "playbook" || selectedSource.type === "workflow") && selectedSource.agentCount > 0 && <span>{selectedSource.agentCount} agent{selectedSource.agentCount !== 1 ? "s" : ""}</span>}
            {selectedSource.trigger === "telegram" && (
              <span style={{ background: theme.accentDim, color: theme.accent, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>📡 Also on Telegram</span>
            )}
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {running && <div style={{ fontSize: 12, color: theme.accent, display: "flex", alignItems: "center", gap: 6 }}><span style={{ animation: "pulse 1s infinite" }}>●</span> Running…</div>}
        </div>
      </div>

      {/* Three-column layout: sessions | chat | trace */}
      <div className="chat-layout">

        {/* LEFT: Session history */}
        <div className="chat-sessions">
          <div className="chat-sessions-header">
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px" }}>Sessions</div>
            <button className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", fontSize: 11 }} onClick={newChat} title="Start a new conversation">+ New</button>
          </div>
          <div className="chat-sessions-list">
            {/* current (unsaved) session if messages exist and not in history */}
            {messages.length > 0 && !sessions.find(s => s.session_id === sessionId) && (
              <div className={`chat-session-item active`} style={{ opacity: 0.7 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.accent, marginBottom: 2 }}>New chat</div>
                <div style={{ fontSize: 11, color: theme.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {messages.find(m => m.role === "user")?.content.slice(0, 40) || "…"}
                </div>
              </div>
            )}
            {sessions.map(s => (
              <div key={s.session_id} className={`chat-session-item ${s.session_id === sessionId ? "active" : ""}`} onClick={() => loadSession(s.session_id)}>
                <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 3 }}>{fmtDate(s.last_at)} · {s.run_count} msg{s.run_count !== 1 ? "s" : ""}</div>
                <div style={{ fontSize: 12, color: s.session_id === sessionId ? theme.accent : theme.textDim, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.first_message || "…"}
                </div>
              </div>
            ))}
            {sessions.length === 0 && messages.length === 0 && (
              <div style={{ padding: "20px 8px", fontSize: 11, color: theme.textMuted, textAlign: "center" }}>No sessions yet</div>
            )}
          </div>
        </div>

        {/* MIDDLE: Chat */}
        <div className="chat-left">
          <div className="chat-messages-area">
            {loadingHistory && (
              <div style={{ textAlign: "center", padding: "20px", color: theme.textMuted, fontSize: 13, fontStyle: "italic" }}>Loading history…</div>
            )}
            {!loadingHistory && messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: theme.textMuted }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.textDim, marginBottom: 6 }}>Start a conversation</div>
                <div style={{ fontSize: 13 }}>{sources.length === 0 ? "Deploy a playbook or agent first" : "Type a message below to start"}</div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 8 }}>
                {msg.role === "assistant" && (
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: theme.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, marginTop: 2 }}>🤖</div>
                )}
                <div style={{ maxWidth: "68%", padding: "10px 14px", borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: msg.role === "user" ? theme.accent : (msg.error ? theme.redDim : theme.surface), color: msg.error ? theme.red : theme.text, border: msg.role !== "user" ? `1px solid ${msg.error ? theme.red + "44" : theme.border}` : "none", fontSize: 14, lineHeight: 1.55 }}>
                  {msg.pending ? <span style={{ color: theme.textMuted, fontStyle: "italic" }}>Thinking…</span> : <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef as any} />
          </div>
          <div className="chat-input-area">
            <textarea className="form-input" style={{ flex: 1, minHeight: 44, maxHeight: 140, resize: "none", fontSize: 14, lineHeight: 1.5, padding: "10px 14px" }}
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              disabled={running || !sourceId}
            />
            <button className="btn btn-primary" style={{ alignSelf: "flex-end", height: 44, width: 48, fontSize: 18, justifyContent: "center" }} onClick={send} disabled={running || !input.trim() || !sourceId}>↑</button>
          </div>
        </div>

        {/* RIGHT: Trace */}
        <div className="chat-trace">
          <div className="trace-header">
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px" }}>Execution Trace</div>
            {trace.length > 0 && <button className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setTrace([])}>Clear</button>}
          </div>
          <div className="trace-body">
            <TracePanel events={trace} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaybooksPage() {
  const TRIGGERS = ["manual", "telegram", "schedule"];

  const blank = (): Partial<Playbook> & { telegram_chat_id: string } => ({
    name: "", description: "", playbook_text: "",
    agent_ids: [], supervisor_model: "gpt-5.4-mini-2026-03-17",
    trigger_type: "manual", schedule_cron: null,
    telegram_config: null,
    telegram_chat_id: "",
  });

  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selected, setSelected] = useState<Playbook | null>(null);
  const [form, setForm] = useState<Partial<Playbook>>(blank());
  const [allAgents, setAllAgents] = useState<any[]>([]);
  const [platformConfig, setPlatformConfig] = useState<{ models: string[]; channels: string[] }>({ models: [], channels: [] });
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [runModal, setRunModal] = useState(false);
  const [inputText, setInputText] = useState("");
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ output: string; trace: any[]; tokens: number } | null>(null);

  useEffect(() => {
    api.listPlaybooks().then(setPlaybooks).catch(() => {});
    api.listAgents().then(setAllAgents).catch(() => {});
    api.getConfig().then(setPlatformConfig).catch(() => {});
  }, []);


  const selectPlaybook = (pb: Playbook) => {
    setSelected(pb);
    setForm({ ...pb, telegram_chat_id: (pb.telegram_config?.chat_id ?? "") as any } as any);
    setTestResult(null);
  };

  const newPlaybook = () => {
    setSelected(null);
    setForm(blank());
    setTestResult(null);
  };

  const toggleAgent = (id: string) => {
    setForm(f => ({
      ...f,
      agent_ids: f.agent_ids?.includes(id)
        ? f.agent_ids.filter(a => a !== id)
        : [...(f.agent_ids || []), id],
    }));
  };

  const save = async () => {
    if (!form.name?.trim() || !form.playbook_text?.trim()) {
      alert("Name and Playbook text are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        telegram_config: form.trigger_type === "telegram"
          ? { chat_id: (form as any).telegram_chat_id || undefined }
          : {},
      } as any;
      if (selected) {
        const updated = await api.updatePlaybook(selected.id, payload);
        setPlaybooks(pbs => pbs.map(p => p.id === selected.id ? updated : p));
        setSelected(updated);
        setForm({ ...updated, telegram_chat_id: updated.telegram_config?.chat_id ?? "" } as any);
      } else {
        const created = await api.createPlaybook(payload);
        setPlaybooks(pbs => [created, ...pbs]);
        setSelected(created);
        setForm({ ...created, telegram_chat_id: created.telegram_config?.chat_id ?? "" } as any);
      }
    } catch (err) {
      alert("Save failed: " + err);
    } finally {
      setSaving(false);
    }
  };

  const deletePlaybook = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}"?`)) return;
    try {
      await api.deletePlaybook(selected.id);
      setPlaybooks(pbs => pbs.filter(p => p.id !== selected.id));
      setSelected(null);
      setForm(blank());
    } catch (err) {
      alert("Delete failed: " + err);
    }
  };

  const startRun = async () => {
    if (!selected) { alert("Save the playbook first"); return; }
    setRunModal(false);
    setTestResult(null);
    setTestRunning(true);
    try {
      const result = await api.runPlaybook(selected.id, inputText);
      setTestResult({ output: result.output, trace: result.trace, tokens: result.tokens });
    } catch (err) {
      alert("Run failed: " + err);
    } finally {
      setTestRunning(false);
    }
  };

  const deploy = async () => {
    if (!selected) return;
    setDeploying(true);
    try {
      const updated = await api.deployPlaybook(selected.id);
      setPlaybooks(pbs => pbs.map(p => p.id === selected.id ? updated : p));
      setSelected(updated);
      setForm({ ...updated, telegram_chat_id: updated.telegram_config?.chat_id ?? "" } as any);
    } catch (err) { alert("Deploy failed: " + err); }
    finally { setDeploying(false); }
  };

  const stopDeploy = async () => {
    if (!selected) return;
    setDeploying(true);
    try {
      const updated = await api.stopPlaybook(selected.id);
      setPlaybooks(pbs => pbs.map(p => p.id === selected.id ? updated : p));
      setSelected(updated);
      setForm({ ...updated });
    } catch (err) { alert("Stop failed: " + err); }
    finally { setDeploying(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="playbooks-layout">
        {/* Left: playbook list */}
        <div className="playbooks-list">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px" }}>Playbooks</div>
            <button className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", fontSize: 11 }} onClick={newPlaybook}>+ New</button>
          </div>
          {playbooks.map(pb => (
            <div key={pb.id} className={`playbook-item ${selected?.id === pb.id ? "active" : ""}`} onClick={() => selectPlaybook(pb)}>
              <div className="playbook-item-name">📋 {pb.name}{pb.is_live && <span style={{ marginLeft: 6, fontSize: 10, background: theme.greenDim, color: theme.green, padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>LIVE</span>}</div>
              <div className="playbook-item-sub">{pb.agent_ids.length} agent{pb.agent_ids.length !== 1 ? "s" : ""} · {pb.trigger_type}</div>
            </div>
          ))}
          {playbooks.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted, textAlign: "center", padding: "20px 0" }}>No playbooks yet</div>}
        </div>

        {/* Right: form */}
        <div className="playbook-form">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="playbook-form-title">{selected ? "Edit Playbook" : "New Playbook"}</div>
              {selected?.is_live && <span style={{ fontSize: 11, background: theme.greenDim, color: theme.green, padding: "2px 8px", borderRadius: 10, fontWeight: 600, border: `1px solid ${theme.green}44` }}>🟢 Live</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {selected && <button className="btn btn-danger btn-sm" onClick={deletePlaybook}>🗑 Delete</button>}
              <button className="btn btn-ghost btn-sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "💾 Save"}</button>
              {selected && <button className="btn btn-ghost btn-sm" onClick={() => setRunModal(true)}>▶ Test Run</button>}
              {selected && !selected.is_live && (
                <button className="btn btn-primary btn-sm" onClick={deploy} disabled={deploying} style={{ background: theme.green }}>
                  {deploying ? "Deploying…" : "🚀 Deploy"}
                </button>
              )}
              {selected?.is_live && (
                <button className="btn btn-danger btn-sm" onClick={stopDeploy} disabled={deploying}>
                  {deploying ? "Stopping…" : "⏹ Stop"}
                </button>
              )}
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 18 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Playbook Name</label>
              <input className="form-input" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer Support Team" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description (optional)" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Playbook — describe the use case and routing logic</label>
            <textarea
              className="form-input form-textarea"
              style={{ minHeight: 160, fontFamily: "'DM Mono', monospace", fontSize: 13, lineHeight: 1.6 }}
              value={form.playbook_text || ""}
              onChange={e => setForm(f => ({ ...f, playbook_text: e.target.value }))}
              placeholder={`Example:\n\nYou are a customer support supervisor managing three specialist agents.\n\nRoute billing questions to BillingAgent.\nRoute technical issues to TechAgent.\nRoute angry or escalating users to EscalationAgent.\n\nAlways greet the user and summarise the resolution at the end.`}
            />
          </div>

          <div className="section-label">Agents</div>
          <div className="agent-check-grid" style={{ marginBottom: 18 }}>
            {allAgents.map((a: any) => {
              const checked = form.agent_ids?.includes(a.id);
              return (
                <div key={a.id} className={`tool-checkbox ${checked ? "checked" : ""}`} onClick={() => toggleAgent(a.id)}>
                  <span>{checked ? "✓" : "○"}</span>
                  <span>{a.emoji || "🤖"} {a.name}</span>
                </div>
              );
            })}
            {allAgents.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted }}>No agents yet — create one in the Agents tab first.</div>}
          </div>

          <div className="form-row" style={{ marginBottom: 18 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Supervisor Model</label>
              <ModelCombobox value={form.supervisor_model || "gpt-5.4-mini-2026-03-17"} onChange={m => setForm(f => ({ ...f, supervisor_model: m }))} models={platformConfig.models} inputClassName="form-select" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Trigger</label>
              <div className="radio-group">
                {TRIGGERS.map(t => (
                  <div key={t} className={`radio-option ${form.trigger_type === t ? "selected" : ""}`} onClick={() => setForm(f => ({ ...f, trigger_type: t }))}>
                    {t === "manual" ? "▶ Manual" : t === "telegram" ? "📡 Telegram" : "⏰ Schedule"}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {form.trigger_type === "telegram" && (
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label">Chat ID <span style={{ color: theme.textMuted, fontWeight: 400 }}>(leave blank to respond to any chat)</span></label>
              <input className="form-input" style={{ fontFamily: "'DM Mono', monospace" }} value={(form as any).telegram_chat_id || ""} onChange={e => setForm(f => ({ ...f, telegram_chat_id: e.target.value } as any))} placeholder="e.g. 123456789 — message @userinfobot on Telegram to get yours" />
            </div>
          )}

          {form.trigger_type === "schedule" && (
            <div className="form-group">
              <label className="form-label">Cron Expression</label>
              <input className="form-input" style={{ fontFamily: "'DM Mono', monospace" }} value={form.schedule_cron || ""} onChange={e => setForm(f => ({ ...f, schedule_cron: e.target.value || null }))} placeholder="e.g. 0 9 * * * (every day at 9am)" />
            </div>
          )}
        </div>
      </div>

      {/* Run result tray */}
      {(testRunning || testResult) && (
        <div style={{ height: 220, background: theme.surface, borderTop: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", borderBottom: `1px solid ${theme.border}`, gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px" }}>Test Run</div>
            {testRunning && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: theme.accentDim, color: theme.accent, fontWeight: 600, animation: "pulse 1s infinite" }}>● running</span>}
            {testResult && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: theme.greenDim, color: theme.green, fontWeight: 600 }}>✓ done · {testResult.tokens.toLocaleString()} tokens</span>}
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => setTestResult(null)}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px", display: "flex", gap: 16 }}>
            {testRunning && <div style={{ fontSize: 13, color: theme.textMuted, fontStyle: "italic" }}>Running…</div>}
            {testResult && (
              <>
                <div style={{ flex: 1, borderRight: `1px solid ${theme.border}`, paddingRight: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Output</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", color: theme.text }}>{testResult.output || "(no output)"}</div>
                </div>
                <div style={{ width: 280, flexShrink: 0, overflowY: "auto" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Trace</div>
                  <TracePanel events={testResult.trace} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Run modal */}
      {runModal && (
        <div className="overlay" onClick={() => setRunModal(false)}>
          <div className="drawer" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
            <div className="drawer-title">Run Playbook</div>
            <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 20 }}>
              Playbook: <span style={{ color: theme.accent, fontWeight: 600 }}>{selected?.name}</span>
            </div>
            <div className="form-group">
              <label className="form-label">Input Message</label>
              <textarea className="form-input form-textarea" style={{ minHeight: 80 }} value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Enter the input for this playbook run…" />
            </div>
            <div className="drawer-footer">
              <button className="btn btn-ghost" onClick={() => setRunModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={startRun} disabled={!inputText.trim()}>▶ Start Run</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("agents");

  const nav = [
    { id: "agents", icon: "🤖", label: "Agents" },
    { id: "workflows", icon: "🔀", label: "Workflows" },
    { id: "chat", icon: "💬", label: "Chat" },
    { id: "runs", icon: "▶️", label: "Runs & Logs" },
  ];

  const titles: Record<string, string> = {
    agents: "Agents",
    workflows: "Workflows",
    chat: "Chat",
    runs: "Runs & Monitoring",
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="app">
        <div className="sidebar">
          <div className="logo">
            <div className="logo-icon">⚡</div>
            <span>AI Platform</span>
          </div>
          <div className="nav-section">
            <div className="nav-label">Platform</div>
            {nav.map(n => (
              <div key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
                <span className="icon">{n.icon}</span>
                {n.label}
              </div>
            ))}
          </div>
        </div>
        <div className="main">
          <div className="topbar">
            <div className="page-title">{titles[page]}</div>
            <div className="topbar-actions"></div>
          </div>
          <div className="content" style={["workflows","chat"].includes(page) ? {padding:0,display:"flex",flexDirection:"column",flex:1,overflow:"hidden"} : {}}>
            {page === "agents" && <AgentsPage />}
            {page === "workflows" && <WorkflowsPage />}
            {page === "chat" && <ChatPage />}
            {page === "runs" && <RunsPage />}
          </div>
        </div>
      </div>
    </>
  );
}
