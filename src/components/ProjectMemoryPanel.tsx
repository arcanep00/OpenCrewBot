"use client";

import { useEffect, useState, useCallback } from "react";
import { Button, inputClass } from "./ui";
import { useApp } from "./OpenCrewBotApp";

interface Project {
  scope: string;
  preview: string;
}

export function ProjectMemoryPanel({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = content !== saved;

  const loadList = useCallback(async () => {
    const res = await fetch("/api/shared-memory");
    if (!res.ok) return;
    const data = (await res.json()) as { memories: Project[] };
    setProjects(data.memories.filter((m) => m.scope.startsWith("project:")));
  }, []);

  const loadContent = useCallback(async (scope: string) => {
    const res = await fetch(`/api/shared-memory?scope=${encodeURIComponent(scope)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { content: string };
    setSaved(data.content);
    setContent(data.content);
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  useEffect(() => {
    if (selected) void loadContent(selected);
  }, [selected, loadContent]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch("/api/shared-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: selected, content }),
      });
      setSaved(content);
      toast("Project memory saved.");
      await loadList();
    } catch {
      toast("Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const createProject = async () => {
    const name = newName.trim();
    if (!name) return;
    const scope = `project:${name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;
    await fetch("/api/shared-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, content: `# ${name}\n` }),
    });
    setNewName("");
    await loadList();
    setSelected(scope);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-app shadow-pop ring-1 ring-line overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Project Memory</h2>
            <p className="text-[12px] text-muted mt-0.5">Shared notes across rooms and bots for a project</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink">✕</button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-56 border-r border-line flex flex-col">
            <div className="px-3 py-2 border-b border-line">
              <div className="flex gap-1">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void createProject()}
                  placeholder="New project…"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-2 py-1.5 text-[12px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-line-strong"
                />
                <button
                  onClick={() => void createProject()}
                  disabled={!newName.trim()}
                  className="rounded-lg bg-ink px-2 py-1.5 text-[12px] text-app disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {projects.length === 0 && <p className="px-3 py-4 text-[12px] text-muted">No projects yet.</p>}
              {projects.map((p) => (
                <button
                  key={p.scope}
                  onClick={() => setSelected(p.scope)}
                  className={`w-full text-left px-3 py-2.5 border-b border-line hover:bg-raised transition-colors ${selected === p.scope ? "bg-raised" : ""}`}
                >
                  <p className="text-[13px] font-medium text-ink">{p.scope.slice("project:".length)}</p>
                  <p className="text-[11px] text-muted mt-0.5 line-clamp-1">{p.preview || "Empty"}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-1 flex-col min-h-0 p-4 gap-3">
            {!selected && (
              <div className="flex flex-1 items-center justify-center text-[13px] text-muted">
                Select a project or create one
              </div>
            )}
            {selected && (
              <>
                <p className="text-[12px] text-muted">
                  Bots across all rooms can read this when working on <strong>{selected.slice("project:".length)}</strong>. Plain Markdown.
                </p>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                  className={`${inputClass} flex-1 resize-none font-mono text-[12.5px] leading-relaxed`}
                />
                <div className="flex justify-end gap-2">
                  {dirty && <Button size="sm" variant="ghost" onClick={() => setContent(saved)}>Revert</Button>}
                  <Button size="sm" variant="primary" disabled={!dirty || saving} onClick={save}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
