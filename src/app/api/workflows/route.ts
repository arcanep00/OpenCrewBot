// GET  /api/workflows — list all workflows
// POST /api/workflows — create a workflow
import { handle, body } from "@/lib/server/http";
import { listWorkflows } from "@/lib/server/db";
import { createWorkflow } from "@/lib/server/scheduler";
import type { ScheduleFrequency } from "@/lib/shared/types";
import { InputError } from "@/lib/server/service";

export async function GET() {
  return handle(async () => {
    const workflows = await listWorkflows();
    return { workflows };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const input = await body<{
      name: string;
      description?: string;
      roomId?: string;
      botId?: string;
      instruction: string;
      frequency: ScheduleFrequency;
    }>(request);
    if (!input.name?.trim()) throw new InputError("name is required.");
    if (!input.instruction?.trim()) throw new InputError("instruction is required.");
    const workflow = await createWorkflow({
      name: input.name,
      description: input.description ?? "",
      roomId: input.roomId ?? null,
      botId: input.botId ?? null,
      instruction: input.instruction,
      frequency: input.frequency ?? "manual",
    });
    return { workflow };
  });
}
