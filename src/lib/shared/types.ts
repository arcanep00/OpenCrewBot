// Types shared by the server and the browser. Everything here is plain JSON.

export interface BotTools {
  /** Tavily search, extract and crawl. */
  webSearch: boolean;
  /** Read and update the bot's MEMORY.md. */
  memory: boolean;
  /** Let the model write one TypeScript function that calls several tools at once. */
  codeMode: boolean;
  /** A real browser (Playwright) the bot can drive. */
  browser: boolean;
  /** The bot may stop and ask you a question with a card in chat. */
  askUser: boolean;
}

export interface Bot {
  id: string;
  name: string;
  /** Lowercase handle used for @mentions in rooms. */
  handle: string;
  title: string;
  description: string;
  instructions: string;
  emoji: string;
  color: string;
  model: string;
  tools: BotTools;
  /** Connection ids this bot may use: `composio:<toolkit>` or `mcp:<serverId>`. */
  connections: string[];
  approval: ApprovalMode;
  pinned: boolean;
  createdAt: string;
}

export type BotInput = Omit<Bot, "id" | "createdAt" | "handle" | "connections"> & { handle?: string; connections?: string[] };

export type RoomResponder = "auto" | "lead" | "everyone";

export interface Room {
  id: string;
  name: string;
  topic: string;
  emoji: string;
  memberIds: string[];
  leadId: string | null;
  responder: RoomResponder;
  pinned: boolean;
  createdAt: string;
}

export type RoomInput = Omit<Room, "id" | "createdAt">;

/** `dm:<botId>` or `room:<roomId>`. */
export type ConversationId = string;

export interface Source {
  title: string;
  url: string;
}

export type ToolStatus = "running" | "awaiting-approval" | "done" | "error" | "denied";

export type Part =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string }
  | {
      kind: "tool";
      toolCallId: string;
      name: string;
      label: string;
      detail?: string;
      status: ToolStatus;
      preview?: string;
      sources?: Source[];
    }
  | {
      kind: "question";
      toolCallId: string;
      question: string;
      options: { label: string; description?: string }[];
      answer?: string;
    };

export type MessageStatus = "streaming" | "done" | "error" | "stopped";

export interface RouteNote {
  by: "mention" | "jev" | "lead" | "everyone" | "handoff";
  confidence?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: ConversationId;
  role: "user" | "bot" | "notice";
  botId?: string;
  createdAt: string;
  status: MessageStatus;
  parts: Part[];
  model?: string;
  usage?: { input: number; output: number; costUsd: number | null };
  route?: RouteNote;
  error?: string;
}

export interface ConversationSummary {
  id: ConversationId;
  lastMessage?: { text: string; createdAt: string; author: string };
  running: string[];
  unread: number;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  context: number;
  tools: boolean;
  reasoning: boolean;
  vision: boolean;
  inputPerM: number | null;
  outputPerM: number | null;
  live: boolean;
  providerKey?: "nebius" | "openai" | "anthropic";
}

export interface AppStatus {
  mock: boolean;
  keys: { nebius: boolean; tavily: boolean; jev: boolean; browserbase: boolean; composio: boolean; openai: boolean; anthropic: boolean };
  dataDir: string;
}

/** Events the server pushes to the browser over one SSE stream. */
export type ServerEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "delta"; conversationId: ConversationId; messageId: string; partIndex: number; kind: "text" | "reasoning"; delta: string }
  | { type: "running"; conversationId: ConversationId; botIds: string[] }
  | { type: "bots-changed" }
  | { type: "rooms-changed" }
  | { type: "memory-changed"; botId: string }
  /** A bot's Browserbase live view opened (url) or closed (null). */
  | { type: "browser-session"; botId: string; liveUrl: string | null }
  | { type: "connections-changed" };

/** An app from Composio's catalog, with this install's connection state. */
export interface ComposioApp {
  slug: string;
  name: string;
  logo?: string;
  connected: boolean;
}

/** A remote MCP server you added. The token never leaves the server. */
export interface McpServer {
  id: string;
  name: string;
  url: string;
  hasToken: boolean;
  headerNames: string[];
}

export interface ConnectionsState {
  composio: { enabled: boolean; apps: ComposioApp[]; error?: string };
  mcpServers: McpServer[];
}

/** Something a bot can be given access to. */
export interface ConnectionOption {
  id: string;
  name: string;
  kind: "composio" | "mcp";
  logo?: string;
}

export type ApprovalMode = "ask" | "controlled" | "full";

export type TaskStatus = "pending" | "running" | "done" | "error" | "cancelled" | "awaiting-approval";

export interface Task {
  id: string;
  planId: string;
  title: string;
  description: string;
  assignedBotId: string | null;
  dependsOn: string[];
  status: TaskStatus;
  startedAt: string | null;
  completedAt: string | null;
  output: string | null;
  error: string | null;
  requiresApproval: boolean;
  retryCount: number;
  createdAt: string;
}

export interface TaskPlan {
  id: string;
  conversationId: ConversationId;
  instruction: string;
  status: "running" | "done" | "error" | "cancelled";
  tasks: Task[];
  createdAt: string;
  completedAt: string | null;
}

export type ScheduleFrequency = "manual" | "hourly" | "daily" | "weekly";

export interface ScheduledWorkflow {
  id: string;
  name: string;
  description: string;
  roomId: string | null;
  botId: string | null;
  instruction: string;
  frequency: ScheduleFrequency;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "done" | "error";
  output: string | null;
  error: string | null;
}

export type AuditAction = "tool-approved" | "tool-denied" | "agent-created" | "agent-deleted" | "workflow-triggered" | "memory-edited";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  botId: string | null;
  conversationId: string | null;
  detail: string;
  createdAt: string;
}

export type SkillId =
  | "market-research"
  | "competitor-analysis"
  | "financial-modelling"
  | "presentation-creation"
  | "email-drafting"
  | "code-review"
  | "data-analysis"
  | "lead-generation";

export interface Skill {
  id: SkillId;
  name: string;
  description: string;
  instructions: string;
  requiredTools: (keyof BotTools)[];
}
