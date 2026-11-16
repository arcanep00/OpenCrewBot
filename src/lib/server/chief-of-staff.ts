// Chief of Staff: breaks a complex instruction into tasks, assigns them to
// the right bots by capability, runs independent tasks in parallel, and
// consolidates the results into a single deliverable.
import type { Bot, Task, TaskPlan, ConversationId } from "@/lib/shared/types";
import { listBots, getBot, saveTask } from "./db";
import { createTaskPlan, executePlan, getFullPlan } from "./task-engine";
import { runTurn } from "./runtime";
import { isMock } from "./config";
import { listModels, mastraModel } from "./models";

function botScore(bot: Bot, task: string): number {
  const profile = `${bot.title} ${bot.instructions} ${bot.description}`.toLowerCase();
  const words = task.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  let score = words.filter((w) => profile.includes(w)).length;
  if (/research|search|web/i.test(task) && bot.tools.webSearch) score += 3;
  if (/code|review|build|debug/i.test(task) && bot.tools.codeMode) score += 3;
  if (/browse|click|form/i.test(task) && bot.tools.browser) score += 3;
  return score;
}

function pickBot(bots: Bot[], task: string): Bot | null {
  if (!bots.length) return null;
  return bots.sort((a, b) => botScore(b, task) - botScore(a, task))[0];
}

function isComplexTask(description: string): boolean {
  return /analy|research|compet|financ|model|review|comprehensive|detailed|multiple/i.test(description) || description.length > 200;
}

interface RawTask {
  title: string;
  description: string;
  dependsOnTitles: string[];
  requiresApproval: boolean;
}

function parseTasksFromText(text: string): RawTask[] {
  const jsonBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1]) as Array<{
        title: string;
        description: string;
        dependsOn?: string[];
        requiresApproval?: boolean;
      }>;
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((t) => ({
          title: t.title ?? "Task",
          description: t.description ?? "",
          dependsOnTitles: t.dependsOn ?? [],
          requiresApproval: t.requiresApproval ?? false,
        }));
      }
    } catch {
      // fall through
    }
  }

  const lines = text.split("\n").filter((l) => /^\s*[\d\-\*]/.test(l));
  const tasks = lines.map((l) => l.replace(/^\s*[\d\.\-\*]+\s*/, "").trim()).filter(Boolean);
  if (tasks.length) {
    return tasks.map((t) => ({ title: t, description: t, dependsOnTitles: [], requiresApproval: false }));
  }

  return [{ title: "Complete request", description: text.slice(0, 300), dependsOnTitles: [], requiresApproval: false }];
}

function mockTasks(instruction: string, bots: Bot[]): RawTask[] {
  const tasks: RawTask[] = [];
  const hasResearcher = bots.some((b) => /research|scout|search/i.test(b.name + b.title));
  const hasAnalyst = bots.some((b) => /analy|atlas|plan/i.test(b.name + b.title));
  const hasWriter = bots.some((b) => /write|draft|quill|content/i.test(b.name + b.title));

  if (hasResearcher) tasks.push({ title: "Research", description: `Research: ${instruction.slice(0, 150)}`, dependsOnTitles: [], requiresApproval: false });
  if (hasAnalyst) tasks.push({ title: "Analyse", description: `Analyse findings for: ${instruction.slice(0, 150)}`, dependsOnTitles: hasResearcher ? ["Research"] : [], requiresApproval: false });
  if (hasWriter) tasks.push({ title: "Draft deliverable", description: `Write final output for: ${instruction.slice(0, 150)}`, dependsOnTitles: hasAnalyst ? ["Analyse"] : hasResearcher ? ["Research"] : [], requiresApproval: false });

  if (!tasks.length) {
    tasks.push({ title: "Complete request", description: instruction.slice(0, 300), dependsOnTitles: [], requiresApproval: false });
  }
  return tasks;
}

function taskContext(task: Task, plan: TaskPlan): string {
  const priorOutputs = plan.tasks
    .filter((t) => t.status === "done" && task.dependsOn.includes(t.id) && t.output)
    .map((t) => `### ${t.title}\n${t.output}`)
    .join("\n\n");

  return [
    `[Task: ${task.title}]`,
    `Goal: ${plan.instruction}`,
    task.description,
    priorOutputs ? `\n## Prior work\n${priorOutputs}` : "",
    "\nComplete this task thoroughly. Output your result directly.",
  ].filter(Boolean).join("\n\n");
}

