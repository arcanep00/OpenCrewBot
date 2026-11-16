// What the API routes call. Keeps validation and side effects in one place.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Bot, BotInput, ChatMessage, ConversationId, ConversationSummary, Room, RoomInput } from "@/lib/shared/types";
import { DATA_DIR } from "./config";
import { InputError } from "./errors";
import * as store from "./db";
import { publish } from "./bus";
import { DEFAULT_MODEL } from "./models";
import { deleteWorkspace, writeMemory } from "./memory-files";
import { forgetConversation, resetBot, runTurn, runningBots, stopConversation } from "./runtime";
import { messagePreview } from "@/lib/shared/preview";
import { roomConversationId, runRoom } from "./rooms";
import { bootstrapScheduler } from "./scheduler";
import { createWorkflow } from "./scheduler";

export { InputError };

// ── seeding and restart cleanup (once per process) ──────────────────────

const g = globalThis as unknown as { __opencrewbotBoot?: Promise<void> };

export function boot(): Promise<void> {
  g.__opencrewbotBoot ??= (async () => {
    await sweepInterrupted();
    await seed();
    await seedMeetUniversity();
    await bootstrapScheduler();
  })();
  return g.__opencrewbotBoot;
}

/** A turn that was streaming when the server stopped can't resume. Say so. */
async function sweepInterrupted() {
  const client = await store.db();
  const rows = await client.execute(`SELECT data FROM messages WHERE data LIKE '%"status":"streaming"%'`);
  for (const r of rows.rows) {
    const m = JSON.parse(String(r.data)) as ChatMessage;
    if (m.status !== "streaming") continue;
    m.status = "stopped";
    m.error = "Interrupted by a server restart.";
    for (const p of m.parts) if (p.kind === "tool" && (p.status === "running" || p.status === "awaiting-approval")) p.status = "denied";
    await store.saveMessage(m);
  }
}

const SEED_MARKER = join(DATA_DIR, ".seeded");

async function seed() {
  if (existsSync(SEED_MARKER)) return;
  const tools = { webSearch: true, memory: true, codeMode: false, browser: false, askUser: true };
  const scout = await createBot({
    name: "Scout",
    title: "Research",
    description: "Finds things out on the web and comes back with sourced answers.",
    instructions:
      "Research before answering anything time-sensitive. Search, read the best two or three sources, then answer with the URLs you used. Say plainly when sources disagree or you couldn't verify something.",
    emoji: "🔭",
    color: "#2f7df6",
    model: DEFAULT_MODEL,
    tools: { ...tools, codeMode: true },
    approval: "ask",
    pinned: true,
  });
  const quill = await createBot({
    name: "Quill",
    title: "Writing",
    description: "Turns notes and research into clear posts, docs and emails.",
    instructions:
      "Write in plain, specific language. Match the person's voice once you know it, and keep their style preferences in memory. Offer one tight draft, not three options.",
    emoji: "✒️",
    color: "#e0663d",
    model: DEFAULT_MODEL,
    tools: { ...tools, webSearch: false },
    approval: "ask",
    pinned: false,
  });
  const atlas = await createBot({
    name: "Atlas",
    title: "Planning",
    description: "Breaks goals into steps, keeps track of decisions, and pulls in teammates.",
    instructions:
      "Turn vague goals into a short, ordered plan with owners. Keep decisions and open questions in memory. In rooms, hand research to @scout and drafting to @quill.",
    emoji: "🧭",
    color: "#1f9d6b",
    model: DEFAULT_MODEL,
    tools,
    approval: "ask",
    pinned: false,
  });
  await createRoom({
    name: "Studio",
    topic: "Content and launches",
    emoji: "🎬",
    memberIds: [atlas.id, scout.id, quill.id],
    leadId: atlas.id,
    responder: "auto",
    pinned: true,
  });
  writeFileSync(SEED_MARKER, new Date().toISOString());
}

const MU_SEED_MARKER = join(DATA_DIR, ".seeded-meetuniversity");

