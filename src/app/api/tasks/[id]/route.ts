// GET /api/tasks/[id] — get one plan with all tasks
import { handle } from "@/lib/server/http";
import { getFullPlan } from "@/lib/server/task-engine";
import { InputError } from "@/lib/server/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const plan = await getFullPlan(id);
    if (!plan) throw new InputError("Task plan not found.");
    return { plan };
  });
}
