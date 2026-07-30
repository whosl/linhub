import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  deleteSkill,
  getMarketSkills,
  getMySkills,
  saveSkill,
  skillKeys,
  type Skill,
  type SkillInput,
} from "@/api/skills";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PageLoading } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/toast";
import { SkillCard } from "./SkillCard";
import { SkillDetailDialog } from "./SkillDetailDialog";
import { SkillEditDialog } from "./SkillEditDialog";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** 构造乐观更新的临时技能(新建时插入列表头部) */
function buildOptimisticSkill(input: SkillInput): Skill {
  const now = new Date().toISOString();
  const pending = input.shareToMarket === true;
  return {
    id: `temp-${Date.now()}`,
    ownerId: "",
    name: input.name,
    emoji: input.emoji ?? "🧩",
    description: input.description ?? "",
    systemPrompt: input.systemPrompt ?? "",
    kind: "prompt",
    version: 1,
    requiredTools: [],
    resourceRefs: [],
    reviewStatus: pending ? "pending" : "draft",
    greeting: input.greeting,
    defaultModelId: input.defaultModelId,
    enabledTools: [],
    knowledgeBaseIds: [],
    visibility: pending ? "pending" : "private",
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** 技能页:我的技能 / 技能广场 */
export function SkillsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"mine" | "market">("mine");
  const [editTarget, setEditTarget] = useState<Skill | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const mineQuery = useQuery({ queryKey: skillKeys.mine, queryFn: getMySkills });
  const marketQuery = useQuery({
    queryKey: skillKeys.market,
    queryFn: getMarketSkills,
    enabled: tab === "market",
  });

  const saveMutation = useMutation({
    mutationFn: saveSkill,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: skillKeys.mine });
      const previous = queryClient.getQueryData<Skill[]>(skillKeys.mine);
      queryClient.setQueryData<Skill[]>(skillKeys.mine, (old = []) => {
        if (input.id) {
          const pending = input.shareToMarket === true;
          return old.map((s) =>
            s.id === input.id
              ? {
                  ...s,
                  name: input.name,
                  emoji: input.emoji ?? s.emoji,
                  description: input.description ?? "",
                  systemPrompt: input.systemPrompt ?? s.systemPrompt,
                  greeting: input.greeting,
                  defaultModelId: input.defaultModelId,
                  visibility: pending ? "pending" : "private",
                  reviewStatus: pending ? "pending" : s.reviewStatus,
                  updatedAt: new Date().toISOString(),
                }
              : s,
          );
        }
        return [buildOptimisticSkill(input), ...old];
      });
      return { previous };
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(skillKeys.mine, context.previous);
      }
      toast.error(errorMessage(err, "保存失败"));
    },
    onSuccess: (saved, input) => {
      toast.success(
        input.shareToMarket ? "已保存并提交审核" : input.id ? "已保存" : "已创建",
      );
      setEditTarget(null);
      if (saved) {
        queryClient.setQueryData(skillKeys.detail(saved.id), saved);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.mine });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSkill,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: skillKeys.mine });
      const previous = queryClient.getQueryData<Skill[]>(skillKeys.mine);
      queryClient.setQueryData<Skill[]>(skillKeys.mine, (old = []) =>
        old.filter((s) => s.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(skillKeys.mine, context.previous);
      }
      toast.error(errorMessage(err, "删除失败"));
    },
    onSuccess: () => {
      toast.success("已删除");
      setDeleteTarget(null);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.mine });
    },
  });

  const goChat = (skill: Skill) => {
    navigate(`/?skill=${skill.id}`);
  };

  const activeQuery = tab === "mine" ? mineQuery : marketQuery;
  const skills = activeQuery.data ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-text">技能</h1>
            <p className="mt-0.5 text-sm text-text-2">
              创建专属提示词技能,或从技能广场发现他人的技能
            </p>
          </div>
          {tab === "mine" && (
            <Button onClick={() => setEditTarget("new")}>新建技能</Button>
          )}
        </header>

        <Tabs
          tabs={[
            { value: "mine", label: "我的技能" },
            { value: "market", label: "技能广场" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as "mine" | "market")}
        />

        {activeQuery.isPending && <PageLoading text="加载技能…" />}
        {activeQuery.isError && (
          <div className="flex flex-col items-center gap-2 py-12">
            <p className="text-sm text-danger">
              {errorMessage(activeQuery.error, "加载失败")}
            </p>
            <Button variant="outline" size="sm" onClick={() => activeQuery.refetch()}>
              重试
            </Button>
          </div>
        )}

        {!activeQuery.isPending && !activeQuery.isError && skills.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-text-2">
              {tab === "mine" ? "创建你的第一个技能" : "暂无公开技能"}
            </p>
            {tab === "mine" && (
              <Button variant="outline" onClick={() => setEditTarget("new")}>
                新建技能
              </Button>
            )}
          </div>
        )}

        {skills.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                mode={tab}
                onView={(s) => setDetailId(s.id)}
                onChat={goChat}
                onEdit={(s) => setEditTarget(s)}
                onDelete={(s) => setDeleteTarget(s)}
              />
            ))}
          </div>
        )}
      </div>

      {editTarget && (
        <SkillEditDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(input) => saveMutation.mutate(input)}
          pending={saveMutation.isPending}
        />
      )}

      {deleteTarget && (
        <Dialog
          open
          onClose={() => setDeleteTarget(null)}
          title="删除技能"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "删除中…" : "删除"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-text">
            确定删除「{deleteTarget.name}」吗?此操作不可撤销。
          </p>
        </Dialog>
      )}

      {detailId && (
        <SkillDetailDialog skillId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}