async function seedMeetUniversity() {
  if (existsSync(MU_SEED_MARKER)) return;
  const tools = { webSearch: true, memory: true, codeMode: true, browser: false, askUser: true };

  const analyst = await createBot({
    name: "Priya",
    title: "Market Analyst",
    description: "Researches competitors, market trends, and business opportunities for MeetUniversity.",
    instructions:
      "You specialise in EdTech market research. When researching competitors, search for their products, pricing, target students, and positioning. Build comparison tables. Focus on MeetUniversity's three product lines: Aspirations (career discovery), Study Abroad, and School Partnerships. Always cite sources.",
    emoji: "📊",
    color: "#6366f1",
    model: DEFAULT_MODEL,
    tools,
    approval: "ask",
    pinned: false,
  });

  const marketer = await createBot({
    name: "Arjun",
    title: "Marketing Strategist",
    description: "Creates campaigns, content calendars, and messaging for MeetUniversity products.",
    instructions:
      "You specialise in marketing for EdTech targeting Indian students (Class 9–12). Create audience-first campaigns. For Aspirations, focus on career anxiety and discovery. For Study Abroad, focus on aspirations and practical steps. Write in a tone that resonates with teenagers and their parents. Output structured content plans.",
    emoji: "📣",
    color: "#f59e0b",
    model: DEFAULT_MODEL,
    tools: { ...tools, webSearch: true },
    approval: "ask",
    pinned: false,
  });

  const developer = await createBot({
    name: "Dev",
    title: "Technical Reviewer",
    description: "Inspects GitHub repositories, identifies issues, and proposes improvements.",
    instructions:
      "You review code and repositories for quality, security, and architecture. When inspecting a repo, check: code structure, documentation, test coverage, security issues, performance bottlenecks, dependency health. Prioritise findings: Critical / Major / Minor. Always ask for approval before suggesting any changes are made.",
    emoji: "⚙️",
    color: "#10b981",
    model: DEFAULT_MODEL,
    tools: { ...tools, codeMode: true },
    approval: "ask",
    pinned: false,
  });

  const dataBot = await createBot({
    name: "Sage",
    title: "Data Analyst",
    description: "Analyses sales data, identifies conversion bottlenecks, and produces business insights.",
    instructions:
      "You analyse business data for MeetUniversity. Focus on conversion funnels, segment performance, and revenue opportunities. When given data, calculate key metrics, identify patterns, and produce actionable recommendations. Use code mode for calculations. Present results in tables with clear business implications.",
    emoji: "🔢",
    color: "#ec4899",
    model: DEFAULT_MODEL,
    tools: { ...tools, codeMode: true },
    approval: "ask",
    pinned: false,
  });

  const marketIntelRoom = await createRoom({
    name: "Market Intelligence",
    topic: "Competitive research and market opportunities for MeetUniversity",
    emoji: "🔍",
    memberIds: [analyst.id, marketer.id],
    leadId: analyst.id,
    responder: "auto",
    pinned: false,
  });

  const campaignRoom = await createRoom({
    name: "Campaign Studio",
    topic: "Marketing campaigns for Aspirations — Class 11 students",
    emoji: "🎯",
    memberIds: [marketer.id, analyst.id],
    leadId: marketer.id,
    responder: "auto",
    pinned: false,
  });

  const devRoom = await createRoom({
    name: "Dev Review",
    topic: "Technical inspection and improvement planning",
    emoji: "🛠️",
    memberIds: [developer.id, dataBot.id],
    leadId: developer.id,
    responder: "lead",
    pinned: false,
  });

  const analyticsRoom = await createRoom({
    name: "Analytics",
    topic: "Sales data analysis and business recommendations",
    emoji: "📈",
    memberIds: [dataBot.id, analyst.id],
    leadId: dataBot.id,
    responder: "auto",
    pinned: false,
  });

  await createWorkflow({
    name: "Weekly Competitor Monitor",
    description: "Monitors MeetUniversity competitors every week and produces a summary report.",
    roomId: marketIntelRoom.id,
    botId: analyst.id,
    instruction:
      "Research the latest updates from MeetUniversity's competitors: iDreamCareer, Leverage Edu, Collegedunia, Shiksha, and Buddy4Study. Look for new products, pricing changes, partnerships, and marketing campaigns. Produce a structured weekly briefing with key changes and strategic implications for MeetUniversity.",
    frequency: "weekly",
  });

  await createWorkflow({
    name: "Daily Market Summary",
    description: "Daily summary of EdTech market news relevant to MeetUniversity.",
    roomId: null,
    botId: analyst.id,
    instruction:
      "Search for today's EdTech news in India. Focus on university admissions, career guidance, study abroad, and school partnership trends. Summarise the top 5 developments and their relevance to MeetUniversity.",
    frequency: "daily",
  });

  writeFileSync(MU_SEED_MARKER, new Date().toISOString());
}

