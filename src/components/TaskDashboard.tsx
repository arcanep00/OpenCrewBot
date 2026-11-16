"use client";

// Task Execution Dashboard — Module D UI
// Shows all task plans, their tasks, status, timings and approval actions.

import { useEffect, useState, useCallback } from "react";
import type { TaskPlan, Task } from "@/lib/shared/types";

const STATUS_ICON: Record<string, string> = {
  pending: "⏳",
  running: "🔄",
  done: "✅",
  error: "❌",
  cancelled: "⏭️",
  "awaiting-approval": "🔐",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-muted",
  running: "text-blue-500",
  done: "text-green-500",
  error: "text-red-500",
  cancelled: "text-muted",
  "awaiting-approval": "text-amber-500",
};

interface Props {
  onClose: () => void;
}

export function TaskDashboard({ onClose }: Props) {
  const [plans, setPlans] = useState<TaskPlan[]>([]);
  const [selected, setSelected] = useState<TaskPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = (await res.json()) as { plans: TaskPlan[] };
        setPlans(data.plans);
        if (selected) {
          const updated = data.plans.find((p) => p.id === selected.id);
          if (updated) setSelected(updated);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  async function handleApprove(planId: string, taskId: string, approve: boolean) {
    await fetch(`/api/tasks/${planId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, approve }),
    });
    await load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-app shadow-pop ring-1 ring-line overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Task Execution Dashboard</h2>
            <p className="text-[12px] text-muted mt-0.5">Module D — Autonomous task execution & tracking</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink">✕</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Plan list */}
          <div className="w-72 border-r border-line flex flex-col">
            <div className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line">
              Task Plans ({plans.length})
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && <div className="px-4 py-6 text-[13px] text-muted">Loading...</div>}
              {!loading && plans.length === 0 && (
                <div className="px-4 py-6 text-[13px] text-muted">
                  No task plans yet. Use the Orchestrate button in a room to create one.
                </div>
              )}
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelected(plan)}
                  className={`w-full text-left px-4 py-3 border-b border-line hover:bg-raised transition-colors ${selected?.id === plan.id ? "bg-raised" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{STATUS_ICON[plan.status] ?? "⏳"}</span>
                    <span className={`text-[11px] font-medium ${STATUS_COLOR[plan.status] ?? ""}`}>
                      {plan.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[13px] text-ink line-clamp-2">{plan.instruction.slice(0, 80)}</div>
                  <div className="text-[11px] text-muted mt-1">
                    {plan.tasks.filter((t) => t.status === "done").length}/{plan.tasks.length} tasks ·{" "}
                    {new Date(plan.createdAt).toLocaleTimeString()}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Plan detail */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!selected && (
              <div className="flex h-full items-center justify-center text-muted text-[13px]">
                Select a plan to see its tasks
              </div>
            )}
            {selected && (
              <div>
                <div className="mb-4">
                  <h3 className="text-[14px] font-semibold text-ink">{selected.instruction.slice(0, 120)}</h3>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted">
                    <span>Plan: {selected.id.slice(0, 12)}…</span>
                    <span>Started: {new Date(selected.createdAt).toLocaleString()}</span>
                    {selected.completedAt && <span>Done: {new Date(selected.completedAt).toLocaleString()}</span>}
                  </div>
                </div>

                <div className="space-y-3">
                  {selected.tasks.map((task, i) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      index={i + 1}
                      planId={selected.id}
                      onApprove={(approve) => handleApprove(selected.id, task.id, approve)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  index,
  planId,
  onApprove,
}: {
  task: Task;
  index: number;
  planId: string;
  onApprove: (approve: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border border-line bg-raised p-4 ${task.status === "running" ? "ring-1 ring-blue-500/30" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-app text-[11px] font-bold text-muted ring-1 ring-line shrink-0 mt-0.5">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">{STATUS_ICON[task.status] ?? "⏳"}</span>
            <span className="text-[13px] font-medium text-ink truncate">{task.title}</span>
            <span className={`ml-auto text-[11px] font-medium ${STATUS_COLOR[task.status] ?? ""}`}>
              {task.status}
            </span>
          </div>

          <p className="text-[12px] text-muted mt-1 line-clamp-2">{task.description}</p>

          {task.startedAt && (
            <div className="text-[11px] text-muted mt-1">
              Started {new Date(task.startedAt).toLocaleTimeString()}
              {task.completedAt && ` · Done ${new Date(task.completedAt).toLocaleTimeString()}`}
              {task.retryCount > 0 && ` · Retry #${task.retryCount}`}
            </div>
          )}

          {task.status === "awaiting-approval" && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onApprove(true)}
                className="rounded-lg bg-green-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-green-600"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => onApprove(false)}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-600"
              >
                ✗ Reject
              </button>
            </div>
          )}

          {(task.output || task.error) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-[11px] text-blue-500 hover:underline"
            >
              {expanded ? "Hide output ▲" : "Show output ▼"}
            </button>
          )}

          {expanded && task.output && (
            <pre className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-app p-3 text-[11px] text-ink whitespace-pre-wrap">
              {task.output}
            </pre>
          )}
          {expanded && task.error && (
            <div className="mt-2 rounded-lg bg-red-500/10 p-3 text-[11px] text-red-500">
              {task.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
