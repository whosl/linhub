"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  FileIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
  PencilIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { Card, EmptyState, Separator } from "@/components/ui/misc";
import { PageContainer } from "@/components/shell/page-header";
import { toast } from "sonner";

type DeleteTarget =
  | { type: "file"; id: string; name: string }
  | { type: "project"; id: string; name: string };

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editingInstructions, setEditingInstructions] = React.useState(false);
  const [instructions, setInstructions] = React.useState("");
  const [editingMeta, setEditingMeta] = React.useState(false);
  const [metaForm, setMetaForm] = React.useState({ name: "", description: "", color: "#C96442" });
  const [uploading, setUploading] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getDataService().getProject(id),
  });
  const { data: conversations = [] } = useQuery({
    queryKey: ["project-conversations", id],
    queryFn: () => getDataService().listProjectConversations(id),
  });
  const { data: modelsData } = useQuery({
    queryKey: ["models"],
    queryFn: () => getDataService().listModelsWithDefault(),
  });
  const models = modelsData?.models ?? [];

  if (!project) return null;

  const saveInstructions = async () => {
    const saved = await getDataService().updateProject(id, { instructions });
    queryClient.setQueryData(["project", id], saved);
    setEditingInstructions(false);
    toast.success("项目指令已更新");
  };

  const saveMeta = async () => {
    if (!metaForm.name.trim()) return;
    const saved = await getDataService().updateProject(id, {
      name: metaForm.name.trim(),
      description: metaForm.description.trim() || null,
      color: metaForm.color,
    });
    queryClient.setQueryData(["project", id], saved);
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    setEditingMeta(false);
    toast.success("项目信息已更新");
  };

  const saveModel = async (modelId: string) => {
    const saved = await getDataService().updateProject(id, { modelId: modelId || null });
    queryClient.setQueryData(["project", id], saved);
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    toast.success("默认模型已更新");
  };

  const requestDeleteFile = (file: { id: string; name: string }) => {
    setDeleteTarget({ type: "file", id: file.id, name: file.name });
  };

  const requestDeleteProject = () => {
    setDeleteTarget({ type: "project", id, name: project.name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "file") {
        await getDataService().deleteProjectFile(deleteTarget.id);
        queryClient.invalidateQueries({ queryKey: ["project", id] });
        toast.success("文件已删除");
      } else {
        await getDataService().deleteProject(deleteTarget.id);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.removeQueries({ queryKey: ["project", id] });
        queryClient.removeQueries({ queryKey: ["project-conversations", id] });
        toast.success("项目已删除");
        router.push("/projects");
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0 || uploading) return;
    setUploading(true);
    try {
      for (const file of list) {
        await getDataService().uploadProjectFile(id, file);
      }
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(list.length === 1 ? "项目文件已上传" : `已上传 ${list.length} 个文件`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const chatModels = models.filter((m) => !m.capabilities.includes("image-generation"));

  return (
    <PageContainer wide>
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> 全部项目
      </Link>

      {/* 标题区：可编辑 */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 animate-fade-up">
        <div className="flex items-center gap-3">
          {editingMeta ? (
            <input
              type="color"
              value={metaForm.color}
              onChange={(e) => setMetaForm({ ...metaForm, color: e.target.value })}
              className="size-11 shrink-0 cursor-pointer rounded-xl border-0 bg-transparent p-0"
            />
          ) : (
            <span
              className="flex size-11 items-center justify-center rounded-xl font-serif text-lg text-white"
              style={{ backgroundColor: project.color ?? "#C96442" }}
            >
              {project.name.slice(0, 1)}
            </span>
          )}
          <div className="flex-1">
            {editingMeta ? (
              <div className="space-y-2">
                <Input
                  value={metaForm.name}
                  onChange={(e) => setMetaForm({ ...metaForm, name: e.target.value })}
                  placeholder="项目名称"
                  className="text-lg"
                />
                <Input
                  value={metaForm.description}
                  onChange={(e) => setMetaForm({ ...metaForm, description: e.target.value })}
                  placeholder="描述（可选）"
                />
              </div>
            ) : (
              <>
                <h1 className="font-serif text-2xl">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-muted-foreground">{project.description}</p>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editingMeta ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditingMeta(false)}>取消</Button>
              <Button size="sm" onClick={saveMeta} disabled={!metaForm.name.trim()}>保存</Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                aria-label="编辑项目信息"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMetaForm({
                    name: project.name,
                    description: project.description ?? "",
                    color: project.color ?? "#C96442",
                  });
                  setEditingMeta(true);
                }}
              >
                <PencilIcon className="size-4" /> 编辑
              </Button>
              <Button
                type="button"
                aria-label="删除项目"
                variant="outline"
                size="sm"
                onClick={requestDeleteProject}
              >
                <Trash2Icon /> 删除
              </Button>
              <Button size="sm" asChild>
                <Link href={`/?project=${id}`}>
                  <MessageSquarePlusIcon /> 新对话
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 会话列表 */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">会话</h2>
          {conversations.length === 0 ? (
            <EmptyState
              title="项目里还没有会话"
              description="从这个项目发起的会话会出现在这里，并自动携带项目文件与指令。"
            />
          ) : (
            <div className="space-y-2">
              {conversations.map((c) => (
                <Link key={c.id} href={`/chat/${c.id}`}>
                  <Card className="mb-2 flex items-center justify-between px-4 py-3 transition-colors hover:border-primary/40">
                    <span className="truncate text-sm font-medium">{c.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(c.updatedAt)}
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 右栏 */}
        <div className="space-y-6">
          {/* 默认模型 */}
          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">默认模型</h2>
            <Select
              value={project.modelId ?? ""}
              onValueChange={(v) => saveModel(v)}
              options={[
                { value: "", label: "跟随全局默认" },
                ...chatModels.map((m) => ({ value: m.id, label: m.displayName })),
              ]}
            />
          </div>

          <Separator />

          {/* 项目指令 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">项目指令</h2>
              {!editingInstructions && (
                <button
                  type="button"
                  aria-label="编辑项目指令"
                  onClick={() => { setInstructions(project.instructions ?? ""); setEditingInstructions(true); }}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <PencilIcon className="size-3" /> 编辑
                </button>
              )}
            </div>
            {editingInstructions ? (
              <div className="space-y-2">
                <Textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={5}
                  placeholder="这个项目里的所有会话都会遵循这里的指令…"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingInstructions(false)}>取消</Button>
                  <Button size="sm" onClick={saveInstructions}>保存</Button>
                </div>
              </div>
            ) : (
              <Card className="p-4 text-sm leading-relaxed text-muted-foreground">
                {project.instructions || "尚未设置。项目指令会注入到项目内每个会话的系统提示词。"}
              </Card>
            )}
          </div>

          <Separator />

          {/* 项目文件（可删除） */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">项目文件</h2>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept=".pdf,.docx,.txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.java,.go,.rs,.c,.cpp,.h,.css,.sql,.sh,.rb,.php,.log,.png,.jpg,.jpeg,.gif,.webp"
                onChange={(e) => { if (e.target.files?.length) void uploadFiles(e.target.files); e.target.value = ""; }}
              />
              <button
                type="button"
                aria-label="上传项目文件"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:pointer-events-none disabled:opacity-60"
              >
                {uploading ? <Loader2Icon className="size-3 animate-spin" /> : <UploadIcon className="size-3" />}
                {uploading ? "上传中" : "上传"}
              </button>
            </div>
            <div className="space-y-2">
              {project.files.length === 0 ? (
                <p className="text-xs text-muted-foreground">上传的文件会作为项目内所有会话的共享上下文。</p>
              ) : (
                project.files.map((f) => (
                  <Card key={f.id} className="group/file flex items-center gap-2.5 px-3.5 py-2.5">
                    <FileIcon className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{f.name}</span>
                      <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => requestDeleteFile(f)}
                      aria-label={`删除文件「${f.name}」`}
                      className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover/file:opacity-100"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title={deleteTarget?.type === "project" ? "删除项目" : "删除文件"}
        description={
          deleteTarget?.type === "project"
            ? `确定删除项目「${deleteTarget.name}」？项目里的会话不会被删除。`
            : deleteTarget
              ? `确定删除文件「${deleteTarget.name}」？删除后无法撤销。`
              : "确定删除这个文件？删除后无法撤销。"
        }
        confirmLabel="删除"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </PageContainer>
  );
}
