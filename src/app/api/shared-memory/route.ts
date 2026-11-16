// GET  /api/shared-memory — list all shared memory scopes
// POST /api/shared-memory { scope, content } — write shared memory
import { handle, body } from "@/lib/server/http";
import { listSharedMemory, writeSharedMemory, readSharedMemory } from "@/lib/server/shared-memory";
import { InputError } from "@/lib/server/service";

export async function GET(request: Request) {
  return handle(async () => {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    if (scope) {
      const content = await readSharedMemory(scope);
      return { scope, content };
    }
    const memories = await listSharedMemory();
    return { memories };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const { scope, content } = await body<{ scope: string; content: string }>(request);
    if (!scope?.trim()) throw new InputError("scope is required.");
    if (content === undefined) throw new InputError("content is required.");
    await writeSharedMemory(scope, content);
    return { ok: true };
  });
}
