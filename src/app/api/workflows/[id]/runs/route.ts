// GET /api/workflows/[id]/runs — execution history for a workflow
import { handle } from "@/lib/server/http";
import { getWorkflowHistory } from "@/lib/server/scheduler";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const runs = await getWorkflowHistory(id, 20);
    return { runs };
  });
}
