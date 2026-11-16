import { handle, body } from "@/lib/server/http";
import { InputError } from "@/lib/server/errors";
import { createBot } from "@/lib/server/service";
import { isMock } from "@/lib/server/config";
import { DEFAULT_MODEL } from "@/lib/server/models";
import { runTurn } from "@/lib/server/runtime";
import { listBots } from "@/lib/server/db";
import type { ApprovalMode } from "@/lib/shared/types";

export async function POST(request: Request) {
  return handle(async () => {
    const { description, approval, tools } = await body<{
      description: string;
      approval?: ApprovalMode;
      tools?: { webSearch?: boolean; codeMode?: boolean };
    }>(request);
    if (!description?.trim()) throw new InputError("description is required.");

    let name = "";
    let title = "";
    let instructions = "";
    let emoji = "🤖";

    if (isMock()) {
      const words = description.trim().split(/\s+/);
      name = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").slice(0, 20);
      title = words.slice(2, 4).join(" ") || "Assistant";
      instructions = description;
    } else {
      const bots = await listBots();
      const planner = bots[0];
      if (!planner) throw new InputError("No bots available to generate an agent.");

      const prompt = [
        "Extract agent configuration from this description. Return ONLY a JSON object with these keys:",
        "name (string, 1-3 words), title (string, 1-3 words role), emoji (single emoji), instructions (string, 2-4 sentences).",
        "",
        `Description: ${description}`,
        "",
        "Output only the JSON object, no markdown.",
      ].join("\n");

      const reply = await runTurn({ bot: planner, conversationId: `agent-gen:${Date.now()}`, content: prompt, route: { by: "lead" } });
      const text = reply?.parts.filter((p) => p.kind === "text").map((p) => (p as { text: string }).text).join("") ?? "";

      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim()) as {
          name?: string;
          title?: string;
          emoji?: string;
          instructions?: string;
        };
        name = parsed.name ?? description.split(" ").slice(0, 2).join(" ");
        title = parsed.title ?? "Assistant";
        emoji = parsed.emoji ?? "🤖";
        instructions = parsed.instructions ?? description;
      } catch {
        name = description.split(" ").slice(0, 2).join(" ");
        title = "Assistant";
        instructions = description;
      }
    }

    const bot = await createBot({
      name,
      title,
      description: description.slice(0, 200),
      instructions,
      emoji,
      color: ["#3b82f6", "#f59e0b", "#ec4899", "#22c55e", "#8b5cf6"][Math.floor(Math.random() * 5)],
      model: DEFAULT_MODEL,
      tools: {
        webSearch: tools?.webSearch ?? true,
        memory: true,
        codeMode: tools?.codeMode ?? false,
        browser: false,
        askUser: true,
      },
      approval: approval ?? "ask",
      pinned: false,
    });

    return { bot };
  });
}
