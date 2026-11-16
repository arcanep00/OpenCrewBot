// Runs workflows on a timer or on demand. Timers survive Next.js hot reloads
// by keeping state in a global map, same pattern as runtime.ts.
import type { ScheduledWorkflow, WorkflowRun, ScheduleFrequency } from "@/lib/shared/types";
import { saveWorkflow, listWorkflows, getWorkflow, deleteWorkflowRow, saveWorkflowRun, listWorkflowRuns } from "./db";
import { publish } from "./bus";
import { orchestrate } from "./chief-of-staff";

const FREQ_MS: Record<ScheduleFrequency, number> = {
  manual: 0,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

const g = globalThis as unknown as { __ocb_scheduler?: Map<string, NodeJS.Timeout> };
const timers = (g.__ocb_scheduler ??= new Map());

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nextRunAt(frequency: ScheduleFrequency): string | null {
  const ms = FREQ_MS[frequency];
  return ms ? new Date(Date.now() + ms).toISOString() : null;
}

export async function createWorkflow(input: {
  name: string;
  description: string;
  roomId?: string | null;
  botId?: string | null;
  instruction: string;
  frequency: ScheduleFrequency;
}): Promise<ScheduledWorkflow> {
  const wf: ScheduledWorkflow = {
    id: newId("wf"),
    name: input.name,
    description: input.description,
    roomId: input.roomId ?? null,
    botId: input.botId ?? null,
    instruction: input.instruction,
    frequency: input.frequency,
    enabled: true,
    lastRunAt: null,
    nextRunAt: nextRunAt(input.frequency),
    createdAt: new Date().toISOString(),
  };
  await saveWorkflow(wf);
  if (wf.frequency !== "manual") scheduleTimer(wf);
  return wf;
}

export async function updateWorkflow(
  id: string,
  patch: Partial<Pick<ScheduledWorkflow, "name" | "description" | "instruction" | "frequency" | "enabled" | "roomId" | "botId">>,
): Promise<ScheduledWorkflow | null> {
  const wf = await getWorkflow(id);
  if (!wf) return null;
  const updated: ScheduledWorkflow = {
    ...wf,
    ...patch,
    nextRunAt: patch.frequency ? nextRunAt(patch.frequency) : wf.nextRunAt,
  };
  await saveWorkflow(updated);
  clearTimer(id);
  if (updated.enabled && updated.frequency !== "manual") scheduleTimer(updated);
  return updated;
}

export async function deleteWorkflow(id: string): Promise<void> {
  clearTimer(id);
  await deleteWorkflowRow(id);
}

export async function triggerWorkflow(id: string): Promise<WorkflowRun> {
  const wf = await getWorkflow(id);
  if (!wf) throw new Error("Workflow not found.");
  return kick(wf);
}

export async function getWorkflowHistory(workflowId: string, limit = 20): Promise<WorkflowRun[]> {
  return listWorkflowRuns(workflowId, limit);
}

export async function bootstrapScheduler(): Promise<void> {
  const workflows = await listWorkflows();
  for (const wf of workflows) {
    if (wf.enabled && wf.frequency !== "manual") scheduleTimer(wf);
  }
}

async function kick(wf: ScheduledWorkflow): Promise<WorkflowRun> {
  const run: WorkflowRun = {
    id: newId("run"),
    workflowId: wf.id,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    output: null,
    error: null,
  };
  await saveWorkflowRun(run);
  publish({ type: "workflow-run-started", run });
  await saveWorkflow({ ...wf, lastRunAt: run.startedAt, nextRunAt: wf.frequency !== "manual" ? nextRunAt(wf.frequency) : null });
  runAsync(wf, run).catch(() => {});
  return run;
}

async function runAsync(wf: ScheduledWorkflow, run: WorkflowRun): Promise<void> {
  const convId = wf.roomId ? `room:${wf.roomId}` : `workflow:${wf.id}`;
  try {
    const { summary } = await orchestrate(convId, wf.instruction, wf.botId ? [wf.botId] : undefined);
    const done: WorkflowRun = { ...run, status: "done", output: summary, completedAt: new Date().toISOString() };
    await saveWorkflowRun(done);
    publish({ type: "workflow-run-completed", run: done });
  } catch (err) {
    const failed: WorkflowRun = {
      ...run,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    };
    await saveWorkflowRun(failed);
    publish({ type: "workflow-run-completed", run: failed });
  }
}

function scheduleTimer(wf: ScheduledWorkflow): void {
  clearTimer(wf.id);
  const ms = FREQ_MS[wf.frequency];
  if (!ms) return;
  const delay = wf.nextRunAt ? Math.max(0, new Date(wf.nextRunAt).getTime() - Date.now()) : ms;
  const timer = setTimeout(async () => {
    timers.delete(wf.id);
    const fresh = await getWorkflow(wf.id);
    if (!fresh?.enabled) return;
    await kick(fresh);
    const next = await getWorkflow(wf.id);
    if (next) scheduleTimer(next);
  }, delay);
  timers.set(wf.id, timer);
}

function clearTimer(id: string): void {
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
}
