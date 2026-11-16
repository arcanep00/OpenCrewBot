"use client";
"use client";

import { useEffect, useState, useCallback } from "react";
import type { AuditEntry } from "@/lib/shared/types";

const ACTION_ICON: Record<string, string> = {
  "tool-approved": "✅",
  "tool-denied": "❌",
  "agent-created": "🤖",
  "agent-deleted": "🗑️",
  "workflow-triggered": "⚙️",
  "memory-edited": "📝",
};

interface Props {
  onClose: () => void;
}

export function AuditPanel({ onClose }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/audit");
      if (res.ok) {
        const data = (await res.json()) as { entries: AuditEntry[] };
        setEntries(data.entries);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-app shadow-pop ring-1 ring-line overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Audit Log</h2>
            <p className="text-[12px] text-muted mt-0.5">Module G — Security & approvals audit trail</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <div className="text-[13px] text-muted">Loading...</div>}
          {!loading && entries.length === 0 && (
            <div className="text-[13px] text-muted">No audit entries yet. Approval actions will be recorded here.</div>
          )}
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-3 rounded-xl border border-line p-3">
                <span className="text-lg shrink-0">{ACTION_ICON[entry.action] ?? "📋"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-ink capitalize">{entry.action.replace(/-/g, " ")}</span>
                    <span className="ml-auto text-[11px] text-muted">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-[12px] text-muted mt-0.5">{entry.detail}</p>
                  {entry.botId && <span className="text-[11px] text-muted">Bot: {entry.botId.slice(0, 8)}…</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
