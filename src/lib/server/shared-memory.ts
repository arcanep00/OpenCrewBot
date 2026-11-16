// Shared memory scoped to a room or project. Stored in SQLite and mirrored
// to Markdown files so users can read and edit them directly.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACES_DIR } from "./config";
import { getSharedMemory, setSharedMemory, listSharedMemoryScopes } from "./db";
import { redactSecrets } from "./memory-files";
import { publish } from "./bus";

function sharedDir(): string {
  const dir = join(WORKSPACES_DIR, "_shared");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function filePath(scope: string): string {
  return join(sharedDir(), scope.replace(/[^a-zA-Z0-9_:-]/g, "_") + ".md");
}

export async function readSharedMemory(scope: string): Promise<string> {
  const fromDb = await getSharedMemory(scope);
  if (fromDb) return fromDb;
  const path = filePath(scope);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export async function writeSharedMemory(scope: string, content: string): Promise<void> {
  const clean = redactSecrets(content.trimEnd() + "\n");
  await setSharedMemory(scope, clean);
  writeFileSync(filePath(scope), clean, { mode: 0o600 });
  publish({ type: "memory-changed", botId: scope });
}

export async function appendSharedMemory(scope: string, note: string, section?: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const line = `- ${note.trim().replace(/\n+/g, " ")} _(${today})_`;
  let content = (await readSharedMemory(scope)).trimEnd();

  if (section) {
    const heading = `## ${section.trim()}`;
    const lines = content.split("\n");
    const idx = lines.findIndex((l) => l.trim().toLowerCase() === heading.toLowerCase());
    if (idx >= 0) {
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

export async function sharedMemoryForPrompt(scopes: string[]): Promise<string> {
  const sections: string[] = [];
  for (const scope of scopes) {
    const content = await readSharedMemory(scope);
    if (!content.trim()) continue;
    const label = scope.startsWith("room:") ? `Room (${scope.slice(5)})` : scope.startsWith("project:") ? `Project (${scope.slice(8)})` : scope;
    sections.push(`### ${label}\n${content.trim()}`);
  }
  return sections.length ? ["## Shared memory", ...sections].join("\n\n") : "";
}

export async function listSharedMemory(): Promise<Array<{ scope: string; preview: string }>> {
  const scopes = await listSharedMemoryScopes();
  const result = [];
  for (const scope of scopes) {
    const content = await readSharedMemory(scope);
    result.push({ scope, preview: content.trim().slice(0, 100) });
  }
  return result;
}
