import { store } from "@/lib/store";
import { startSimulator } from "@/lib/simulator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  startSimulator();
  store.ensureLoaded();

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      const unsubscribe = store.subscribe((e) => send(e.type, e));

      // heartbeat keeps proxies and browsers from dropping the stream
      const heartbeat = setInterval(() => send("ping", { ts: Date.now() }), 25_000);

      cleanup = () => {
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
      };

      send("hello", { ts: Date.now(), posts: store.posts() });

      req.signal.addEventListener("abort", () => {
        cleanup?.();
        cleanup = null;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
