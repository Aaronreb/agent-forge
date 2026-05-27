const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Agents
  listAgents: () => req<Agent[]>("/agents"),
  getAgent: (id: string) => req<Agent>(`/agents/${id}`),
  createAgent: (body: Partial<Agent>) => req<Agent>("/agents", { method: "POST", body: JSON.stringify(body) }),
  updateAgent: (id: string, body: Partial<Agent>) => req<Agent>(`/agents/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAgent: (id: string) => req<void>(`/agents/${id}`, { method: "DELETE" }),
  deployAgent: (id: string) => req<Agent>(`/agents/${id}/deploy`, { method: "POST" }),
  stopAgent: (id: string) => req<Agent>(`/agents/${id}/stop`, { method: "POST" }),
  testAgent: (id: string, message: string) => req<AgentTestResult>(`/agents/${id}/test`, { method: "POST", body: JSON.stringify({ message }) }),
  listTools: () => req<Tool[]>("/agents/tools/list"),
  listChannels: () => req<Channel[]>("/agents/channels/list"),
  createChannel: (body: { type: string; config: Record<string, unknown> }) =>
    req<Channel>("/agents/channels", { method: "POST", body: JSON.stringify(body) }),

  // Workflows
  listWorkflows: () => req<WorkflowAPI[]>("/workflows"),
  getWorkflow: (id: string) => req<WorkflowAPI>(`/workflows/${id}`),
  createWorkflow: (body: WorkflowPayload) => req<WorkflowAPI>("/workflows", { method: "POST", body: JSON.stringify(body) }),
  updateWorkflow: (id: string, body: WorkflowPayload) => req<WorkflowAPI>(`/workflows/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteWorkflow: (id: string) => req<void>(`/workflows/${id}`, { method: "DELETE" }),

  // Runs
  listRuns: () => req<RunAPI[]>("/runs"),
  getRun: (id: string) => req<RunAPI>(`/runs/${id}`),
  createRun: (workflow_id: string, input_text: string, trigger = "manual", is_test = false) =>
    req<RunAPI>("/runs", { method: "POST", body: JSON.stringify({ workflow_id, input_text, trigger, is_test }) }),
  cancelRun: (id: string) => req<{ status: string }>(`/runs/${id}/cancel`, { method: "POST" }),
  getRunMessages: (id: string) => req<Message[]>(`/runs/${id}/messages`),
  getRunSteps: (id: string) => req<RunStep[]>(`/runs/${id}/steps`),
  getRunTrace: (id: string) => req<any[]>(`/runs/${id}/trace`),

  // Playbooks
  listPlaybooks: () => req<Playbook[]>("/playbooks"),
  getPlaybook: (id: string) => req<Playbook>(`/playbooks/${id}`),
  createPlaybook: (body: Partial<Playbook>) => req<Playbook>("/playbooks", { method: "POST", body: JSON.stringify(body) }),
  updatePlaybook: (id: string, body: Partial<Playbook>) => req<Playbook>(`/playbooks/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePlaybook: (id: string) => req<void>(`/playbooks/${id}`, { method: "DELETE" }),
  runPlaybook: (id: string, input_text: string) => req<TestResult>(`/playbooks/${id}/run`, { method: "POST", body: JSON.stringify({ input_text }) }),
  deployPlaybook: (id: string) => req<Playbook>(`/playbooks/${id}/deploy`, { method: "POST" }),
  stopPlaybook: (id: string) => req<Playbook>(`/playbooks/${id}/stop`, { method: "POST" }),

  // Workflow deploy/stop
  deployWorkflow: (id: string) => req<WorkflowAPI>(`/workflows/${id}/deploy`, { method: "POST" }),
  stopWorkflow: (id: string) => req<WorkflowAPI>(`/workflows/${id}/stop`, { method: "POST" }),

  // Chat
  chatSend: (source_type: "playbook" | "agent" | "workflow", source_id: string, message: string, session_id?: string) =>
    req<ChatResult>("/chat/send", { method: "POST", body: JSON.stringify({ source_type, source_id, message, session_id }) }),
  listChatSessions: (source_type: "playbook" | "agent" | "workflow", source_id: string) =>
    req<ChatSession[]>(`/chat/sessions?source_type=${source_type}&source_id=${source_id}`),
  getChatSessionMessages: (session_id: string) =>
    req<ChatSessionMessage[]>(`/chat/session/${session_id}/messages`),

  // Config
  getConfig: () => req<PlatformConfig>("/config/options"),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlatformConfig {
  models: string[];
  channels: string[];
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
  model: string;
  memory_enabled: boolean;
  memory_window_k: number;
  guardrails: Record<string, unknown>;
  schedule_cron: string | null;
  tools: Tool[];
  channels: Channel[];
  created_at: string;
  tool_ids?: string[];
  channel_ids?: string[];
  emoji?: string;
  color?: string;
  status?: string;
  is_live?: boolean;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
}

export interface Channel {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface StartNodeConfig {
  trigger_type: "manual" | "schedule" | "webhook";
  cron?: string;
}

export interface RouterNodeConfig {
  routing_prompt: string;
  router_model: string;
}

// A node descriptor stored in the workflow JSONB — semantic data only, no positions
export interface CanvasNode {
  id: string;
  type: "trigger" | "compiled_agent" | "router_prompt" | "end";
  config: Record<string, unknown>;
}

// An edge descriptor stored in the workflow JSONB
export interface CanvasEdge {
  source: string;
  target: string;
  condition_value?: string;
}

export interface WorkflowAPI {
  id: string;
  name: string;
  description: string;
  is_live: boolean;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  created_at: string;
}

export interface WorkflowPayload {
  name: string;
  description: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface RunAPI {
  id: string;
  workflow_id: string | null;
  playbook_id: string | null;
  workflow_name: string;
  trigger: string;
  status: string;
  input_text: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  tokens_used: number;
  cost_usd: number;
  langsmith_url?: string | null;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  playbook_text: string;
  agent_ids: string[];
  supervisor_model: string;
  trigger_type: string;
  schedule_cron: string | null;
  telegram_config: { bot_token?: string; chat_id?: string } | null;
  is_live: boolean;
  created_at: string;
}

export interface RunStep {
  agent_id: string | null;
  role: string;
  messages: Array<{ role: string; content: string }>;
  tokens: number;
  cost_usd: number;
  started_at: string;
  finished_at: string;
}

export interface AgentTestResult {
  status: string;
  output: string;
  messages: Array<{ role: string; content: string; tool_calls?: Array<{ name: string; args: Record<string, unknown> }>; tool_name?: string }>;
  tokens_used: number;
  duration_seconds: number;
}

export interface Message {
  id: string;
  run_id: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  role: string;
  content: string;
  tokens_used: number;
  cost_usd: number;
  created_at: string;
}

export interface TraceEvent {
  type: string;
  agent?: string;
  to?: string;
  from?: string;
  tool?: string;
  input?: string;
  output?: string;
  tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  content?: string;
  error?: string;
}

export interface TestResult {
  output: string;
  trace: TraceEvent[];
  tokens: number;
}

export interface ChatResult {
  run_id: string;
  output: string;
  trace: TraceEvent[];
  tokens: number;
}

export interface ChatSession {
  session_id: string;
  started_at: string;
  last_at: string;
  run_count: number;
  first_message: string;
}

export interface ChatSessionMessage {
  role: "user" | "assistant";
  content: string;
  run_id: string;
  created_at: string;
}

// Legacy aliases
export type Workflow = WorkflowAPI;
export type Run = RunAPI;