function summarise(plan: TaskPlan): string {
  const lines = [`# ${plan.instruction.slice(0, 80)}`, ""];
  for (const task of plan.tasks) {
    const icon = task.status === "done" ? "✅" : task.status === "error" ? "❌" : "⏭️";
    lines.push(`## ${icon} ${task.title}`);
    if (task.output) lines.push(task.output);
    if (task.error) lines.push(`_Error: ${task.error}_`);
    lines.push("");
  }
  const done = plan.tasks.filter((t) => t.status === "done").length;
  lines.push(`_${done}/${plan.tasks.length} tasks completed._`);
  return lines.join("\n");
}

export async function orchestrate(
  conversationId: ConversationId,
  instruction: string,
  botIds?: string[],
): Promise<{ plan: TaskPlan; summary: string }> {
  const all = await listBots();
  const bots = botIds ? all.filter((b) => botIds.includes(b.id)) : all;
  if (!bots.length) throw new Error("No bots available.");

  let rawTasks: RawTask[];

  if (isMock()) {
    rawTasks = mockTasks(instruction, bots);
  } else {
    const planner = bots.find((b) => /atlas|chief|plan|orchestrat/i.test(b.name + b.title)) ?? bots[0];
    const prompt = [
      `You are planning work for a team: ${bots.map((b) => `${b.name} (${b.title || b.description})`).join(", ")}`,
      `\nRequest: ${instruction}`,
      "\nOutput a JSON array of tasks. Each task: { title, description, dependsOn: string[], requiresApproval: boolean }",
      "Put it in a ```json block. Tasks should be specific and ordered by dependency.",
    ].join("\n");

    const reply = await runTurn({ bot: planner, conversationId: `plan:${Date.now()}`, content: prompt, route: { by: "lead" } });
    const text = reply?.parts.filter((p) => p.kind === "text").map((p) => (p as { text: string }).text).join("") ?? "";
    rawTasks = parseTasksFromText(text);
  }

  const defs = rawTasks.map((rt) => ({
    title: rt.title,
    description: rt.description,
    assignedBotId: pickBot(bots, rt.description)?.id ?? null,
    requiresApproval: rt.requiresApproval,
    dependsOn: [] as string[],
  }));

  const plan = await createTaskPlan(conversationId, instruction, defs);

  const titleToId = new Map(plan.tasks.map((t, i) => [rawTasks[i]?.title ?? t.title, t.id]));
  for (let i = 0; i < plan.tasks.length; i++) {
    const deps = (rawTasks[i]?.dependsOnTitles ?? []).map((d) => titleToId.get(d)).filter(Boolean) as string[];
    if (deps.length) {
      plan.tasks[i] = { ...plan.tasks[i], dependsOn: deps };
      await saveTask(plan.tasks[i]);
    }
  }

  await executePlan(plan, async (task, currentPlan) => {
    if (!task.assignedBotId) return "No agent assigned.";
    const bot = await getBot(task.assignedBotId);
    if (!bot) return "Agent not found.";

    const complex = isComplexTask(task.description);
    let modelOverride: string | undefined;
    if (!isMock()) {
      const models = await listModels();
      const provider = bot.model.startsWith("gpt-") || bot.model.startsWith("o") ? "openai"
        : bot.model.startsWith("claude-") ? "anthropic" : "nebius";
      const pool = models.filter((m) => m.tools && (provider === "nebius" ? !m.id.startsWith("gpt-") && !m.id.startsWith("claude-") : m.id.startsWith(provider === "openai" ? "gpt" : "claude")));
      if (complex) {
        const strong = pool.sort((a, b) => (b.inputPerM ?? 0) - (a.inputPerM ?? 0))[0];
        if (strong) modelOverride = strong.id;
      } else {
        const fast = pool.sort((a, b) => (a.inputPerM ?? 999) - (b.inputPerM ?? 999))[0];
        if (fast) modelOverride = fast.id;
      }
    }

    const taskBot = modelOverride && modelOverride !== bot.model
      ? { ...bot, model: modelOverride }
      : bot;

    try {
      const reply = await runTurn({ bot: taskBot, conversationId, content: taskContext(task, currentPlan), route: { by: "lead" } });
      return reply?.parts.filter((p) => p.kind === "text").map((p) => (p as { text: string }).text).join("\n") ?? "Done.";
    } catch {
      const reply = await runTurn({ bot, conversationId, content: taskContext(task, currentPlan), route: { by: "lead" } });
      return reply?.parts.filter((p) => p.kind === "text").map((p) => (p as { text: string }).text).join("\n") ?? "Done.";
    }
  });

  const finalPlan = (await getFullPlan(plan.id)) ?? plan;
  return { plan: finalPlan, summary: summarise(finalPlan) };
}
