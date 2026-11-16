"use client";

// Scheduled Workflows Panel — Module I UI
import { useEffect, useState, useCallback } from "react";
import type { ScheduledWorkflow, WorkflowRun, ScheduleFrequency } from "@/lib/shared/types";

const FREQ_LABELS: Record<ScheduleFrequency, string> = {
  manual: "Manual only",
  hourly: "Every hour",
  daily: "Daily",
  weekly: "Weekly",
};

interface Props {
  onClose: () => void;
}

export function WorkflowsPanel({ onClose }: Props) {
  const [workflows, setWorkflows] = useState<ScheduledWorkflow[]>([]);
  const [selected, setSelected] = useState<ScheduledWorkflow | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows");
      if (res.ok) {
        const data = (await res.json()) as { workflows: ScheduledWorkflow[] };
        setWorkflows(data.workflows);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRuns = useCallback(async (wfId: string) => {
    const res = await fetch(`/api/workflows/${wfId}/runs`);
    if (res.ok) {
      const data = (await res.json()) as { runs: WorkflowRun[] };
      setRuns(data.runs);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (selected) void loadRuns(selected.id);
  }, [selected, loadRuns]);

  async function triggerWorkflow(id: string) {
    await fetch(`/api/workflows/${id}/trigger`, { method: "POST" });
    await load();
    if (selected?.id === id) await loadRuns(id);
  }

  async function toggleEnabled(wf: ScheduledWorkflow) {
    await fetch(`/api/workflows/${wf.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !wf.enabled }),
    });
    await load();
  }

  async function deleteWorkflow(id: string) {
    if (!confirm("Delete this workflow?")) return;
    await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    if (selected?.id === id) setSelected(null);
    await load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-app shadow-pop ring-1 ring-line overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Scheduled Workflows</h2>
            <p className="text-[12px] text-muted mt-0.5">Module I — Automation engine</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-app hover:opacity-80"
            >
              + New Workflow
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink">✕</button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Workflow list */}
          <div className="w-72 border-r border-line flex flex-col">
            <div className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line">
              Workflows ({workflows.length})
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && <div className="px-4 py-6 text-[13px] text-muted">Loading...</div>}
              {!loading && workflows.length === 0 && (
                <div className="px-4 py-6 text-[13px] text-muted">No workflows yet. Create one to automate recurring tasks.</div>
              )}
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => setSelected(wf)}
                  className={`w-full text-left px-4 py-3 border-b border-line hover:bg-raised transition-colors ${selected?.id === wf.id ? "bg-raised" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${wf.enabled ? "bg-green-500" : "bg-muted"}`} />
                    <span className="text-[13px] font-medium text-ink truncate">{wf.name}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    {FREQ_LABELS[wf.frequency]} · {wf.lastRunAt ? `Last: ${new Date(wf.lastRunAt).toLocaleDateString()}` : "Never run"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Workflow detail */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {creating && (
              <NewWorkflowForm
                onSaved={async () => { setCreating(false); await load(); }}
                onCancel={() => setCreating(false)}
              />
            )}

            {!creating && !selected && (
              <div className="flex h-full items-center justify-center text-muted text-[13px]">
                Select a workflow to see its details and run history
              </div>
            )}

            {!creating && selected && (
              <div>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-[14px] font-semibold text-ink">{selected.name}</h3>
                    <p className="text-[12px] text-muted mt-0.5">{selected.description}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => triggerWorkflow(selected.id)}
                      className="rounded-lg bg-blue-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-600"
                    >
                      ▶ Run now
                    </button>
                    <button
                      onClick={() => toggleEnabled(selected)}
                      className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${selected.enabled ? "bg-raised text-muted hover:text-ink" : "bg-green-500/20 text-green-600 hover:bg-green-500/30"}`}
                    >
                      {selected.enabled ? "⏸ Pause" : "▶ Resume"}
                    </button>
                    <button
                      onClick={() => deleteWorkflow(selected.id)}
                      className="rounded-lg bg-red-500/10 px-3 py-1.5 text-[12px] font-medium text-red-500 hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-raised p-4 mb-4 text-[12px] space-y-2">
                  <div className="flex gap-4">
                    <div><span className="text-muted">Frequency:</span> <span className="text-ink">{FREQ_LABELS[selected.frequency]}</span></div>
                    <div><span className="text-muted">Status:</span> <span className={selected.enabled ? "text-green-500" : "text-muted"}>{selected.enabled ? "Active" : "Paused"}</span></div>
                  </div>
                  {selected.nextRunAt && (
                    <div><span className="text-muted">Next run:</span> <span className="text-ink">{new Date(selected.nextRunAt).toLocaleString()}</span></div>
                  )}
                  <div className="mt-2">
                    <div className="text-muted mb-1">Instruction:</div>
                    <div className="text-ink bg-app rounded-lg p-2">{selected.instruction}</div>
                  </div>
                </div>

                {/* Run history */}
                <h4 className="text-[12px] font-medium text-muted uppercase tracking-wide mb-2">Run History</h4>
                {runs.length === 0 && <div className="text-[12px] text-muted">No runs yet.</div>}
                <div className="space-y-2">
                  {runs.map((run) => (
                    <div key={run.id} className="rounded-xl border border-line p-3">
                      <div className="flex items-center gap-2">
                        <span>{run.status === "done" ? "✅" : run.status === "error" ? "❌" : "🔄"}</span>
                        <span className="text-[12px] font-medium text-ink">{new Date(run.startedAt).toLocaleString()}</span>
                        {run.completedAt && (
                          <span className="text-[11px] text-muted ml-auto">
                            {Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
                          </span>
                        )}
                      </div>
                      {run.error && <div className="mt-1 text-[11px] text-red-500">{run.error}</div>}
                      {run.output && (
                        <details className="mt-1">
                          <summary className="text-[11px] text-blue-500 cursor-pointer">View output</summary>
                          <pre className="mt-1 max-h-32 overflow-y-auto text-[10px] text-ink whitespace-pre-wrap">{run.output.slice(0, 500)}</pre>
                        </details>
                      )}
                    </div>
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

function NewWorkflowForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [frequency, setFrequency] = useState<ScheduleFrequency>("manual");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !instruction.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, instruction, frequency, description }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-[14px] font-semibold text-ink">New Workflow</h3>
      <div>
        <label className="text-[12px] text-muted block mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Weekly competitor report"
          className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-line-strong"
        />
      </div>
      <div>
        <label className="text-[12px] text-muted block mb-1">Description (optional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description"
          className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-line-strong"
        />
      </div>
      <div>
        <label className="text-[12px] text-muted block mb-1">Instruction (what to do)</label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          placeholder="Research MeetUniversity competitors and produce a summary report with pricing comparison..."
          className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-line-strong resize-none"
        />
      </div>
      <div>
        <label className="text-[12px] text-muted block mb-1">Schedule</label>
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
          className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-ink focus:outline-none"
        >
          <option value="manual">Manual only</option>
          <option value="hourly">Every hour</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim() || !instruction.trim()}
          className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-app hover:opacity-80 disabled:opacity-40"
        >
          {saving ? "Creating…" : "Create Workflow"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-[13px] text-muted hover:bg-raised">
          Cancel
        </button>
      </div>
    </form>
  );
}
