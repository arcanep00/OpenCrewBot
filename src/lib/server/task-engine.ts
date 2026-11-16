// Task execution: create plans, track status, run tasks in parallel,
// retry on failure, and handle approval gates.
import type { Task, TaskPlan, TaskStatus } from "@/lib/shared/types";
import { saveTask, saveTaskPlan, getTaskPlan, listTasksForPlan } from "./db";
import { publish } from "./bus";

const TIMEOUT_MS = 5 * 60 * 1000;
const MAX_RETRIES = 2;

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createTaskPlan(
  conversationId: string,
  instruction: string,
  defs: Array<{
    title: string;
    description: string;
    assignedBotId: string | null;
    dependsOn?: string[];
    requiresApproval?: boolean;
  }>,
): Promise<TaskPlan> {
  const now = new Date().toISOString();
  const planId = newId("plan");

  const tasks: Task[] = defs.map((def, i) => ({
    id: newId("task"),
    planId,
    title: def.title,
    description: def.description,
    assignedBotId: def.assignedBotId,
    dependsOn: def.dependsOn ?? [],
    status: "pending" as TaskStatus,
    startedAt: null,
    completedAt: null,
    output: null,
    error: null,
    requiresApproval: def.requiresApproval ?? false,
    retryCount: 0,
    createdAt: new Date(Date.now() + i).toISOString(),
  }));

  const plan: TaskPlan = { id: planId, conversationId, instruction, status: "running", tasks, createdAt: now, completedAt: null };

  await saveTaskPlan(plan);
  for (const task of tasks) await saveTask(task);
  publish({ type: "task-plan-created", plan });
  return plan;
}

export async function updateTaskStatus(
  planId: string,
  taskId: string,
  status: TaskStatus,
  extras: { output?: string; error?: string } = {},
): Promise<void> {
  const plan = await getTaskPlan(planId);
  if (!plan) return;

  const i = plan.tasks.findIndex((t) => t.id === taskId);
  if (i === -1) return;

  const now = new Date().toISOString();
  const prev = plan.tasks[i];
  const updated: Task = {
    ...prev,
    status,
    output: extras.output ?? prev.output,
    error: extras.error ?? prev.error,
    startedAt: status === "running" ? now : prev.startedAt,
    completedAt: ["done", "error", "cancelled"].includes(status) ? now : prev.completedAt,
  };

  plan.tasks[i] = updated;
  await saveTask(updated);

  const allDone = plan.tasks.every((t) => t.status === "done");
  const noMore = plan.tasks.every((t) => !["pending", "running"].includes(t.status));

  if (allDone) {
    plan.status = "done";
    plan.completedAt = now;
  } else if (noMore) {
    plan.status = plan.tasks.some((t) => t.status === "error") ? "error" : "cancelled";
    plan.completedAt = now;
  }

  await saveTaskPlan(plan);
  publish({ type: "task-updated", planId, task: updated, planStatus: plan.status });
}

export function readyTasks(plan: TaskPlan): Task[] {
  const done = new Set(plan.tasks.filter((t) => t.status === "done").map((t) => t.id));
  return plan.tasks.filter(
    (t) => t.status === "pending" && !t.requiresApproval && t.dependsOn.every((d) => done.has(d)),
  );
}

export async function approveTask(planId: string, taskId: string): Promise<void> {
  await updateTaskStatus(planId, taskId, "pending");
}

export async function rejectTask(planId: string, taskId: string): Promise<void> {
  await updateTaskStatus(planId, taskId, "cancelled", { error: "Rejected by user." });
}

export async function getFullPlan(planId: string): Promise<TaskPlan | null> {
  const plan = await getTaskPlan(planId);
  if (!plan) return null;
  const tasks = await listTasksForPlan(planId);
  if (tasks.length) plan.tasks = tasks;
  return plan;
}

export async function cancelPlan(planId: string): Promise<void> {
  const plan = await getTaskPlan(planId);
  if (!plan) return;
  for (const task of plan.tasks) {
    if (task.status === "pending" || task.status === "running") {
      await updateTaskStatus(planId, task.id, "cancelled");
    }
  }
}

type Executor = (task: Task, plan: TaskPlan) => Promise<string>;

export async function executePlan(plan: TaskPlan, executor: Executor): Promise<void> {
  const running = new Map<string, Promise<void>>();

  async function run(task: Task): Promise<void> {
    await updateTaskStatus(plan.id, task.id, "running");

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Task timed out.")), TIMEOUT_MS),
    );

    try {
      const latestPlan = await getTaskPlan(plan.id);
      const output = await Promise.race([executor(task, latestPlan ?? plan), timeout]);
      await updateTaskStatus(plan.id, task.id, "done", { output });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const current = await getTaskPlan(plan.id);
      const currentTask = current?.tasks.find((t) => t.id === task.id);
      if (currentTask && currentTask.retryCount < MAX_RETRIES) {
        const retried: Task = { ...currentTask, status: "pending", retryCount: currentTask.retryCount + 1, error: msg };
        if (current) {
          current.tasks[current.tasks.findIndex((t) => t.id === task.id)] = retried;
          await saveTask(retried);
          await saveTaskPlan(current);
        }
      } else {
        await updateTaskStatus(plan.id, task.id, "error", { error: msg });
      }
    }
  }

  while (true) {
    const latest = await getTaskPlan(plan.id);
    if (!latest || ["done", "error", "cancelled"].includes(latest.status)) break;

    const ready = readyTasks(latest).filter((t) => !running.has(t.id));

    if (ready.length === 0) {
      const stillActive = latest.tasks.filter((t) => ["pending", "running"].includes(t.status));
      if (stillActive.length === 0 || running.size === 0) break;
      await Promise.race(running.values());
      for (const [id, p] of running) p.then(() => running.delete(id)).catch(() => running.delete(id));
      continue;
    }

    for (const task of ready) {
      const p = run(task).finally(() => running.delete(task.id));
      running.set(task.id, p);
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  await Promise.allSettled(running.values());
}
