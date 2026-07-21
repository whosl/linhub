import { requireSession } from "@/lib/server/auth";
import { ensureSkillRunCompletionReceipt } from "@/lib/server/skill-run-completion-receipt";
import { getSkillRunSnapshot, listSkillRunEvents } from "@/lib/server/skill-runs";

export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const initial = await getSkillRunSnapshot(id, session.user.id);
  if (!initial) return Response.json({ error: "任务不存在" }, { status: 404 });
  const url = new URL(request.url);
  let cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? "0") || 0);
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown, idValue?: number) => {
        if (closed) return;
        const idLine = typeof idValue === "number" ? `id: ${idValue}\n` : "";
        controller.enqueue(
          encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      send("snapshot", initial);
      const startedAt = Date.now();
      try {
        while (!request.signal.aborted && Date.now() - startedAt < 290_000) {
          const events = await listSkillRunEvents(id, session.user.id, cursor);
          if (events === null) break;
          for (const event of events) {
            cursor = event.sequence;
            send("run-event", event, event.sequence);
          }
          const snapshot = await getSkillRunSnapshot(id, session.user.id);
          if (!snapshot) break;
          if (events.length > 0) send("snapshot", snapshot);
          const terminal = ["completed", "failed", "cancelled"].includes(snapshot.status);
          if (
            terminal &&
            (snapshot.completionReceiptStatus === "pending" ||
              snapshot.completionReceiptStatus === "failed")
          ) {
            await ensureSkillRunCompletionReceipt(id);
            const completedSnapshot = await getSkillRunSnapshot(id, session.user.id);
            if (completedSnapshot) send("snapshot", completedSnapshot);
            if (
              completedSnapshot &&
              ["completed", "failed"].includes(completedSnapshot.completionReceiptStatus)
            ) {
              break;
            }
          } else if (
            terminal &&
            ["completed", "failed"].includes(snapshot.completionReceiptStatus)
          ) {
            break;
          }
          send("ping", { at: Date.now() });
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
      } finally {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      closed = true;
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
