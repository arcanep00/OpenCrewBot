// App storage: bots, rooms, and the chat transcript the UI shows. Mastra keeps
// its own store (mastra.db) for each bot's model-facing thread history.
import { createClient, type Client } from "@libsql/client";
import { APP_DB_URL } from "./config";
import type { Bot, ChatMessage, ConversationId, Room } from "@/lib/shared/types";

// Cached across hot reloads, together with the file it points at, so a
// changed database path opens a fresh connection instead of reusing one
// bound to a file that has moved.
const g = globalThis as unknown as { __opencrewbotDb?: { url: string; schema?: number; client: Promise<Client> } };

/** Bump when a table is added, so a hot-reloaded server re-runs the CREATE statements. */
const SCHEMA_VERSION = 3;

async function open(): Promise<Client> {
  const db = createClient({ url: APP_DB_URL });
  await db.batch(
    [
      "CREATE TABLE IF NOT EXISTS bots (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages (conversation_id, created_at)",
      "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL)",
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        generation INTEGER NOT NULL DEFAULT 0,
        last_read_at TEXT
      )`,
      // ── Task Execution Engine (Module D) ──────────────────────────────
      `CREATE TABLE IF NOT EXISTS task_plans (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS task_plans_by_conversation ON task_plans (conversation_id, created_at)",
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS tasks_by_plan ON tasks (plan_id)",
      // ── Scheduled Workflows (Module I) ────────────────────────────────
      `CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        data TEXT NOT NULL,
        started_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS workflow_runs_by_workflow ON workflow_runs (workflow_id, started_at)",
      // ── Audit Log (Module G) ──────────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS audit_by_time ON audit_log (created_at)",
      // ── Shared Memory (Module E) ──────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS shared_memory (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
    "write",
  );
  return db;
}

export function db(): Promise<Client> {
  const cached = g.__opencrewbotDb;
  if (cached?.url === APP_DB_URL && cached.schema === SCHEMA_VERSION) return cached.client;
  // Close the old connection (an older build cached the bare promise).
  const stale = cached && "client" in cached ? cached.client : (cached as unknown as Promise<Client> | undefined);
  void stale?.then((c) => c.close()).catch(() => {});
  const client = open();
  g.__opencrewbotDb = { url: APP_DB_URL, schema: SCHEMA_VERSION, client };
  return client;
}

// ── settings (small JSON values) ────────────────────────────────────────

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const rows = await (await db()).execute({ sql: "SELECT data FROM settings WHERE key = ?", args: [key] });
  return rows.rows[0] ? (JSON.parse(String(rows.rows[0].data)) as T) : undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await db()).execute({
    sql: "INSERT INTO settings (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data",
    args: [key, JSON.stringify(value)],
  });
}

// ── bots ────────────────────────────────────────────────────────────────

/** Fill in fields added after a bot was saved, so older rows keep working. */
function normalizeBot(raw: Bot): Bot {
  return {
    ...raw,
    connections: raw.connections ?? [],
  };
}

export async function listBots(): Promise<Bot[]> {
  const rows = await (await db()).execute("SELECT data FROM bots");
  return rows.rows
    .map((r) => normalizeBot(JSON.parse(String(r.data)) as Bot))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getBot(id: string): Promise<Bot | null> {
  const rows = await (await db()).execute({ sql: "SELECT data FROM bots WHERE id = ?", args: [id] });
  return rows.rows[0] ? normalizeBot(JSON.parse(String(rows.rows[0].data)) as Bot) : null;
}

export async function saveBot(bot: Bot): Promise<void> {
  await (await db()).execute({
    sql: "INSERT INTO bots (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    args: [bot.id, JSON.stringify(bot)],
  });
}

export async function deleteBotRow(id: string): Promise<void> {
  await (await db()).execute({ sql: "DELETE FROM bots WHERE id = ?", args: [id] });
}

// ── rooms ───────────────────────────────────────────────────────────────

export async function listRooms(): Promise<Room[]> {
  const rows = await (await db()).execute("SELECT data FROM rooms");
  return rows.rows
    .map((r) => JSON.parse(String(r.data)) as Room)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getRoom(id: string): Promise<Room | null> {
  const rows = await (await db()).execute({ sql: "SELECT data FROM rooms WHERE id = ?", args: [id] });
  return rows.rows[0] ? (JSON.parse(String(rows.rows[0].data)) as Room) : null;
}

export async function saveRoom(room: Room): Promise<void> {
  await (await db()).execute({
    sql: "INSERT INTO rooms (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    args: [room.id, JSON.stringify(room)],
  });
}

export async function deleteRoomRow(id: string): Promise<void> {
  await (await db()).execute({ sql: "DELETE FROM rooms WHERE id = ?", args: [id] });
}

// ── messages ────────────────────────────────────────────────────────────

export async function saveMessage(message: ChatMessage): Promise<void> {
  await (await db()).execute({
    sql: `INSERT INTO messages (id, conversation_id, created_at, data) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    args: [message.id, message.conversationId, message.createdAt, JSON.stringify(message)],
  });
}

