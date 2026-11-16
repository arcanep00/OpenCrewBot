import { handle, body } from "@/lib/server/http";
import { listSharedMemory, writeSharedMemory, readSharedMemory, appendSharedMemory } from "@/lib/server/shared-memory";
import { InputError } from "@/lib/server/errors";

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
    const { scope, content, note, section, source } = await body<{
      scope: string;
      content?: string;
      note?: string;
      section?: string;
      source?: string;
    }>(request);
    if (!scope?.trim()) throw new InputError("scope is required.");
    if (note) {
      await appendSharedMemory(scope, note, section, source);
    } else if (content !== undefined) {
      await writeSharedMemory(scope, content);
    } else {
      throw new InputError("content or note is required.");
    }
    return { ok: true };
  });
}
