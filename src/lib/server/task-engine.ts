// Task Execution Engine — Module D
// Every complex request generates a visible task plan. Tracks each task's
// status, retries on failure, enforces timeouts, and fires tasks in parallel
// when their dependencies are satisfied.

import type { Task, TaskPlan, TaskStatus } from "@/lib/shared/types";
import { saveTask, saveTaskPlan, getTaskPlan, listTasksForPlan } from "./db";
import { publish } from "./bus";

const TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per task
const MAX_RETRIES = 2;

// ── ID helpers ───────────────────────────────────────────────────────────

function planId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function taskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Plan creation ────────────────────────────────────────────────────────

export async function createTaskPlan(
  conversationId: string,
  instruction: string,
  taskDefs: Array<{
    title: string;
    description: string;
    assignedBotId: string | null;
    dependsOn?: string[];
    requiresApproval?: boolean;
  }>,
): Promise<TaskPlan> {
  const now = new Date().toISOString();
  const pid = planId();

  const tasks: Task[] = taskDefs.map((def, i) => ({
    id: taskId(),
    planId: pid,
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
    createdAt: new Date(Date.now() + i).toISOString(), // slight offset to maintain order
  }));

  const plan: TaskPlan = {
    id: pid,
    conversationId,
    instruction,
    status: "running",
    tasks,
    createdAt: now,
    completedAt: null,
  };

  await saveTaskPlan(plan);
  for (const task of tasks) await saveTask(task);

  publish({ type: "task-plan-created", plan });
  return plan;
}

// ── Task state transitions ───────────────────────────────────────────────

export async function updateTaskStatus(
  planId: string,
  taskId: string,
  status: TaskStatus,
  extras: { output?: string; error?: string } = {},
): Promise<void> {
  const plan = await getTaskPlan(planId);
  if (!plan) return;

  const taskIndex = plan.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) return;

  const now = new Date().toISOString();
  const updated: Task = {
    ...plan.tasks[taskIndex],
    status,
    output: extras.output ?? plan.tasks[taskIndex].output,
    error: extras.error ?? plan.tasks[taskIndex].error,
    startedAt: status === "running" ? now : plan.tasks[taskIndex].startedAt,
    completedAt: status === "done" || status === "error" || status === "cancelled" ? now : plan.tasks[taskIndex].completedAt,
  };

  plan.tasks[taskIndex] = updated;
  await saveTask(updated);

  // Check if entire plan is done
  const allDone = plan.tasks.every((t) => t.status === "done");
  const anyError = plan.tasks.some((t) => t.status === "error");
  const anyCancelled = plan.tasks.some((t) => t.status === "cancelled");

  if (allDone) plan.status = "done";
  else if (anyError && plan.tasks.filter((t) => t.status === "pending" || t.status === "running").length === 0) plan.status = "error";
  else if (anyCancelled && plan.tasks.every((t) => t.status === "done" || t.status === "cancelled" || t.status === "error"))
    plan.status = "cancelled";

  if (allDone || anyError) plan.completedAt = now;
  await saveTaskPlan(plan);

  publish({ type: "task-updated", planId, task: updated, planStatus: plan.status });
}

// ── Dependency resolution ─────────────────────────────────────────────────

/** Returns the tasks that are ready to run: all their dependencies are done. */
export function readyTasks(plan: TaskPlan): Task[] {
  const doneIds = new Set(plan.tasks.filter((t) => t.status === "done").map((t) => t.id));
  return plan.tasks.filter(
    (t) =>
      t.status === "pending" &&
      !t.requiresApproval &&
      t.dependsOn.every((dep) => doneIds.has(dep)),
  );
}

/** Returns tasks waiting for human approval. */
export function pendingApprovalTasks(plan: TaskPlan): Task[] {
  return plan.tasks.filter((t) => t.status === "awaiting-approval");
}

// ── Approval flow ─────────────────────────────────────────────────────────

export async function approveTask(planId: string, taskId: string): Promise<void> {
  await updateTaskStatus(planId, taskId, "pending");
}

export async function rejectTask(planId: string, taskId: string): Promise<void> {
  await updateTaskStatus(planId, taskId, "cancelled", { error: "Rejected by user." });
}

