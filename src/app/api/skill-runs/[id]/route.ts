import { after } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { ensureSkillRunCompletionReceipt } from "@/lib/server/skill-run-completion-receipt";
import {
  getSkillRunSnapshot,
  requestSkillRunCancellation,
  resetSkillRun,
} from "@/lib/server/skill-runs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const run = await getSkillRunSnapshot(id, session.user.id);
  if (!run) return Response.json({ error: "任务不存在" }, { status: 404 });
  return Response.json(run);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await requestSkillRunCancellation(id, session.user.id);
  if (ok) after(() => ensureSkillRunCompletionReceipt(id));
  return ok
    ? Response.json({ ok: true })
    : Response.json({ error: "任务不存在" }, { status: 404 });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await resetSkillRun(id, session.user.id);
  return ok
    ? Response.json({ ok: true })
    : Response.json({ error: "任务不存在" }, { status: 404 });
}
