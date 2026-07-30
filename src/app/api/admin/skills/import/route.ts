import { requireAdmin } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";
import { importAgentSkillZip } from "@/lib/server/skills/agent-skill-import";
import { installAgentSkillPackage } from "@/lib/server/skills/agent-skill-registry";

export const maxDuration = 120;

export async function POST(request: Request) {
  await ensureSeeded();
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip")) {
    return Response.json({ error: "请选择 .zip Skill 包" }, { status: 400 });
  }
  try {
    const imported = await importAgentSkillZip(Buffer.from(await file.arrayBuffer()));
    const installed = await installAgentSkillPackage({
      ownerId: session.user.id,
      packageRoot: imported.packageRoot,
      source: `import:${file.name}`,
      visibility: "private",
      reviewStatus: "draft",
    });
    return Response.json({
      ok: true,
      skillId: installed.id,
      name: imported.skill.frontmatter.name,
      digest: imported.skill.digest,
      message: "Skill 包已导入为草稿，审核后才能执行脚本或公开发布。",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Skill 导入失败" },
      { status: 400 }
    );
  }
}
