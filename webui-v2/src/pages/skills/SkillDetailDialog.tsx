import { useQuery } from "@tanstack/react-query";
import { getModels } from "@/api/models";
import { getSkill, skillKeys } from "@/api/skills";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PageLoading } from "@/components/ui/Spinner";

const reviewStatusLabel: Record<string, { text: string; tone: "default" | "primary" | "success" | "danger" }> = {
  draft: { text: "草稿", tone: "default" },
  pending: { text: "审核中", tone: "primary" },
  approved: { text: "已通过", tone: "success" },
  rejected: { text: "已拒绝", tone: "danger" },
};

function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN");
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-text-3">{title}</h3>
      {children}
    </section>
  );
}

interface SkillDetailDialogProps {
  skillId: string;
  onClose: () => void;
}

/** 技能详情对话框:GET /api/skills/{id} */
export function SkillDetailDialog({ skillId, onClose }: SkillDetailDialogProps) {
  const detailQuery = useQuery({
    queryKey: skillKeys.detail(skillId),
    queryFn: () => getSkill(skillId),
  });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: getModels });

  const skill = detailQuery.data;
  const modelName = skill?.defaultModelId
    ? (modelsQuery.data?.models.find((m) => m.id === skill.defaultModelId)
        ?.displayName ?? skill.defaultModelId)
    : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={skill ? undefined : "技能详情"}
      widthClassName="max-w-lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      }
    >
      {detailQuery.isPending && <PageLoading text="加载详情…" />}
      {detailQuery.isError && (
        <p className="py-6 text-center text-sm text-danger">
          {detailQuery.error instanceof Error
            ? detailQuery.error.message
            : "加载失败"}
        </p>
      )}
      {skill && (
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex items-start gap-3">
            <span className="text-4xl leading-none" aria-hidden>
              {skill.emoji || "🧩"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-text">
                  {skill.name}
                </h3>
                <Badge>v{skill.version}</Badge>
                <Badge tone={reviewStatusLabel[skill.reviewStatus]?.tone ?? "default"}>
                  {reviewStatusLabel[skill.reviewStatus]?.text ?? skill.reviewStatus}
                </Badge>
                {skill.kind === "pack" && <Badge tone="primary">技能包</Badge>}
              </div>
              <p className="mt-1 text-xs text-text-3">
                使用 {skill.usageCount} 次 · 创建于 {formatTime(skill.createdAt)}
              </p>
            </div>
          </div>

          {skill.description && (
            <Section title="描述">
              <p className="text-sm text-text">{skill.description}</p>
            </Section>
          )}

          {skill.systemPrompt && (
            <details className="rounded-lg border border-border bg-surface-2 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-text-2 select-none">
                系统提示词
              </summary>
              <pre className="mt-2 max-h-48 overflow-y-auto font-mono text-xs whitespace-pre-wrap text-text">
                {skill.systemPrompt}
              </pre>
            </details>
          )}

          {skill.greeting && (
            <Section title="开场白">
              <p className="text-sm whitespace-pre-wrap text-text">
                {skill.greeting}
              </p>
            </Section>
          )}

          {modelName && (
            <Section title="默认模型">
              <p className="text-sm text-text">{modelName}</p>
            </Section>
          )}

          {(skill.source || skill.license) && (
            <Section title="来源">
              <div className="flex flex-col gap-0.5 text-sm text-text">
                {skill.source && <p>来源:{skill.source}</p>}
                {skill.license && <p>许可证:{skill.license}</p>}
              </div>
            </Section>
          )}

          {(skill.requiredTools.length > 0 || skill.enabledTools.length > 0) && (
            <Section title="工具">
              <div className="flex flex-col gap-1.5">
                {skill.requiredTools.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-text-3">必需:</span>
                    {skill.requiredTools.map((t) => (
                      <Badge key={t} tone="primary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
                {skill.enabledTools.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-text-3">已启用:</span>
                    {skill.enabledTools.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {skill.resourceRefs.length > 0 && (
            <Section title="资源清单">
              <ul className="flex flex-col gap-1">
                {skill.resourceRefs.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-sm"
                  >
                    <span className="min-w-0 truncate text-text">{r.name}</span>
                    <span className="shrink-0 text-xs text-text-3">
                      {formatSize(r.size)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {skill.scriptPolicy?.enabled && (
            <Section title="脚本策略">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge>
                  超时 {skill.scriptPolicy.timeoutMs ?? "-"} ms
                </Badge>
                <Badge tone={skill.scriptPolicy.network ? "success" : "default"}>
                  {skill.scriptPolicy.network ? "允许网络" : "禁止网络"}
                </Badge>
                {skill.scriptPolicy.allowedScripts?.map((s) => (
                  <Badge key={s} tone="primary">
                    {s}
                  </Badge>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </Dialog>
  );
}
