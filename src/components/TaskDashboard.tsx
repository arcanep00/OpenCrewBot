"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client/api";
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

export function TaskDashboard({ onClose }: { onClose: () => void }) {
  const [plans, setPlans] = useState<TaskPlan[]>([]);
  const [selected, setSelected] = useState<TaskPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await api.tasks().catch(() => null);
    if (data) {
      setPlans(data.plans);
      if (selected) {
        const updated = data.plans.find((p) => p.id === selected.id);
        if (updated) setSelected(updated);
      }
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  async function handleApprove(planId: string, taskId: string, approve: boolean) {
    await api.approveTask(planId, taskId, approve).catch(() => null);
    await load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-app shadow-pop ring-1 ring-line overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Task Execution Dashboard</h2>
            <p className="text-[12px] text-muted mt-0.5">Track autonomous task plans and approve actions</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink">✕</button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-72 border-r border-line flex flex-col">
            <div className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line">
              Plans ({plans.length})
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && <p className="px-4 py-6 text-[13px] text-muted">Loading…</p>}
              {!loading && plans.length === 0 && (
                <p className="px-4 py-6 text-[13px] text-muted">
                  No plans yet. Use the Orchestrate button to create one.
                </p>
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
                  <p className="text-[13px] text-ink line-clamp-2">{plan.instruction.slice(0, 80)}</p>
                  <p className="text-[11px] text-muted mt-1">
                    {plan.tasks.filter((t) => t.status === "done").length}/{plan.tasks.length} done ·{" "}
                    {new Date(plan.createdAt).toLocaleTimeString()}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!selected && (
              <p className="flex h-full items-center justify-center text-muted text-[13px]">
                Select a plan to see its tasks
              </p>
            )}
            {selected && (
              <div>
                <div className="mb-4">
                  <h3 className="text-[14px] font-semibold text-ink">{selected.instruction.slice(0, 120)}</h3>
                  <p className="text-[11px] text-muted mt-1">
                    {selected.id.slice(0, 16)} · started {new Date(selected.createdAt).toLocaleString()}
                    {selected.completedAt && ` · done ${new Date(selected.completedAt).toLocaleString()}`}
                  </p>
                </div>
                <div className="space-y-3">
                  {selected.tasks.map((task, i) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      index={i + 1}
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

function TaskCard({ task, index, onApprove }: { task: Task; index: number; onApprove: (approve: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border border-line bg-raised p-4 ${task.status === "running" ? "ring-1 ring-blue-500/30" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-app text-[11px] font-bold text-muted ring-1 ring-line mt-0.5">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">{STATUS_ICON[task.status] ?? "⏳"}</span>
            <span className="text-[13px] font-medium text-ink truncate">{task.title}</span>
            <span className={`ml-auto text-[11px] font-medium shrink-0 ${STATUS_COLOR[task.status] ?? ""}`}>
              {task.status}
            </span>
          </div>
          <p className="text-[12px] text-muted mt-1 line-clamp-2">{task.description}</p>
          {task.startedAt && (
            <p className="text-[11px] text-muted mt-1">
              {new Date(task.startedAt).toLocaleTimeString()}
              {task.completedAt && ` → ${new Date(task.completedAt).toLocaleTimeString()}`}
              {task.retryCount > 0 && ` · retry #${task.retryCount}`}
            </p>
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
            <button onClick={() => setExpanded(!expanded)} className="mt-2 text-[11px] text-blue-500 hover:underline">
              {expanded ? "Hide ▲" : "Show output ▼"}
            </button>
          )}
          {expanded && task.output && (
            <pre className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-app p-3 text-[11px] text-ink whitespace-pre-wrap">
              {task.output}
            </pre>
          )}
          {expanded && task.error && (
            <p className="mt-2 rounded-lg bg-red-500/10 p-3 text-[11px] text-red-500">{task.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
