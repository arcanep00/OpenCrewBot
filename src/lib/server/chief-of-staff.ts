// Chief of Staff — Module A
// Receives a complex natural-language instruction, breaks it into tasks,
// assigns each task to the right bot, runs independent tasks in parallel,
// monitors execution, handles failures, and consolidates results.

import type { Bot, TaskPlan, Task, ConversationId } from "@/lib/shared/types";
import { listBots, getBot } from "./db";
import { createTaskPlan, executePlan, updateTaskStatus, getFullPlan } from "./task-engine";
import { runTurn } from "./runtime";
import { saveMessage } from "./db";
import { isMock } from "./config";

// ── Capability matching ───────────────────────────────────────────────────

/** Score a bot for a given task description based on its role and instructions. */
function scoreBotForTask(bot: Bot, taskDescription: string): number {
  const text = (bot.title + " " + bot.instructions + " " + bot.description).toLowerCase();
  const task = taskDescription.toLowerCase();
  let score = 0;

  // Keyword matching between task and bot's declared role
  const keywords = task.split(/\W+/).filter((w) => w.length > 3);
  for (const kw of keywords) {
    if (text.includes(kw)) score++;
  }

  // Capability boosts
  if (/research|search|find|look|web|data/i.test(task) && bot.tools.webSearch) score += 3;
  if (/code|review|debug|implement|build|develop/i.test(task) && bot.tools.codeMode) score += 3;
  if (/browse|navigate|click|form|website/i.test(task) && bot.tools.browser) score += 3;
  if (/remember|memory|preference|save|note/i.test(task) && bot.tools.memory) score += 2;

  return score;
}

/** Pick the best bot for a task from a list of candidates. */
function pickBotForTask(bots: Bot[], taskDescription: string): Bot | null {
  if (!bots.length) return null;
  const scored = bots.map((b) => ({ bot: b, score: scoreBotForTask(b, taskDescription) }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].bot : bots[0];
}

// ── Task decomposition ────────────────────────────────────────────────────

interface RawTask {
  title: string;
  description: string;
  dependsOnTitles: string[];
  requiresApproval: boolean;
  keywords: string[];
}

/** Parse the LLM's task plan from its text output. */
function parsePlanFromText(text: string): RawTask[] {
  const tasks: RawTask[] = [];
  // Try JSON block first
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as Array<{
        title: string;
        description: string;
        dependsOn?: string[];
        requiresApproval?: boolean;
        keywords?: string[];
      }>;
      if (Array.isArray(parsed)) {
        return parsed.map((t) => ({
          title: t.title ?? "Task",
          description: t.description ?? "",
          dependsOnTitles: t.dependsOn ?? [],
          requiresApproval: t.requiresApproval ?? false,
          keywords: t.keywords ?? [],
        }));
      }
    } catch {
      // Fall through to line parsing
    }
  }

  // Fallback: numbered list
  const lines = text.split("\n");
  let current: Partial<RawTask> | null = null;
  for (const line of lines) {
    const numbered = line.match(/^\s*\d+[\.\)]\s*(.+)/);
    const bullet = line.match(/^\s*[-*]\s*(.+)/);
    const item = numbered?.[1] ?? bullet?.[1];
    if (item) {
      if (current?.title) tasks.push({ ...current, dependsOnTitles: [], requiresApproval: false, keywords: [] } as RawTask);
      current = { title: item.trim(), description: item.trim(), dependsOnTitles: [], requiresApproval: false, keywords: [] };
    } else if (current && line.trim()) {
      current.description = (current.description ?? "") + " " + line.trim();
    }
  }
  if (current?.title) tasks.push({ ...current, dependsOnTitles: [], requiresApproval: false, keywords: [] } as RawTask);

  return tasks.length ? tasks : [{ title: "Complete request", description: text.slice(0, 200), dependsOnTitles: [], requiresApproval: false, keywords: [] }];
}

