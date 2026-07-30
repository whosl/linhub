import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Skill } from "@/api/skills";

/** 可见性徽章文案与色调 */
function VisibilityBadge({ skill }: { skill: Skill }) {
  if (skill.visibility === "public") return <Badge tone="success">已公开</Badge>;
  if (skill.visibility === "pending") return <Badge tone="primary">审核中</Badge>;
  return <Badge>私有</Badge>;
}

interface SkillCardProps {
  skill: Skill;
  /** mine:显示编辑/删除;market:只读 */
  mode: "mine" | "market";
  onView: (skill: Skill) => void;
  onChat: (skill: Skill) => void;
  onEdit?: (skill: Skill) => void;
  onDelete?: (skill: Skill) => void;
}

/** 技能卡片:emoji + 名称 + 描述 + 徽章行 + 使用次数 + 操作 */
export function SkillCard({
  skill,
  mode,
  onView,
  onChat,
  onEdit,
  onDelete,
}: SkillCardProps) {
  const isPack = skill.kind === "pack";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onView(skill)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onView(skill);
      }}
      className="flex cursor-pointer flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none" aria-hidden>
          {skill.emoji || "🧩"}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text">
            {skill.name}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-text-2">
            {skill.description || "暂无描述"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <VisibilityBadge skill={skill} />
        {isPack && <Badge tone="primary">技能包</Badge>}
        {skill.reviewStatus === "rejected" && (
          <Badge tone="danger">已拒绝</Badge>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-xs text-text-3">使用 {skill.usageCount} 次</span>
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Button size="sm" variant="ghost" onClick={() => onChat(skill)}>
            对话
          </Button>
          {mode === "mine" && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPack}
                title={isPack ? "技能包不可编辑" : undefined}
                onClick={() => onEdit?.(skill)}
              >
                编辑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPack}
                title={isPack ? "技能包不可删除" : undefined}
                className="text-danger hover:bg-danger-soft"
                onClick={() => onDelete?.(skill)}
              >
                删除
              </Button>
            </>
          )}
          {mode === "market" && (
            <Button size="sm" variant="ghost" onClick={() => onView(skill)}>
              查看
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