export async function listMessages(conversationId: ConversationId, limit = 200): Promise<ChatMessage[]> {
  const rows = await (await db()).execute({
    sql: `SELECT data FROM (
            SELECT data, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?
          ) ORDER BY created_at ASC`,
    args: [conversationId, limit],
  });
  return rows.rows.map((r) => JSON.parse(String(r.data)) as ChatMessage);
}

export async function clearMessages(conversationId: ConversationId): Promise<void> {
  await (await db()).execute({ sql: "DELETE FROM messages WHERE conversation_id = ?", args: [conversationId] });
}

/** The newest message per conversation, for sidebar previews. */
export async function lastMessages(): Promise<Map<ConversationId, ChatMessage>> {
  const rows = await (await db()).execute(
    `SELECT m.data FROM messages m
     JOIN (SELECT conversation_id, MAX(created_at) AS latest FROM messages GROUP BY conversation_id) l
       ON m.conversation_id = l.conversation_id AND m.created_at = l.latest`,
  );
  const out = new Map<ConversationId, ChatMessage>();
  for (const r of rows.rows) {
    const m = JSON.parse(String(r.data)) as ChatMessage;
    out.set(m.conversationId, m);
  }
  return out;
}

export async function unreadCounts(): Promise<Map<ConversationId, number>> {
  const rows = await (await db()).execute(
    `SELECT m.conversation_id AS id, COUNT(*) AS n FROM messages m
     LEFT JOIN conversations c ON c.id = m.conversation_id
     WHERE m.created_at > COALESCE(c.last_read_at, '') AND m.data NOT LIKE '%"role":"user"%'
     GROUP BY m.conversation_id`,
  );
  return new Map(rows.rows.map((r) => [String(r.id), Number(r.n)]));
}

export async function markRead(conversationId: ConversationId): Promise<void> {
  await (await db()).execute({
    sql: `INSERT INTO conversations (id, last_read_at) VALUES (?, ?)
          ON CONFLICT(id) DO UPDATE SET last_read_at = excluded.last_read_at`,
    args: [conversationId, new Date().toISOString()],
  });
}

/** Bumped by "Clear chat" so each bot starts a fresh model-side thread. */
export async function conversationGeneration(conversationId: ConversationId): Promise<number> {
  const rows = await (await db()).execute({
    sql: "SELECT generation FROM conversations WHERE id = ?",
    args: [conversationId],
  });
  return rows.rows[0] ? Number(rows.rows[0].generation) : 0;
}

export async function bumpGeneration(conversationId: ConversationId): Promise<number> {
  await (await db()).execute({
    sql: `INSERT INTO conversations (id, generation) VALUES (?, 1)
          ON CONFLICT(id) DO UPDATE SET generation = generation + 1`,
    args: [conversationId],
  });
  return conversationGeneration(conversationId);
}

import type { Task, TaskPlan, ScheduledWorkflow, WorkflowRun, AuditEntry, AuditAction } from "@/lib/shared/types";

// ── task plans (Module D) ────────────────────────────────────────────────

