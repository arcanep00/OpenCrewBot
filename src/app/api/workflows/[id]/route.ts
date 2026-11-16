// PATCH  /api/workflows/[id] — update a workflow
// DELETE /api/workflows/[id] — delete a workflow
import { handle, body } from "@/lib/server/http";
import { updateWorkflow, deleteWorkflow } from "@/lib/server/scheduler";
import { InputError } from "@/lib/server/service";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const patch = await body<Parameters<typeof updateWorkflow>[1]>(request);
    const workflow = await updateWorkflow(id, patch);
    if (!workflow) throw new InputError("Workflow not found.");
    return { workflow };
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    await deleteWorkflow(id);
    return { ok: true };
  });
}
