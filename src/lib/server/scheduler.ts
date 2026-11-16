// Scheduler — Module I
// Automation engine: schedule workflows, run them manually or on a timer,
// track execution history, support pause/resume, and report failures.

import type { ScheduledWorkflow, WorkflowRun, ScheduleFrequency } from "@/lib/shared/types";
import {
  saveWorkflow,
  listWorkflows,
  getWorkflow,
  deleteWorkflowRow,
  saveWorkflowRun,
  listWorkflowRuns,
} from "./db";
import { publish } from "./bus";
import { orchestrate } from "./chief-of-staff";

// ── ID helpers ────────────────────────────────────────────────────────────

function wfId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function runId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Interval map ──────────────────────────────────────────────────────────

const FREQUENCY_MS: Record<ScheduleFrequency, number> = {
  manual: 0,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

// In-process timers for scheduled workflows (survive hot reloads via global)
const g = globalThis as unknown as { __ocb_scheduler?: Map<string, NodeJS.Timeout> };
const timers = (g.__ocb_scheduler ??= new Map());

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function createWorkflow(input: {
  name: string;
  description: string;
  roomId?: string | null;
  botId?: string | null;
  instruction: string;
  frequency: ScheduleFrequency;
}): Promise<ScheduledWorkflow> {
  const now = new Date().toISOString();
  const wf: ScheduledWorkflow = {
    id: wfId(),
    name: input.name,
    description: input.description,
    roomId: input.roomId ?? null,
    botId: input.botId ?? null,
    instruction: input.instruction,
    frequency: input.frequency,
    cronExpression: null,
    enabled: true,
    lastRunAt: null,
    nextRunAt: computeNextRun(input.frequency),
    createdAt: now,
  };
  await saveWorkflow(wf);
  if (wf.frequency !== "manual" && wf.enabled) scheduleTimer(wf);
  return wf;
}

export async function updateWorkflow(id: string, patch: Partial<Pick<ScheduledWorkflow, "name" | "description" | "instruction" | "frequency" | "enabled" | "roomId" | "botId">>): Promise<ScheduledWorkflow | null> {
  const wf = await getWorkflow(id);
  if (!wf) return null;
  const updated: ScheduledWorkflow = {
    ...wf,
    ...patch,
    nextRunAt: patch.frequency ? computeNextRun(patch.frequency) : wf.nextRunAt,
  };
  await saveWorkflow(updated);
  reschedule(updated);
  return updated;
}

export async function deleteWorkflow(id: string): Promise<void> {
  clearTimer(id);
  await deleteWorkflowRow(id);
}

// ── Manual trigger ────────────────────────────────────────────────────────

export async function triggerWorkflow(id: string): Promise<WorkflowRun> {
  const wf = await getWorkflow(id);
  if (!wf) throw new Error("Workflow not found.");
  return runWorkflow(wf);
}

// ── Execution ─────────────────────────────────────────────────────────────

async function runWorkflow(wf: ScheduledWorkflow): Promise<WorkflowRun> {
  const run: WorkflowRun = {
    id: runId(),
    workflowId: wf.id,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    output: null,
    error: null,
  };

  await saveWorkflowRun(run);
  publish({ type: "workflow-run-started", run });

  // Update workflow last/next run times
  const updatedWf: ScheduledWorkflow = {
    ...wf,
    lastRunAt: run.startedAt,
    nextRunAt: wf.frequency !== "manual" ? computeNextRun(wf.frequency) : null,
  };
  await saveWorkflow(updatedWf);

  // Execute asynchronously
  executeWorkflowAsync(wf, run).catch(() => {});
  return run;
}

async function executeWorkflowAsync(wf: ScheduledWorkflow, run: WorkflowRun): Promise<void> {
  try {
    const conversationId = wf.roomId ? `room:${wf.roomId}` : `workflow:${wf.id}`;
    const { summary } = await orchestrate(conversationId, wf.instruction, wf.botId ? [wf.botId] : undefined);

    const completed: WorkflowRun = {
      ...run,
      status: "done",
      output: summary,
      completedAt: new Date().toISOString(),
    };
    await saveWorkflowRun(completed);
    publish({ type: "workflow-run-completed", run: completed });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const failed: WorkflowRun = {
      ...run,
      status: "error",
      error: errMsg,
      completedAt: new Date().toISOString(),
    };
    await saveWorkflowRun(failed);
    publish({ type: "workflow-run-completed", run: failed });
  }
}

// ── Timer management ──────────────────────────────────────────────────────

function computeNextRun(frequency: ScheduleFrequency): string | null {
  const ms = FREQUENCY_MS[frequency];
  if (!ms) return null;
  return new Date(Date.now() + ms).toISOString();
}

function scheduleTimer(wf: ScheduledWorkflow): void {
  clearTimer(wf.id);
  const ms = FREQUENCY_MS[wf.frequency];
  if (!ms || !wf.enabled) return;

  const delay = wf.nextRunAt ? Math.max(0, new Date(wf.nextRunAt).getTime() - Date.now()) : ms;
  const timer = setTimeout(async () => {
    timers.delete(wf.id);
    const fresh = await getWorkflow(wf.id);
    if (!fresh || !fresh.enabled) return;
    await runWorkflow(fresh);
    // Reschedule for next run
    const rescheduled = await getWorkflow(wf.id);
    if (rescheduled) scheduleTimer(rescheduled);
  }, delay);

  timers.set(wf.id, timer);
}

function clearTimer(id: string): void {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

function reschedule(wf: ScheduledWorkflow): void {
  clearTimer(wf.id);
  if (wf.enabled && wf.frequency !== "manual") scheduleTimer(wf);
}

// ── Bootstrap: restore timers on server start ─────────────────────────────

export async function bootstrapScheduler(): Promise<void> {
  const workflows = await listWorkflows();
  for (const wf of workflows) {
    if (wf.enabled && wf.frequency !== "manual") {
      scheduleTimer(wf);
    }
  }
}

// ── History ───────────────────────────────────────────────────────────────

export async function getWorkflowHistory(workflowId: string, limit = 20): Promise<WorkflowRun[]> {
  return listWorkflowRuns(workflowId, limit);
}
