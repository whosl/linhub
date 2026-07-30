"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  InfoIcon,
  MessageSquareIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import { clientRandomUUID } from "@/lib/client-id";
import type { Skill } from "@/lib/types";
import {
  optimisticInsertRecord,
  optimisticPatchRecords,
  optimisticRemoveRecord,
} from "@/lib/optimistic-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Badge, Card, EmptyState, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { toast } from "sonner";

const EMOJI_CHOICES = ["🤖", "🔍", "🌐", "🎓", "✨", "✍️", "💻", "📊", "🎨", "🧠", "📚", "⚡️"];

export default function SkillsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Skill | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Skill | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<Skill | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const { data: mySkills = [] } = useQuery({
    queryKey: ["skills", "mine"],
    queryFn: () => getDataService().listMySkills(),
  });
  const { data: marketSkills = [] } = useQuery({
    queryKey: ["skills", "market"],
    queryFn: () => getDataService().listMarketSkills(),
  });
  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: () => getDataService().listModels(),
  });

  const openEditor = (skill?: Skill) => {
    setEditing(skill ?? null);
    setEditorOpen(true);
  };

  const remove = (skill: Skill) => {
    setDeleteTarget(skill);
  };

  const confirmRemove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const target = deleteTarget;
    const optimistic = optimisticRemoveRecord<Skill>(
      queryClient,
      [["skills"]],
      target.id
    );
    setDeleteTarget(null);
    try {
      await getDataService().deleteSkill(target.id);
      toast.success("已删除");
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "技能删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const startChat = (skill: Skill) => {
    router.push(`/?skill=${skill.id}`);
    toast.info(`已选择技能「${skill.name}」`);
  };

  return (
    <PageContainer wide>
      <PageHeader
        title="技能"
        description="自定义助手：专属提示词、模型、工具与知识库"
        action={
          <Button onClick={() => openEditor()}>
            <PlusIcon /> 创建技能
          </Button>
        }
      />

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">我的技能</TabsTrigger>
          <TabsTrigger value="market">技能广场</TabsTrigger>
        </TabsList>

        <TabsContent value="mine">
          {mySkills.length === 0 ? (
            <EmptyState
              icon={<SparklesIcon />}
              title="还没有自定义技能"
              description="把常用的提示词、模型与工具组合保存为技能，一键发起对话。"
              action={<Button onClick={() => openEditor()}>创建第一个技能</Button>}
            />
          ) : (
            <SkillGrid
              skills={mySkills}
              onChat={startChat}
              onDetails={setDetailTarget}
              onEdit={openEditor}
              onDelete={remove}
            />
          )}
        </TabsContent>

        <TabsContent value="market">
          <SkillGrid
            skills={marketSkills}
            onChat={startChat}
            onDetails={setDetailTarget}
          />
        </TabsContent>
      </Tabs>

      <SkillEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        skill={editing}
        models={models.filter((m) => !m.capabilities.includes("image-generation"))}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["skills"] });
          setEditorOpen(false);
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="删除技能"
        description={
          deleteTarget
            ? `确定删除技能「${deleteTarget.name}」？删除后无法撤销。`
            : "确定删除这个技能？删除后无法撤销。"
        }
        confirmLabel="删除"
        destructive
        loading={deleting}
        onConfirm={confirmRemove}
      />
      <SkillDetailsDialog
        skill={detailTarget}
        open={!!detailTarget}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
      />
    </PageContainer>
  );
}

