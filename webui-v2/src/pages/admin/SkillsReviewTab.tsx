// 技能审核 Tab:待审核列表,展开查看 systemPrompt,通过 / 拒绝

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminKeys,
  getPendingSkills,
  reviewSkill,
  type AdminSkill,
} from "@/api/admin";
import { Button } from "@/components/ui/Button";
import { PageLoading } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { EmptyState, errorMessage } from "./shared";

export function SkillsReviewTab() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const skillsQuery = useQuery({
    queryKey: adminKeys.skills,
    queryFn: getPendingSkills,
  });

  const reviewMutation = useMutation({
    mutationFn: reviewSkill,
    onSuccess: (_data, input) => {
      toast.success(input.approve ? "已通过" : "已拒绝");
    },
    onError: (err) => toast.error(errorMessage(err, "操作失败")),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.skills }),
  });

  if (skillsQuery.isPending) return <PageLoading text="加载待审核技能…" />;
  if (skillsQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <p className="text-sm text-danger">
          {errorMessage(skillsQuery.error, "加载失败")}
        </p>
        <Button variant="outline" size="sm" onClick={() => skillsQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const skills = skillsQuery.data;

  if (skills.length === 0) {
    return <EmptyState text="暂无待审核技能" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-2">共 {skills.length} 个待审核技能</p>
      <ul className="flex flex-col gap-2">
        {skills.map((skill) => (
          <SkillReviewCard
            key={skill.id}
            skill={skill}
            expanded={expandedId === skill.id}
            onToggle={() =>
              setExpandedId(expandedId === skill.id ? null : skill.id)
            }
            pending={reviewMutation.isPending}
            onReview={(approve) =>
              reviewMutation.mutate({ id: skill.id, approve })
            }
          />
        ))}
      </ul>
    </div>
  );
}

function SkillReviewCard({
  skill,
  expanded,
  onToggle,
  pending,
  onReview,
}: {
  skill: AdminSkill;
  expanded: boolean;
  onToggle: () => void;
  pending: boolean;
  onReview: (approve: boolean) => void;
}) {
  return (
    <li className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-xl" aria-hidden>
          {skill.emoji || "🧩"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">
            {skill.name}
          </span>
          <span className="block truncate text-xs text-text-2">
            {skill.description || "无描述"}
          </span>
        </span>
        <span className="shrink-0 font-mono text-xs text-text-3">
          owner: {skill.ownerId}
        </span>
        <span
          className={cn(
            "shrink-0 text-xs text-text-3 transition-transform",
            expanded && "rotate-90",
          )}
          aria-hidden
        >
          ▶
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          <div>
            <p className="mb-1 text-xs font-medium text-text-2">系统提示词</p>
            <pre className="max-h-60 overflow-y-auto rounded-md bg-surface-2 p-3 text-xs break-words whitespace-pre-wrap text-text">
              {skill.systemPrompt || "(空)"}
            </pre>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => onReview(false)}
            >
              拒绝
            </Button>
            <Button
              size="sm"
              className="bg-success hover:opacity-90"
              disabled={pending}
              onClick={() => onReview(true)}
            >
              通过
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
