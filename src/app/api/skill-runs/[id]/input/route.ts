import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { submitSkillRunInput } from "@/lib/server/skill-runs";

const THEMES = [
  "theme01", "theme02", "theme03", "theme04", "theme05", "theme06",
  "theme07", "theme08", "theme09", "theme10", "theme11", "theme12",
] as const;

const BriefSchema = z.object({
  topic: z.string().trim().min(2).max(200),
  audience: z.string().trim().min(1).max(200),
  pageCount: z.number().int().min(3).max(30),
  theme: z.enum(THEMES),
  mediaPreference: z.enum(["auto", "image-heavy", "text-first", "no-media"]),
  language: z.enum(["zh", "en"]),
  outputFormat: z.enum(["pptx", "html"]),
  additionalInstructions: z.string().trim().max(1_000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const parsed = BriefSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "PPT 需求信息不完整" }, { status: 400 });
  }
  const { id } = await params;
  const run = await submitSkillRunInput(id, session.user.id, parsed.data);
  if (!run) {
    return Response.json({ error: "任务不存在、已提交或无权访问" }, { status: 409 });
  }
  return Response.json(run);
}
