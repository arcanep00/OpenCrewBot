import { handle, body } from "@/lib/server/http";
import { orchestrate } from "@/lib/server/chief-of-staff";
import { InputError } from "@/lib/server/errors";

export async function POST(request: Request) {
  return handle(async () => {
    const { conversationId, instruction, botIds } = await body<{
      conversationId: string;
      instruction: string;
      botIds?: string[];
    }>(request);
    if (!conversationId) throw new InputError("conversationId is required.");
    if (!instruction?.trim()) throw new InputError("instruction is required.");
    const { plan, summary } = await orchestrate(conversationId, instruction, botIds);
    return { plan, summary };
  });
}