// ── bots ────────────────────────────────────────────────────────────────

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "bot";
}

async function uniqueHandle(wanted: string, exceptId?: string): Promise<string> {
  const taken = new Set((await store.listBots()).filter((b) => b.id !== exceptId).map((b) => b.handle));
  const base = slug(wanted);
  let handle = base;
  for (let n = 2; taken.has(handle) || ["everyone", "all"].includes(handle); n++) handle = `${base}${n}`;
  return handle;
}

function validateBot(input: Partial<BotInput>) {
  if (input.name !== undefined && !input.name.trim()) throw new InputError("A bot needs a name.");
  if (input.name && input.name.length > 40) throw new InputError("Keep the name under 40 characters.");
  if (input.instructions && input.instructions.length > 8000) throw new InputError("Instructions are limited to 8,000 characters.");
}

export async function createBot(input: BotInput): Promise<Bot> {
  validateBot(input);
  const bot: Bot = {
    ...input,
    id: randomUUID().slice(0, 8),
    name: input.name.trim(),
    connections: input.connections ?? [],
    handle: await uniqueHandle(input.handle || input.name),
    createdAt: new Date().toISOString(),
  };
  await store.saveBot(bot);
  writeMemory(bot.id, `# ${bot.name}'s memory\n\n`);
  publish({ type: "bots-changed" });
  return bot;
}

export async function updateBot(id: string, patch: Partial<BotInput>): Promise<Bot> {
  const bot = await store.getBot(id);
  if (!bot) throw new InputError("That bot doesn't exist.");
  validateBot(patch);
  const next: Bot = {
    ...bot,
    ...patch,
    id: bot.id,
    createdAt: bot.createdAt,
    tools: { ...bot.tools, ...(patch.tools ?? {}) },
    handle: patch.handle !== undefined || patch.name !== undefined ? await uniqueHandle(patch.handle || patch.name || bot.handle, id) : bot.handle,
  };
  await store.saveBot(next);
  await resetBot(id);
  publish({ type: "bots-changed" });
  return next;
}

export async function deleteBot(id: string): Promise<void> {
  await stopConversation(`dm:${id}`);
  await resetBot(id);
  await store.deleteBotRow(id);
  await store.clearMessages(`dm:${id}`);
  for (const room of await store.listRooms()) {
    if (!room.memberIds.includes(id)) continue;
    const memberIds = room.memberIds.filter((m) => m !== id);
    await store.saveRoom({ ...room, memberIds, leadId: room.leadId === id ? (memberIds[0] ?? null) : room.leadId });
  }
  deleteWorkspace(id);
  publish({ type: "bots-changed" });
  publish({ type: "rooms-changed" });
}

// ── rooms ───────────────────────────────────────────────────────────────

async function cleanRoomInput<T extends Partial<RoomInput>>(input: T): Promise<T> {
  if (input.name !== undefined && !input.name.trim()) throw new InputError("A room needs a name.");
  if (input.memberIds) {
    const known = new Set((await store.listBots()).map((b) => b.id));
    input.memberIds = [...new Set(input.memberIds)].filter((id) => known.has(id));
  }
  return input;
}

