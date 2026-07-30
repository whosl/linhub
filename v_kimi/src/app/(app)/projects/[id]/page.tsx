"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  CheckIcon,
  FileIcon,
  FolderIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
  PencilIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import { clientRandomUUID } from "@/lib/client-id";
import { FILE_ACCEPT } from "@/lib/file-types";
import type { Conversation, Project, ProjectFile } from "@/lib/types";
import {
  optimisticPatchRecords,
  optimisticRemoveRecord,
} from "@/lib/optimistic-query";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Textarea } from "@/components/ui/input";
import {
  Badge,
  EmptyState,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/misc";
import { PageContainer } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type DeleteTarget =
  | { type: "file"; id: string; name: string }
  | { type: "project"; id: string; name: string };

function formatUploadFailures(failures: string[]) {
  const visible = failures.slice(0, 3).join("\n");
  return failures.length > 3
    ? `${visible}\n另有 ${failures.length - 3} 个失败`
    : visible;
}

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
  const [savingKnowledgeBaseId, setSavingKnowledgeBaseId] =
    React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const uploadInFlightRef = React.useRef(false);

  const { data: project, isLoading: projectLoading } = useQuery({
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
  const { data: knowledgeBases = [] } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => getDataService().listKnowledgeBases(),
    enabled: !!project,
  });
  const models = modelsData?.models ?? [];

  if (projectLoading) {
    return (
      <PageContainer wide>
        {/* 骨架加载态 */}
        <div className="space-y-4 animate-fade-up">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
          </div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </PageContainer>
    );
  }

  if (!project) {
    return (
      <PageContainer wide>
        <Link
          href="/projects"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" /> 全部项目
        </Link>
        <EmptyState
          icon={<FolderIcon />}
          title="项目不可用"
          description="这个项目可能已被删除，或当前账号没有访问权限。"
          action={
            <Button asChild>
              <Link href="/projects">返回项目</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const saveInstructions = async () => {
    setEditingInstructions(false);
    const optimistic = optimisticPatchRecords<Project>(
      queryClient,
      [["project", id], ["projects"]],
      id,
      { instructions }
    );
    try {
      const saved = await getDataService().updateProject(id, { instructions });
      optimistic.reconcile(saved);
      toast.success("项目指令已更新");
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "项目指令更新失败");
    }
  };

  const saveMeta = async () => {
    if (!metaForm.name.trim()) return;
    const patch = {
      name: metaForm.name.trim(),
      description: metaForm.description.trim() || null,
      color: metaForm.color,
    };
    const optimistic = optimisticPatchRecords<Project>(
      queryClient,
      [["project", id], ["projects"]],
      id,
      {
        name: patch.name,
        description: patch.description ?? undefined,
        color: patch.color,
      }
    );
    setEditingMeta(false);
    try {
      const saved = await getDataService().updateProject(id, patch);
      optimistic.reconcile(saved);
      toast.success("项目信息已更新");
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "项目信息更新失败");
    }
  };

  const saveModel = async (modelId: string) => {
    const nextModelId = modelId || undefined;
    const optimistic = optimisticPatchRecords<Project>(
      queryClient,
      [["project", id], ["projects"]],
      id,
      { modelId: nextModelId }
    );
    try {
      const saved = await getDataService().updateProject(id, {
        modelId: modelId || null,
      });
      optimistic.reconcile(saved);
      toast.success("默认模型已更新");
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "默认模型更新失败");
    }
  };

  const toggleKnowledgeBase = async (knowledgeBaseId: string, checked: boolean) => {
    if (savingKnowledgeBaseId) return;
    const currentIds = project.knowledgeBaseIds ?? [];
    const nextIds = checked
      ? Array.from(new Set([...currentIds, knowledgeBaseId]))
      : currentIds.filter((kbId) => kbId !== knowledgeBaseId);
    setSavingKnowledgeBaseId(knowledgeBaseId);
    const optimistic = optimisticPatchRecords<Project>(
      queryClient,
      [["project", id], ["projects"]],
      id,
      { knowledgeBaseIds: nextIds }
    );
    try {
      const saved = await getDataService().updateProject(id, {
        knowledgeBaseIds: nextIds,
      });
      optimistic.reconcile(saved);
      toast.success(checked ? "已关联知识库" : "已取消关联");
    } catch (e) {
      optimistic.rollback();
      toast.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSavingKnowledgeBaseId(null);
    }
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
    if (deleteTarget.type === "file") {
      const target = project.files.find((file) => file.id === deleteTarget.id);
      const index = project.files.findIndex((file) => file.id === deleteTarget.id);
      const optimistic = optimisticPatchRecords<Project>(
        queryClient,
        [["project", id], ["projects"]],
        id,
        { files: project.files.filter((file) => file.id !== deleteTarget.id) }
      );
      setDeleteTarget(null);
      try {
        await getDataService().deleteProjectFile(deleteTarget.id);
        toast.success("文件已删除");
      } catch (error) {
        optimistic.rollback();
        if (target) {
          queryClient.setQueryData<Project | null>(["project", id], (current) => {
            if (!current || current.files.some((file) => file.id === target.id)) return current;
            const files = [...current.files];
            files.splice(Math.max(0, index), 0, target);
            return { ...current, files };
          });
        }
        toast.error(error instanceof Error ? error.message : "文件删除失败");
      } finally {
        setDeleting(false);
      }
      return;
    }

    const removedProject = optimisticRemoveRecord<Project>(
      queryClient,
      [["projects"]],
      deleteTarget.id
    );
    const affectedConversations = queryClient
      .getQueriesData<Conversation[]>({ queryKey: ["conversations"] })
      .map(([key, value]) => [key, value] as const);
    for (const [key] of affectedConversations) {
      queryClient.setQueryData<Conversation[]>(key, (current) =>
        current?.map((conversation) =>
          conversation.projectId === deleteTarget.id
            ? { ...conversation, projectId: undefined }
            : conversation
        )
      );
    }
    setDeleteTarget(null);
    router.push("/projects");
    try {
        await getDataService().deleteProject(deleteTarget.id);
        queryClient.removeQueries({ queryKey: ["project", id] });
        queryClient.removeQueries({ queryKey: ["project-conversations", id] });
        toast.success("项目已删除");
    } catch (error) {
      removedProject.rollback();
      for (const [key, value] of affectedConversations) {
        queryClient.setQueryData(key, value);
      }
      router.push(`/projects/${id}`);
      toast.error(error instanceof Error ? error.message : "项目删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (uploadInFlightRef.current) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    uploadInFlightRef.current = true;
    setUploading(true);
    let successCount = 0;
    const failures: string[] = [];
    const temporaryFiles: ProjectFile[] = list.map((file) => ({
      id: `optimistic-project-file-${clientRandomUUID()}`,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      createdAt: new Date().toISOString(),
      clientMutationState: "pending",
    }));
    const appendTemporaryFiles = (current: Project | null | undefined) =>
      current
        ? {
            ...current,
            files: [
              ...current.files.filter(
                (existing) => !temporaryFiles.some((item) => item.id === existing.id)
              ),
              ...temporaryFiles,
            ],
          }
        : current;
    queryClient.setQueryData<Project | null>(["project", id], appendTemporaryFiles);
    try {
      for (const [index, file] of list.entries()) {
        const temporary = temporaryFiles[index];
        try {
          const saved = await getDataService().uploadProjectFile(id, file);
          queryClient.setQueryData<Project | null>(["project", id], (current) =>
            current
              ? {
                  ...current,
                  files: current.files.map((item) =>
                    item.id === temporary.id ? saved : item
                  ),
                }
              : current
          );
          successCount += 1;
        } catch (e) {
          const message = e instanceof Error ? e.message : "上传失败";
          failures.push(`${file.name}：${message}`);
          queryClient.setQueryData<Project | null>(["project", id], (current) =>
            current
              ? {
                  ...current,
                  files: current.files.map((item) =>
                    item.id === temporary.id
                      ? {
                          ...item,
                          clientMutationState: "failed",
                          clientMutationError: message,
                        }
                      : item
                  ),
                }
              : current
          );
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", id] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      if (failures.length === 0) {
        toast.success(
          successCount === 1 ? "项目文件已上传" : `已上传 ${successCount} 个文件`
        );
      } else if (successCount > 0) {
        toast.warning(`已上传 ${successCount} 个文件，${failures.length} 个失败`, {
          description: formatUploadFailures(failures),
        });
      } else {
        toast.error(`${failures.length} 个文件上传失败`, {
          description: formatUploadFailures(failures),
        });
      }
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  };

  const chatModels = models.filter((m) => !m.capabilities.includes("image-generation"));
  const mountedKnowledgeBaseIds = project.knowledgeBaseIds ?? [];

  return (
    <Tabs
      defaultValue="conversations"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    >
      <header className="shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" /> 全部项目
          </Link>

          <div className="mt-3 flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {editingMeta ? (
                <input
                  type="color"
                  aria-label="项目颜色"
                  value={metaForm.color}
                  onChange={(e) =>
                    setMetaForm({ ...metaForm, color: e.target.value })
                  }
                  className="size-12 shrink-0 cursor-pointer rounded-xl border-0 bg-transparent p-0"
                />
              ) : (
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl font-serif text-lg text-white shadow-md"
                  style={{ backgroundColor: project.color ?? "#C96442" }}
                >
                  {project.name.slice(0, 1)}
                </span>
              )}

              <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-center">
                {editingMeta ? (
                  <div className="max-w-xl space-y-2">
                    <Input
                      value={metaForm.name}
                      onChange={(e) =>
                        setMetaForm({ ...metaForm, name: e.target.value })
                      }
                      placeholder="项目名称"
                      className="text-lg"
                    />
                    <Input
                      value={metaForm.description}
                      onChange={(e) =>
                        setMetaForm({
                          ...metaForm,
                          description: e.target.value,
                        })
                      }
                      placeholder="描述（可选）"
                    />
                  </div>
                ) : (
                  <>
                    <h1 className="truncate font-serif text-[1.45rem] leading-none text-foreground sm:text-[1.55rem]">
                      {project.name}
                    </h1>
                    {project.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {project.description}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[11px] leading-none"
                      >
                        <FileIcon className="size-3" />
                        {project.files.length} 个项目文件
                      </Badge>
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[11px] leading-none"
                      >
                        <BookOpenIcon className="size-3" />
                        {mountedKnowledgeBaseIds.length} 个关联知识库
                      </Badge>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {editingMeta ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingMeta(false)}
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    className="btn-brand"
                    onClick={saveMeta}
                    disabled={!metaForm.name.trim()}
                  >
                    保存
                  </Button>
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
                </>
              )}
            </div>
          </div>

          <TabsList className="mb-3">
            <TabsTrigger value="conversations">对话</TabsTrigger>
            <TabsTrigger value="files">项目文件</TabsTrigger>
            <TabsTrigger value="settings">项目设置</TabsTrigger>
          </TabsList>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-5 pb-16 sm:px-6">
          <TabsContent value="conversations" className="mt-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-muted-foreground">
                  全部对话
                </h2>
                <span className="text-xs text-muted-foreground">
                  {conversations.length} 个
                </span>
              </div>
              <Button size="sm" className="btn-brand" asChild>
                <Link href={`/?project=${id}`}>
                  <MessageSquarePlusIcon /> 新对话
                </Link>
              </Button>
            </div>
            {conversations.length === 0 ? (
              <EmptyState
                title="项目里还没有会话"
                description="从这个项目发起的会话会出现在这里，并自动携带项目文件、关联知识库与指令。"
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-card)]">
                {conversations.map((c) => (
                  <Link
                    key={c.id}
                    href={`/chat/${c.id}`}
                    className="flex items-center justify-between gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/60"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {c.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(c.updatedAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="files" className="mt-0">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium">关联知识库</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      已关联 {mountedKnowledgeBaseIds.length} 个
                    </p>
                  </div>
                </div>
                {knowledgeBases.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    暂无可关联知识库。长期复用的资料可以先放进知识库，再挂载到项目。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {knowledgeBases.map((kb) => {
                      const checked = mountedKnowledgeBaseIds.includes(kb.id);
                      const saving = savingKnowledgeBaseId === kb.id;
                      return (
                        <label
                          key={kb.id}
                          className="flex cursor-pointer items-start gap-2 rounded-xl border bg-background px-3 py-2 text-sm transition-all hover:border-primary/40 hover:bg-accent"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!!savingKnowledgeBaseId}
                            onChange={(event) =>
                              void toggleKnowledgeBase(
                                kb.id,
                                event.target.checked
                              )
                            }
                            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                          />
                          <BookOpenIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="block min-w-0 flex-1 truncate">
                                {kb.name}
                              </span>
                              {checked && (
                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                  <CheckIcon className="size-3" />
                                  已挂载
                                </span>
                              )}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {kb.documentCount} 个文档 · {kb.totalChunks} 个片段
                            </span>
                          </span>
                          {saving && (
                            <Loader2Icon className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium">项目文件</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {project.files.length} 个文件
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    accept={FILE_ACCEPT}
                    onChange={(e) => {
                      if (e.target.files?.length) void uploadFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    aria-label="上传项目文件"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <UploadIcon className="size-3.5" />
                    )}
                    {uploading ? "上传中" : "上传"}
                  </Button>
                </div>
                {project.files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    上传的文件会作为项目内所有会话的共享上下文。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {project.files.map((f) => (
                      <div
                        key={f.id}
                        className="group/file flex items-center gap-2.5 rounded-xl border bg-background px-3.5 py-2.5 transition-colors hover:border-primary/30"
                      >
                        <FileIcon className="size-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {f.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatBytes(f.size)}
                            {f.clientMutationState === "pending" && " · 上传中…"}
                            {f.clientMutationState === "failed" &&
                              ` · 上传失败${f.clientMutationError ? `：${f.clientMutationError}` : ""}`}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            f.clientMutationState
                              ? queryClient.setQueryData<Project | null>(
                                  ["project", id],
                                  (current) =>
                                    current
                                      ? {
                                          ...current,
                                          files: current.files.filter(
                                            (item) => item.id !== f.id
                                          ),
                                        }
                                      : current
                                )
                              : requestDeleteFile(f)
                          }
                          aria-label={`删除文件「${f.name}」`}
                          className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover/file:opacity-100"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <div className="mx-auto max-w-3xl space-y-5">
              <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]">
                <h2 className="mb-2 text-sm font-medium">默认模型</h2>
                <Select
                  value={project.modelId ?? ""}
                  onValueChange={(v) => saveModel(v)}
                  options={[
                    { value: "", label: "跟随全局默认" },
                    ...chatModels.map((m) => ({
                      value: m.id,
                      label: m.displayName,
                    })),
                  ]}
                />
              </section>

              <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium">项目指令</h2>
                  {!editingInstructions && (
                    <Button
                      type="button"
                      aria-label="编辑项目指令"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setInstructions(project.instructions ?? "");
                        setEditingInstructions(true);
                      }}
                    >
                      <PencilIcon className="size-3.5" /> 编辑
                    </Button>
                  )}
                </div>
                {editingInstructions ? (
                  <div className="space-y-2">
                    <Textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      rows={6}
                      placeholder="这个项目里的所有会话都会遵循这里的指令…"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingInstructions(false)}
                      >
                        取消
                      </Button>
                      <Button size="sm" className="btn-brand" onClick={saveInstructions}>
                        保存
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border bg-background px-3 py-3 text-sm leading-relaxed text-muted-foreground">
                    {project.instructions ||
                      "尚未设置。项目指令会注入到项目内每个会话的系统提示词。"}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 shadow-[var(--shadow-card)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-medium text-destructive">
                      删除项目
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      删除后会移除项目资料与设置，项目里的会话不会被删除。
                    </p>
                  </div>
                  <Button
                    type="button"
                    aria-label="删除项目"
                    variant="destructive"
                    size="sm"
                    onClick={requestDeleteProject}
                  >
                    <Trash2Icon /> 删除项目
                  </Button>
                </div>
              </section>
            </div>
          </TabsContent>
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
    </Tabs>
  );
}
