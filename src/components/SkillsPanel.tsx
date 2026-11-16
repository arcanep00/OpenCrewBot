"use client";

import { useEffect, useState } from "react";
import type { Skill } from "@/lib/shared/types";

export function SkillsPanel({ onClose }: { onClose: () => void }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/skills")
      .then((r) => r.json())
      .then((d: { skills: Skill[] }) => setSkills(d.skills))
      .catch(() => {});
  }, []);

  const filtered = query.trim()
    ? skills.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()) || s.description.toLowerCase().includes(query.toLowerCase()))
    : skills;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-app shadow-pop ring-1 ring-line overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Skills</h2>
            <p className="text-[12px] text-muted mt-0.5">Reusable instruction sets that load automatically into bot prompts</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink">✕</button>
        </div>

        <div className="border-b border-line px-4 py-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills…"
            className="w-full rounded-lg border border-line bg-raised px-3 py-1.5 text-[13px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-line-strong"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {filtered.map((skill) => (
            <div key={skill.id} className="rounded-xl border border-line bg-raised p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-ink">{skill.name}</h3>
                  <p className="text-[12.5px] text-muted mt-0.5">{skill.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1 justify-end">
                  {skill.requiredTools.length === 0 ? (
                    <span className="rounded-full bg-raised-2 px-2 py-0.5 text-[11px] text-muted">No tools needed</span>
                  ) : (
                    skill.requiredTools.map((t) => (
                      <span key={t} className="rounded-full bg-raised-2 px-2 py-0.5 text-[11px] text-muted capitalize">
                        {t.replace(/([A-Z])/g, " $1").toLowerCase()}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-[12px] text-blue-500 hover:underline">View instructions</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-app p-3 text-[11px] text-muted leading-relaxed">
                  {skill.instructions}
                </pre>
              </details>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[13px] text-muted">No skills match your search.</p>
          )}
        </div>

        <div className="border-t border-line px-5 py-3">
          <p className="text-[12px] text-muted">
            Skills are automatically selected based on each bot&apos;s role and the current task. A bot with <strong>Web search</strong> gets research skills; one with <strong>Code mode</strong> gets analysis skills.
          </p>
        </div>
      </div>
    </div>
  );
}