export async function createRoom(input: RoomInput): Promise<Room> {
  const clean = await cleanRoomInput(input);
  const room: Room = {
    ...clean,
    id: randomUUID().slice(0, 8),
    name: clean.name.trim(),
    leadId: clean.leadId && clean.memberIds.includes(clean.leadId) ? clean.leadId : (clean.memberIds[0] ?? null),
    createdAt: new Date().toISOString(),
  };
  await store.saveRoom(room);
  publish({ type: "rooms-changed" });
  return room;
}

export async function updateRoom(id: string, patch: Partial<RoomInput>): Promise<Room> {
  const room = await store.getRoom(id);
  if (!room) throw new InputError("That room doesn't exist.");
  const clean = await cleanRoomInput(patch);
  const next: Room = { ...room, ...clean, id: room.id, createdAt: room.createdAt };
  if (!next.leadId || !next.memberIds.includes(next.leadId)) next.leadId = next.memberIds[0] ?? null;
  await store.saveRoom(next);
  publish({ type: "rooms-changed" });
  return next;
}

export async function deleteRoom(id: string): Promise<void> {
  const conversationId = roomConversationId(id);
  await stopConversation(conversationId);
  await store.deleteRoomRow(id);
  await store.clearMessages(conversationId);
  publish({ type: "rooms-changed" });
}

// ── conversations ───────────────────────────────────────────────────────

function parseConversation(conversationId: ConversationId): { kind: "dm" | "room"; id: string } {
  const [kind, id] = conversationId.split(":");
  if ((kind !== "dm" && kind !== "room") || !id) throw new InputError("Unknown conversation.");
  return { kind, id };
}

export async function sendMessage(conversationId: ConversationId, text: string): Promise<ChatMessage> {
  const content = text.trim();
  if (!content) throw new InputError("Type a message first.");
  if (content.length > 20000) throw new InputError("Messages are limited to 20,000 characters.");
  const { kind, id } = parseConversation(conversationId);

  const bot = kind === "dm" ? await store.getBot(id) : null;
  const room = kind === "room" ? await store.getRoom(id) : null;
  if (kind === "dm" && !bot) throw new InputError("That bot doesn't exist.");
  if (kind === "room" && !room) throw new InputError("That room doesn't exist.");
  if (room && room.memberIds.length === 0) throw new InputError("Add at least one bot to this room first.");

  const message: ChatMessage = {
    id: randomUUID(),
    conversationId,
    role: "user",
    createdAt: new Date().toISOString(),
    status: "done",
    parts: [{ kind: "text", text: content }],
  };
  await store.saveMessage(message);
  await store.markRead(conversationId);
  publish({ type: "message", message });

  // The reply streams over SSE; the request returns as soon as it's queued.
  if (bot) void runTurn({ bot, conversationId, content }).catch(() => {});
  if (room) void runRoom(room, message).catch(() => {});
  return message;
}

export async function clearConversation(conversationId: ConversationId): Promise<void> {
  parseConversation(conversationId);
  await stopConversation(conversationId);
  await store.clearMessages(conversationId);
  await store.bumpGeneration(conversationId);
  forgetConversation(conversationId);
}

export async function summaries(): Promise<ConversationSummary[]> {
  const [bots, rooms, last, unread] = await Promise.all([store.listBots(), store.listRooms(), store.lastMessages(), store.unreadCounts()]);
  const names = new Map(bots.map((b) => [b.id, b.name]));
  const ids = [...bots.map((b) => `dm:${b.id}`), ...rooms.map((r) => roomConversationId(r.id))];
  return ids.map((id) => {
    const m = last.get(id);
    return {
      id,
      running: runningBots(id),
      unread: unread.get(id) ?? 0,
      lastMessage: m
        ? {
            text: messagePreview(m),
            createdAt: m.createdAt,
            author: m.role === "user" ? "You" : (names.get(m.botId ?? "") ?? "Bot"),
          }
        : undefined,
    };
  });
}