export async function saveTaskPlan(plan: TaskPlan): Promise<void> {
  await (await db()).execute({
    sql: `INSERT INTO task_plans (id, conversation_id, data, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    args: [plan.id, plan.conversationId, JSON.stringify(plan), plan.createdAt],
  });
}

export async function getTaskPlan(id: string): Promise<TaskPlan | null> {
  const rows = await (await db()).execute({ sql: "SELECT data FROM task_plans WHERE id = ?", args: [id] });
  return rows.rows[0] ? (JSON.parse(String(rows.rows[0].data)) as TaskPlan) : null;
}

export async function listTaskPlans(conversationId?: ConversationId, limit = 50): Promise<TaskPlan[]> {
  const rows = conversationId
    ? await (await db()).execute({
        sql: "SELECT data FROM task_plans WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
        args: [conversationId, limit],
      })
    : await (await db()).execute({
        sql: "SELECT data FROM task_plans ORDER BY created_at DESC LIMIT ?",
        args: [limit],
      });
  return rows.rows.map((r) => JSON.parse(String(r.data)) as TaskPlan);
}

export async function saveTask(task: Task): Promise<void> {
  await (await db()).execute({
    sql: `INSERT INTO tasks (id, plan_id, data, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    args: [task.id, task.planId, JSON.stringify(task), task.createdAt],
  });
}

export async function listTasksForPlan(planId: string): Promise<Task[]> {
  const rows = await (await db()).execute({ sql: "SELECT data FROM tasks WHERE plan_id = ?", args: [planId] });
  return rows.rows.map((r) => JSON.parse(String(r.data)) as Task);
}

// ── workflows (Module I) ─────────────────────────────────────────────────

export async function saveWorkflow(wf: ScheduledWorkflow): Promise<void> {
  await (await db()).execute({
    sql: `INSERT INTO workflows (id, data, created_at) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    args: [wf.id, JSON.stringify(wf), wf.createdAt],
  });
}

export async function listWorkflows(): Promise<ScheduledWorkflow[]> {
  const rows = await (await db()).execute("SELECT data FROM workflows ORDER BY created_at ASC");
  return rows.rows.map((r) => JSON.parse(String(r.data)) as ScheduledWorkflow);
}

export async function getWorkflow(id: string): Promise<ScheduledWorkflow | null> {
  const rows = await (await db()).execute({ sql: "SELECT data FROM workflows WHERE id = ?", args: [id] });
  return rows.rows[0] ? (JSON.parse(String(rows.rows[0].data)) as ScheduledWorkflow) : null;
}

export async function deleteWorkflowRow(id: string): Promise<void> {
  await (await db()).execute({ sql: "DELETE FROM workflows WHERE id = ?", args: [id] });
}

export async function saveWorkflowRun(run: WorkflowRun): Promise<void> {
  await (await db()).execute({
    sql: `INSERT INTO workflow_runs (id, workflow_id, data, started_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    args: [run.id, run.workflowId, JSON.stringify(run), run.startedAt],
  });
}

export async function listWorkflowRuns(workflowId: string, limit = 20): Promise<WorkflowRun[]> {
  const rows = await (await db()).execute({
    sql: "SELECT data FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?",
    args: [workflowId, limit],
  });
  return rows.rows.map((r) => JSON.parse(String(r.data)) as WorkflowRun);
}

// ── audit log (Module G) ─────────────────────────────────────────────────

export async function appendAuditEntry(entry: Omit<AuditEntry, "id" | "createdAt">): Promise<AuditEntry> {
  const full: AuditEntry = { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await (await db()).execute({
    sql: "INSERT INTO audit_log (id, action, created_at, data) VALUES (?, ?, ?, ?)",
    args: [full.id, full.action, full.createdAt, JSON.stringify(full)],
  });
  return full;
}

export async function listAuditLog(limit = 100): Promise<AuditEntry[]> {
  const rows = await (await db()).execute({
    sql: "SELECT data FROM audit_log ORDER BY created_at DESC LIMIT ?",
    args: [limit],
  });
  return rows.rows.map((r) => JSON.parse(String(r.data)) as AuditEntry);
}

// ── shared memory (Module E) ─────────────────────────────────────────────

/** scope: `room:<roomId>` or `project:<name>` */
export async function getSharedMemory(scope: string): Promise<string> {
  const rows = await (await db()).execute({ sql: "SELECT data FROM shared_memory WHERE id = ?", args: [scope] });
  return rows.rows[0] ? (JSON.parse(String(rows.rows[0].data)) as { content: string }).content : "";
}

export async function setSharedMemory(scope: string, content: string): Promise<void> {
  const now = new Date().toISOString();
  await (await db()).execute({
    sql: `INSERT INTO shared_memory (id, scope, data, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [scope, scope, JSON.stringify({ content }), now],
  });
}

export async function listSharedMemoryScopes(): Promise<string[]> {
  const rows = await (await db()).execute("SELECT id FROM shared_memory ORDER BY updated_at DESC");
  return rows.rows.map((r) => String(r.id));
}
