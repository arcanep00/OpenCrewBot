import { subscribe } from "@/lib/server/bus";
import { boot } from "@/lib/server/service";
import type { ServerEvent } from "@/lib/shared/types";

const SSE_TYPES = new Set<string>(["message", "delta", "running", "bots-changed", "rooms-changed", "memory-changed", "browser-session", "connections-changed"]);

// One SSE stream carries every live update: message snapshots, text deltas,
// who's running, and roster changes. The browser folds it into its state.
export async function GET(request: Request) {
  await boot();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send(": connected\n\n");
      const unsubscribe = subscribe((event) => {
        if (SSE_TYPES.has(event.type)) {
          send(`data: ${JSON.stringify(event as ServerEvent)}\n\n`);
        }
      });
      const heartbeat = setInterval(() => send(": ping\n\n"), 15_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