function SkillGrid({
  skills,
  onChat,
  onDetails,
  onEdit,
  onDelete,
}: {
  skills: Skill[];
  onChat: (s: Skill) => void;
  onDetails: (s: Skill) => void;
  onEdit?: (s: Skill) => void;
  onDelete?: (s: Skill) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {skills.map((s, i) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
        >
          <Card className="group flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
            <div className="mb-2 flex items-start justify-between">
              <span className="text-3xl">{s.emoji}</span>
              <div className="flex flex-wrap justify-end gap-1">
                {s.kind === "pack" && <Badge variant="default">技能包</Badge>}
                {isInternalRuntime(s) && <Badge variant="secondary">内部运行时</Badge>}
                {s.clientMutationState === "pending" && (
                  <Badge variant="outline">保存中…</Badge>
                )}
                {s.visibility === "public" && <Badge variant="success">已公开</Badge>}
                {s.visibility === "pending" && <Badge variant="warning">审核中</Badge>}
              </div>
            </div>
            <h3 className="font-medium">{s.name}</h3>
            <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">
              {s.description}
            </p>
            {s.kind === "pack" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.resourceRefs.length > 0 && <Badge variant="outline">含资源</Badge>}
                {s.scriptPolicy.enabled && <Badge variant="outline">含脚本</Badge>}
                {[
                  ...s.requiredTools,
                  ...s.enabledTools,
                ].some((tool) => String(tool).startsWith("pptx_")) && (
                  <Badge variant="outline">PPTX</Badge>
                )}
                <Badge variant="outline">v{s.version}</Badge>
                {s.source && <Badge variant="outline">{s.source}</Badge>}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{s.usageCount} 次使用</span>
              <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                {onEdit && s.kind !== "pack" && (
                  <button
                    type="button"
                    aria-label={`编辑技能「${s.name}」`}
                    onClick={() => onEdit(s)}
                    className="rounded-md p-1.5 hover:bg-accent hover:text-foreground"
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                )}
                {onDelete && s.kind !== "pack" && (
                  <button
                    type="button"
                    aria-label={`删除技能「${s.name}」`}
                    onClick={() => onDelete(s)}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
                {s.kind === "pack" && (
                  <button
                    type="button"
                    onClick={() => onDetails(s)}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 font-medium hover:bg-accent hover:text-foreground"
                  >
                    <InfoIcon className="size-3.5" /> 详情
                  </button>
                )}
                {!isInternalRuntime(s) && (
                  <button
                    type="button"
                    onClick={() => onChat(s)}
                    className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1.5 font-medium text-primary hover:bg-primary/20"
                  >
                    <MessageSquareIcon className="size-3.5" /> 对话
                  </button>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function isInternalRuntime(skill: Skill) {
  return skill.manifest?.internal === true || skill.id === "skill-dashi-ppt";
}

function manifestString(skill: Skill, key: string) {
  const value = skill.manifest?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatResourceSize(size?: number) {
  if (size === undefined) return undefined;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function SkillDetailsDialog({
  skill,
  open,
  onOpenChange,
}: {
  skill: Skill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!skill) return null;

  const tools = Array.from(
    new Set([
      ...(skill.allowedTools ?? []),
      ...skill.requiredTools,
      ...skill.enabledTools,
    ])
  );
  const license = skill.license ?? manifestString(skill, "license") ?? "未声明";
  const sourceUrl = manifestString(skill, "sourceUrl");
  const reviewLabels: Record<Skill["reviewStatus"], string> = {
    draft: "草稿",
    pending: "待审核",
    approved: "已审核",
    rejected: "已拒绝",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 pr-8">
            <span className="text-3xl" aria-hidden>{skill.emoji}</span>
            <div className="min-w-0">
              <DialogTitle className="truncate">{skill.name}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-2">
          <DetailRow label="版本" value={`v${skill.version}`} />
          <DetailRow label="审核状态" value={reviewLabels[skill.reviewStatus]} />
          <DetailRow label="来源" value={skill.source ?? "未声明"} href={sourceUrl} />
          <DetailRow label="许可证" value={license} />
          <DetailRow
            label="兼容性"
            value={skill.compatibility ?? "LinHub Skill Pack"}
            wide
          />
        </div>

        <DetailSection title="启用工具" empty="该技能未声明工具">
          {tools.map((tool) => (
            <Badge key={tool} variant="outline">{tool}</Badge>
          ))}
        </DetailSection>

        <DetailSection title={`资源清单（${skill.resourceRefs.length}）`} empty="该技能不含资源">
          {skill.resourceRefs.map((resource) => (
            <div key={resource.id} className="w-full rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{resource.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[resource.kind, resource.mimeType, formatResourceSize(resource.size)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {resource.description && (
                <p className="mt-1 text-xs text-muted-foreground">{resource.description}</p>
              )}
            </div>
          ))}
        </DetailSection>

        <DetailSection title="脚本权限">
          <div className="w-full space-y-1 rounded-lg border bg-card p-3 text-sm">
            <p>{skill.scriptPolicy.enabled ? "允许执行审核脚本" : "不允许执行脚本"}</p>
            {skill.scriptPolicy.enabled && (
              <>
                <p className="text-xs text-muted-foreground">
                  网络：{skill.scriptPolicy.network ? "允许" : "禁止"}
                  {skill.scriptPolicy.timeoutMs
                    ? ` · 超时：${skill.scriptPolicy.timeoutMs} ms`
                    : ""}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {(skill.scriptPolicy.allowedScripts ?? []).map((script) => (
                    <Badge key={script} variant="outline">{script}</Badge>
                  ))}
                </div>
              </>
            )}
          </div>
        </DetailSection>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  href,
  wide,
}: {
  label: string;
  value: string;
  href?: string;
  wide?: boolean;
}) {
  const safeHref = href?.startsWith("https://") ? href : undefined;
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <p className="text-xs text-muted-foreground">{label}</p>
      {safeHref ? (
        <a
          href={safeHref}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 inline-block break-all font-medium text-primary hover:underline"
        >
          {value}
        </a>
      ) : (
        <p className="mt-0.5 break-words font-medium">{value}</p>
      )}
    </div>
  );
}

function DetailSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children: React.ReactNode;
}) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {hasChildren ? children : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
    </section>
  );
}

function SkillEditor({
  open,
  onOpenChange,
  skill,
  models,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  skill: Skill | null;
  models: { id: string; displayName: string }[];
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    name: "",
    emoji: "🤖",
    description: "",
    systemPrompt: "",
    greeting: "",
    defaultModelId: "",
    shareToMarket: false,
  });

  React.useEffect(() => {
    if (open) {
      Promise.resolve().then(() => {
        setForm({
          name: skill?.name ?? "",
          emoji: skill?.emoji ?? "🤖",
          description: skill?.description ?? "",
          systemPrompt: skill?.systemPrompt ?? "",
          greeting: skill?.greeting ?? "",
          defaultModelId: skill?.defaultModelId ?? "",
          shareToMarket: skill?.visibility === "public" || skill?.visibility === "pending",
        });
      });
    }
  }, [open, skill]);

  const save = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) return;
    const input = {
      id: skill?.id,
      name: form.name.trim(),
      emoji: form.emoji,
      description: form.description,
      systemPrompt: form.systemPrompt,
      greeting: form.greeting || undefined,
      defaultModelId: form.defaultModelId || undefined,
      shareToMarket: form.shareToMarket,
    };
    const now = new Date().toISOString();
    const transaction = skill
      ? optimisticPatchRecords<Skill>(
          queryClient,
          [["skills"]],
          skill.id,
          {
            name: input.name,
            emoji: input.emoji,
            description: input.description,
            systemPrompt: input.systemPrompt,
            greeting: input.greeting,
            defaultModelId: input.defaultModelId,
            visibility: input.shareToMarket ? "pending" : "private",
            updatedAt: now,
            clientMutationState: "pending",
          }
        )
      : optimisticInsertRecord<Skill>(
          queryClient,
          [["skills", "mine"]],
          {
            id: `optimistic-skill-${clientRandomUUID()}`,
            ownerId: "optimistic",
            name: input.name,
            emoji: input.emoji,
            description: input.description,
            systemPrompt: input.systemPrompt,
            kind: "prompt",
            version: "1.0.0",
            requiredTools: [],
            resourceRefs: [],
            scriptPolicy: { enabled: false },
            reviewStatus: input.shareToMarket ? "pending" : "draft",
            greeting: input.greeting,
            defaultModelId: input.defaultModelId,
            enabledTools: [],
            knowledgeBaseIds: [],
            visibility: input.shareToMarket ? "pending" : "private",
            usageCount: 0,
            createdAt: now,
            updatedAt: now,
            clientMutationState: "pending",
          }
        );
    onOpenChange(false);
    try {
      const saved = await getDataService().saveSkill(input);
      transaction.reconcile(saved);
      toast.success(skill ? "技能已更新" : "技能已创建");
      onSaved();
    } catch (error) {
      transaction.rollback();
      toast.error(error instanceof Error ? error.message : "技能保存失败");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{skill ? "编辑技能" : "创建技能"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                图标
              </label>
              <div className="grid w-40 grid-cols-4 gap-1">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-label={`选择图标 ${e}`}
                    onClick={() => setForm({ ...form, emoji: e })}
                    className={`rounded-lg p-1.5 text-xl transition-colors ${form.emoji === e ? "bg-primary/15 ring-1 ring-primary" : "hover:bg-accent"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  名称 *
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：代码审查员"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  描述
                </label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="一句话说明这个技能做什么"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              系统提示词 *
            </label>
            <Textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              rows={5}
              placeholder="定义这个助手的角色、能力与行为边界…"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              开场白
            </label>
            <Input
              value={form.greeting}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              placeholder="用户打开对话时看到的第一句话（可选）"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              默认模型
            </label>
            <Select
              value={form.defaultModelId}
              onValueChange={(v) => setForm({ ...form, defaultModelId: v })}
              placeholder="跟随用户当前模型"
              options={models.map((m) => ({ value: m.id, label: m.displayName }))}
            />
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border p-3">
            <span>
              <span className="block text-sm font-medium">分享到技能广场</span>
              <span className="text-xs text-muted-foreground">
                通过管理员审核后对所有用户可见
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.shareToMarket}
              onChange={(e) => setForm({ ...form, shareToMarket: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={save} disabled={!form.name.trim() || !form.systemPrompt.trim()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