/** Use mock decomposition when no LLM key is available. */
function mockDecompose(instruction: string, bots: Bot[]): RawTask[] {
  const hasResearcher = bots.some((b) => /research|scout|search/i.test(b.name + b.title));
  const hasWriter = bots.some((b) => /write|draft|quill|content/i.test(b.name + b.title));
  const hasAnalyst = bots.some((b) => /analy|atlas|plan/i.test(b.name + b.title));

  const tasks: RawTask[] = [];

  if (hasResearcher) {
    tasks.push({
      title: "Research & gather information",
      description: `Research relevant information for: ${instruction.slice(0, 150)}`,
      dependsOnTitles: [],
      requiresApproval: false,
      keywords: ["research", "search", "gather"],
    });
  }
  if (hasAnalyst) {
    tasks.push({
      title: "Analyse and plan",
      description: `Analyse the gathered information and create a structured plan for: ${instruction.slice(0, 150)}`,
      dependsOnTitles: hasResearcher ? ["Research & gather information"] : [],
      requiresApproval: false,
      keywords: ["analyse", "plan", "structure"],
    });
  }
  if (hasWriter) {
    tasks.push({
      title: "Draft the deliverable",
      description: `Create the final deliverable for: ${instruction.slice(0, 150)}`,
      dependsOnTitles: hasAnalyst ? ["Analyse and plan"] : hasResearcher ? ["Research & gather information"] : [],
      requiresApproval: false,
      keywords: ["write", "draft", "create"],
    });
  }

  if (!tasks.length) {
    tasks.push({
      title: "Complete the request",
      description: instruction.slice(0, 300),
      dependsOnTitles: [],
      requiresApproval: false,
      keywords: [],
    });
  }

  return tasks;
}

// ── Main orchestration ────────────────────────────────────────────────────

export interface ChiefOfStaffResult {
  plan: TaskPlan;
  summary: string;
}

