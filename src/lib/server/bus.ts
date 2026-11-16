// In-process fan-out of server events to every open SSE connection.
import type { ServerEvent, TaskPlan, Task, WorkflowRun } from "@/lib/shared/types";

// Extended internal events (not all sent over SSE, some are internal signals)
export type InternalEvent =
  | ServerEvent
  | { type: "task-plan-created"; plan: TaskPlan }
  | { type: "task-updated"; planId: string; task: Task; planStatus: string }
  | { type: "workflow-run-started"; run: WorkflowRun }
  | { type: "workflow-run-completed"; run: WorkflowRun };

type Listener = (event: InternalEvent) => void;

const g = globalThis as unknown as { __opencrewbotBus?: Set<Listener> };
const listeners = (g.__opencrewbotBus ??= new Set());

export function publish(event: InternalEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A broken connection must not stop delivery to the others.
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