// ── Retry logic ───────────────────────────────────────────────────────────

export async function retryTask(planId: string, taskId: string): Promise<boolean> {
  const plan = await getTaskPlan(planId);
  if (!plan) return false;
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== "error") return false;
  if (task.retryCount >= MAX_RETRIES) return false;

  const updated: Task = { ...task, status: "pending", retryCount: task.retryCount + 1, error: null };
  const taskIndex = plan.tasks.findIndex((t) => t.id === taskId);
  plan.tasks[taskIndex] = updated;
  await saveTask(updated);
  await saveTaskPlan(plan);
  publish({ type: "task-updated", planId, task: updated, planStatus: plan.status });
  return true;
}

// ── Task execution runner ─────────────────────────────────────────────────

type TaskExecutor = (task: Task, plan: TaskPlan) => Promise<string>;

/** Run a plan: fires ready tasks in parallel, respects dependencies. */
export async function executePlan(plan: TaskPlan, executor: TaskExecutor): Promise<void> {
  const freshPlan = await getTaskPlan(plan.id);
  if (!freshPlan) return;

  const running = new Map<string, Promise<void>>();

  async function runTask(task: Task): Promise<void> {
    await updateTaskStatus(plan.id, task.id, "running");

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Task timed out after 5 minutes.")), TASK_TIMEOUT_MS),
    );

    try {
      const output = await Promise.race([executor(task, freshPlan!), timeout]);
      await updateTaskStatus(plan.id, task.id, "done", { output });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const currentPlan = await getTaskPlan(plan.id);
      const currentTask = currentPlan?.tasks.find((t) => t.id === task.id);

      if (currentTask && currentTask.retryCount < MAX_RETRIES) {
        // Auto-retry
        const retried: Task = { ...currentTask, status: "pending", retryCount: currentTask.retryCount + 1, error: errMsg };
        if (currentPlan) {
          const idx = currentPlan.tasks.findIndex((t) => t.id === task.id);
          currentPlan.tasks[idx] = retried;
          await saveTask(retried);
          await saveTaskPlan(currentPlan);
        }
      } else {
        await updateTaskStatus(plan.id, task.id, "error", { error: errMsg });
      }
    }
  }

  // Keep firing tasks as dependencies resolve
  while (true) {
    const latestPlan = await getTaskPlan(plan.id);
    if (!latestPlan || latestPlan.status === "done" || latestPlan.status === "error" || latestPlan.status === "cancelled") break;

    const ready = readyTasks(latestPlan).filter((t) => !running.has(t.id));
    if (ready.length === 0) {
      // Nothing ready: either all done or all blocked
      const stillPending = latestPlan.tasks.filter((t) => t.status === "pending" || t.status === "running");
      if (stillPending.length === 0) break;
      // Wait for a running task to finish
      if (running.size > 0) {
        await Promise.race(running.values());
        for (const [id, p] of running) {
          p.then(() => running.delete(id)).catch(() => running.delete(id));
        }
      } else {
        // Deadlock or waiting on approval
        break;
      }
      continue;
    }

    for (const task of ready) {
      const p = runTask(task).then(() => { running.delete(task.id); }).catch(() => { running.delete(task.id); });
      running.set(task.id, p);
    }

    // Small yield so the event loop can process things
    await new Promise((r) => setTimeout(r, 100));
  }

  // Wait for all in-flight tasks
  await Promise.allSettled(running.values());
}

// ── Cancellation ──────────────────────────────────────────────────────────

export async function cancelPlan(planId: string): Promise<void> {
  const plan = await getTaskPlan(planId);
  if (!plan) return;
  for (const task of plan.tasks) {
    if (task.status === "pending" || task.status === "running") {
      await updateTaskStatus(planId, task.id, "cancelled");
    }
  }
}

// ── History helpers ───────────────────────────────────────────────────────

export async function getFullPlan(planId: string): Promise<TaskPlan | null> {
  const plan = await getTaskPlan(planId);
  if (!plan) return null;
  // Tasks are embedded in the plan JSON, but also stored separately for fast queries
  const tasks = await listTasksForPlan(planId);
  if (tasks.length) plan.tasks = tasks;
  return plan;
}
