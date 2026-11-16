// GET /api/tasks — list recent task plans
// GET /api/tasks?conversationId=... — plans for a conversation
import { handle } from "@/lib/server/http";
import { listTaskPlans } from "@/lib/server/db";

export async function GET(request: Request) {
  return handle(async () => {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId") ?? undefined;
    const plans = await listTaskPlans(conversationId, 50);
    return { plans };
  });
}
