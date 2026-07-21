import crypto from "node:crypto";
import { ensureSkillRunCompletionReceipt } from "@/lib/server/skill-run-completion-receipt";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validWorkerSecret(request.headers.get("authorization"))) {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  const { id } = await params;
  await ensureSkillRunCompletionReceipt(id);
  return Response.json({ ok: true });
}

function validWorkerSecret(authorization: string | null) {
  const expected = process.env.SKILL_WORKER_SECRET;
  const provided = authorization?.replace(/^Bearer\s+/iu, "") ?? "";
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
