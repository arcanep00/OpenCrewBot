// POST /api/workflows/[id]/trigger — manually trigger a workflow
import { handle } from "@/lib/server/http";
import { triggerWorkflow } from "@/lib/server/scheduler";
import { InputError } from "@/lib/server/service";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const run = await triggerWorkflow(id);
    if (!run) throw new InputError("Workflow not found.");
    return { run };
  });
}
