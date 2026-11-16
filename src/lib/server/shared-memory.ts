// Shared Memory — Module E Extension
// Extends the existing per-bot MEMORY.md system with:
//   - Shared room memory  (scope: `room:<roomId>`)
//   - Project memory      (scope: `project:<name>`)
// Memory is stored in SQLite (shared_memory table) and also mirrored
// to Markdown files so users can read and edit them directly.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACES_DIR } from "./config";
import { getSharedMemory, setSharedMemory, listSharedMemoryScopes } from "./db";
import { redactSecrets } from "./memory-files";
import { publish } from "./bus";

// ── File paths ────────────────────────────────────────────────────────────

function sharedMemoryDir(): string {
  const dir = join(WORKSPACES_DIR, "_shared");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function scopeToFilename(scope: string): string {
  return scope.replace(/[^a-zA-Z0-9_:-]/g, "_") + ".md";
}

function sharedMemoryPath(scope: string): string {
  return join(sharedMemoryDir(), scopeToFilename(scope));
}

// ── Read / Write ──────────────────────────────────────────────────────────

export async function readSharedMemory(scope: string): Promise<string> {
  // Try DB first (source of truth), fall back to file
  const fromDb = await getSharedMemory(scope);
  if (fromDb) return fromDb;
  const path = sharedMemoryPath(scope);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export async function writeSharedMemory(scope: string, content: string): Promise<void> {
  const clean = redactSecrets(content.trimEnd() + "\n");
  await setSharedMemory(scope, clean);
  // Mirror to file for human editing
  writeFileSync(sharedMemoryPath(scope), clean, { mode: 0o600 });
  publish({ type: "memory-changed", botId: scope });
}

export async function appendSharedMemory(scope: string, note: string, section?: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const line = `- ${note.trim().replace(/\n+/g, " ")} _(${today})_`;
  let content = (await readSharedMemory(scope)).trimEnd();

  if (section) {
    const heading = `## ${section.trim()}`;
    const idx = content.split("\n").findIndex((l) => l.trim().toLowerCase() === heading.toLowerCase());
    if (idx >= 0) {
      const lines = content.split("\n");
      let end = idx + 1;
      while (end < lines.length && !lines[end].startsWith("## ")) end++;
      while (end > idx + 1 && lines[end - 1].trim() === "") end--;
      lines.splice(end, 0, line);
      content = lines.join("\n");
    } else {
      content = `${content}${content ? "\n\n" : ""}${heading}\n${line}`;
    }
  } else {
    content = `${content}${content ? "\n" : ""}${line}`;
  }

  await writeSharedMemory(scope, content);
}

// ── Prompt injection ──────────────────────────────────────────────────────

/** Returns a formatted memory section for injection into bot prompts. */
export async function sharedMemoryForPrompt(scopes: string[]): Promise<string> {
  const sections: string[] = [];
  for (const scope of scopes) {
    const content = await readSharedMemory(scope);
    if (content.trim()) {
      const label = scope.startsWith("room:") ? `Room memory (${scope.slice(5)})` : scope.startsWith("project:") ? `Project memory (${scope.slice(8)})` : scope;
      sections.push(`### ${label}\n${content.trim()}`);
    }
  }
  if (!sections.length) return "";
  return ["## Shared memory", ...sections].join("\n\n");
}

// ── Memory provenance ──────────────────────────────────────────────────────

export interface MemoryProvenance {
  scope: string;
  note: string;
  source: string;
  timestamp: string;
}

export async function recordProvenance(scope: string, note: string, source: string): Promise<void> {
  // Append provenance as a hidden comment in the memory file
  const entry = `<!-- provenance: ${JSON.stringify({ note: note.slice(0, 100), source, ts: new Date().toISOString() })} -->`;
  const existing = await readSharedMemory(`${scope}_provenance`);
  await writeSharedMemory(`${scope}_provenance`, existing + entry + "\n");
}

// ── List all shared scopes ────────────────────────────────────────────────

export async function listSharedMemory(): Promise<Array<{ scope: string; preview: string }>> {
  const scopes = await listSharedMemoryScopes();
  const result = [];
  for (const scope of scopes.filter((s) => !s.endsWith("_provenance"))) {
    const content = await readSharedMemory(scope);
    result.push({ scope, preview: content.trim().slice(0, 100) });
  }
  return result;
}
