import { handle, body } from "@/lib/server/http";
import { approveTask, rejectTask } from "@/lib/server/task-engine";
import { appendAuditEntry } from "@/lib/server/db";
import { InputError } from "@/lib/server/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { id: planId } = await ctx.params;
    const { taskId, approve } = await body<{ taskId: string; approve: boolean }>(request);
    if (!taskId) throw new InputError("taskId is required.");
    if (approve) {
      await approveTask(planId, taskId);
    } else {
      await rejectTask(planId, taskId);
    }
    await appendAuditEntry({
      action: approve ? "tool-approved" : "tool-denied",
      botId: null,
      conversationId: planId,
      detail: `Task ${taskId} ${approve ? "approved" : "rejected"} by user.`,
    });
    return { ok: true };
  });
}