export async function orchestrate(
  conversationId: ConversationId,
  instruction: string,
  availableBotIds?: string[],
): Promise<ChiefOfStaffResult> {
  const allBots = await listBots();
  const bots = availableBotIds ? allBots.filter((b) => availableBotIds.includes(b.id)) : allBots;

  if (!bots.length) throw new Error("No bots available to handle this request.");

  // Step 1: decompose the instruction into tasks
  let rawTasks: RawTask[];

  if (isMock()) {
    rawTasks = mockDecompose(instruction, bots);
  } else {
    // Ask the most capable planning bot to decompose the work
    const planner = bots.find((b) => /atlas|chief|plan|orchestrat|manag/i.test(b.name + b.title)) ?? bots[0];
    const planPrompt = [
      "You are breaking down a complex request into discrete tasks for a team of AI agents.",
      "",
      `The team has these agents: ${bots.map((b) => `${b.name} (${b.title || b.description})`).join(", ")}`,
      "",
      `Request: ${instruction}`,
      "",
      "Output a JSON array of tasks. Each task object must have:",
      "  title: string (short, unique)",
      "  description: string (what to do, with enough detail)",
      "  dependsOn: string[] (titles of tasks that must complete first, or [])",
      "  requiresApproval: boolean (true only for external actions like sending emails or pushing code)",
      "  keywords: string[] (2-4 skill keywords)",
      "",
      "Rules: tasks should be specific, assignable to one agent, and ordered by dependency. Output ONLY the JSON array in a ```json block.",
    ].join("\n");

    // Use a simple direct conversation turn for planning
    const plannerConvId = `planning:${conversationId}:${Date.now()}`;
    const reply = await runTurn({
      bot: planner,
      conversationId: plannerConvId,
      content: planPrompt,
      route: { by: "lead" },
    });

    const replyText = reply?.parts.filter((p) => p.kind === "text").map((p) => (p as { text: string }).text).join("\n") ?? "";
    rawTasks = parsePlanFromText(replyText);
  }

  // Step 2: assign bots to tasks
  const titleToId = new Map<string, string>();
  const taskDefs = rawTasks.map((rt) => {
    const bot = pickBotForTask(bots, rt.description);
    return {
      title: rt.title,
      description: rt.description,
      assignedBotId: bot?.id ?? null,
      requiresApproval: rt.requiresApproval,
      dependsOn: [] as string[], // will fill after ID mapping
    };
  });

  // Step 3: create the plan (get IDs)
  const plan = await createTaskPlan(conversationId, instruction, taskDefs);

  // Map titles to real IDs for dependency resolution
  plan.tasks.forEach((t, i) => titleToId.set(rawTasks[i]?.title ?? t.title, t.id));

  // Update dependencies with real IDs
  for (let i = 0; i < plan.tasks.length; i++) {
    const deps = rawTasks[i]?.dependsOnTitles ?? [];
    if (deps.length) {
      const resolvedDeps = deps.map((d) => titleToId.get(d)).filter(Boolean) as string[];
      if (resolvedDeps.length) {
        plan.tasks[i] = { ...plan.tasks[i], dependsOn: resolvedDeps };
        await import("./db").then((db) => db.saveTask(plan.tasks[i]));
      }
    }
  }

  // Step 4: execute the plan
  await executePlan(plan, async (task: Task, currentPlan: TaskPlan) => {
    if (!task.assignedBotId) return "No agent assigned — skipped.";
    const bot = await getBot(task.assignedBotId);
    if (!bot) return "Assigned agent not found — skipped.";

    const context = buildTaskContext(task, currentPlan);
    const reply = await runTurn({
      bot,
      conversationId,
      content: context,
      route: { by: "lead" },
    });

    return reply?.parts
      .filter((p) => p.kind === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n") ?? "Task completed.";
  });

  // Step 5: consolidate results
  const finalPlan = await getFullPlan(plan.id) ?? plan;
  const summary = consolidateResults(finalPlan);

  return { plan: finalPlan, summary };
}

// ── Context builder ───────────────────────────────────────────────────────

function buildTaskContext(task: Task, plan: TaskPlan): string {
  const doneTasks = plan.tasks.filter((t) => t.status === "done" && task.dependsOn.includes(t.id));
  const priorOutputs = doneTasks.map((t) => `### Output from: ${t.title}\n${t.output ?? "(no output)"}`).join("\n\n");

  return [
    `[Task: ${task.title}]`,
    `Overall goal: ${plan.instruction}`,
    task.description,
    priorOutputs ? `\n## Prior work from dependencies\n${priorOutputs}` : "",
    "\nComplete this task. Be specific and thorough. Output your result directly.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ── Results consolidation ─────────────────────────────────────────────────

function consolidateResults(plan: TaskPlan): string {
  const sections: string[] = [`# Results: ${plan.instruction.slice(0, 80)}`, ""];

  for (const task of plan.tasks) {
    const status = task.status === "done" ? "✅" : task.status === "error" ? "❌" : task.status === "cancelled" ? "⏭️" : "⏳";
    sections.push(`## ${status} ${task.title}`);
    if (task.output) sections.push(task.output);
    if (task.error) sections.push(`_Error: ${task.error}_`);
    sections.push("");
  }

  const doneCount = plan.tasks.filter((t) => t.status === "done").length;
  sections.push(`---\n_${doneCount}/${plan.tasks.length} tasks completed._`);

  return sections.join("\n");
}

// ── Single-task quick execution ───────────────────────────────────────────

/** For simple requests that don't need a full plan — just run one bot. */
export async function quickRun(botId: string, conversationId: ConversationId, instruction: string): Promise<string> {
  const bot = await getBot(botId);
  if (!bot) throw new Error("Bot not found.");
  const reply = await runTurn({ bot, conversationId, content: instruction, route: { by: "lead" } });
  return reply?.parts.filter((p) => p.kind === "text").map((p) => (p as { text: string }).text).join("\n") ?? "";
}
