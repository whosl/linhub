"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, SparklesIcon, Trash2Icon, PencilIcon, MessageSquareIcon } from "lucide-react";
import { getDataService } from "@/lib/data";
import type { Skill } from "@/lib/types";
import { Button } from "@/components/ui/button";
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

  const remove = async (skill: Skill) => {
    if (!window.confirm(`删除技能「${skill.name}」？`)) return;
    await getDataService().deleteSkill(skill.id);
    queryClient.invalidateQueries({ queryKey: ["skills"] });
    toast.success("已删除");
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
              onEdit={openEditor}
              onDelete={remove}
            />
          )}
        </TabsContent>

        <TabsContent value="market">
          <SkillGrid skills={marketSkills} onChat={startChat} />
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
    </PageContainer>
  );
}

function SkillGrid({
  skills,
  onChat,
  onEdit,
  onDelete,
}: {
  skills: Skill[];
  onChat: (s: Skill) => void;
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
              {s.visibility === "public" && <Badge variant="success">已公开</Badge>}
              {s.visibility === "pending" && <Badge variant="warning">审核中</Badge>}
            </div>
            <h3 className="font-medium">{s.name}</h3>
            <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">
              {s.description}
            </p>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{s.usageCount} 次使用</span>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {onEdit && (
                  <button
                    onClick={() => onEdit(s)}
                    className="rounded-md p-1.5 hover:bg-accent hover:text-foreground"
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(s)}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onChat(s)}
                  className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1.5 font-medium text-primary hover:bg-primary/20"
                >
                  <MessageSquareIcon className="size-3.5" /> 对话
                </button>
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
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
    await getDataService().saveSkill({
      id: skill?.id,
      name: form.name.trim(),
      emoji: form.emoji,
      description: form.description,
      systemPrompt: form.systemPrompt,
      greeting: form.greeting || undefined,
      defaultModelId: form.defaultModelId || undefined,
      visibility: form.shareToMarket
        ? skill?.visibility === "public"
          ? "public"
          : "pending"
        : "private",
    });
    toast.success(skill ? "技能已更新" : "技能已创建");
    onSaved();
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
