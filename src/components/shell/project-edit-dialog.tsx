"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenIcon,
  FileIcon,
  Loader2Icon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUiStore } from "@/stores/ui-store";
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

/** 项目编辑弹窗：从侧边栏 ⋯ 菜单打开，含改名/改色/指令/模型/文件管理 */
export function ProjectEditDialog() {
  const { editingProjectId, setEditingProjectId } = useUiStore();
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState("#C96442");
  const [instructions, setInstructions] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [mirrorKnowledgeBaseId, setMirrorKnowledgeBaseId] = React.useState("");
  const [savingKnowledgeBaseId, setSavingKnowledgeBaseId] =
    React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const initializedProjectId = React.useRef<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const uploadInFlightRef = React.useRef(false);

  const { data: project } = useQuery({
    queryKey: ["project", editingProjectId],
    queryFn: () => getDataService().getProject(editingProjectId!),
    enabled: !!editingProjectId,
  });
  const { data: modelsData } = useQuery({
    queryKey: ["models"],
    queryFn: () => getDataService().listModelsWithDefault(),
    enabled: !!editingProjectId,
  });
  const { data: knowledgeBases = [] } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => getDataService().listKnowledgeBases(),
    enabled: !!editingProjectId,
  });
  const models = modelsData?.models ?? [];

  // 只在打开项目时初始化表单，避免文件/模型 refetch 覆盖用户未保存草稿。
  React.useEffect(() => {
    if (!editingProjectId) {
      initializedProjectId.current = null;
      return;
    }
    if (project && initializedProjectId.current !== project.id) {
      setName(project.name);
      setDescription(project.description ?? "");
      setColor(project.color ?? "#C96442");
      setInstructions(project.instructions ?? "");
      initializedProjectId.current = project.id;
    }
  }, [editingProjectId, project]);

  const save = async () => {
    if (!project || !name.trim()) return;
    const saved = await getDataService().updateProject(project.id, {
      name: name.trim(),
      description: description.trim() || null,
      color,
      instructions,
    });
    queryClient.setQueryData(["project", project.id], saved);
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    toast.success("项目已保存");
  };

  const saveModel = async (modelId: string) => {
    if (!project) return;
    const saved = await getDataService().updateProject(project.id, { modelId: modelId || null });
    queryClient.setQueryData(["project", project.id], saved);
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    toast.success("默认模型已更新");
  };

  const toggleKnowledgeBase = async (knowledgeBaseId: string, checked: boolean) => {
    if (!project || savingKnowledgeBaseId) return;
    const currentIds = project.knowledgeBaseIds ?? [];
    const nextIds = checked
      ? Array.from(new Set([...currentIds, knowledgeBaseId]))
      : currentIds.filter((id) => id !== knowledgeBaseId);
    setSavingKnowledgeBaseId(knowledgeBaseId);
    try {
      const saved = await getDataService().updateProject(project.id, {
        knowledgeBaseIds: nextIds,
      });
      queryClient.setQueryData(["project", project.id], saved);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(checked ? "已关联知识库" : "已取消关联");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSavingKnowledgeBaseId(null);
    }
  };

  const requestDeleteFile = (file: { id: string; name: string }) => {
    setDeleteTarget({ type: "file", id: file.id, name: file.name });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const projectId = editingProjectId;
    if (!projectId || uploadInFlightRef.current) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    uploadInFlightRef.current = true;
    setUploading(true);
    let successCount = 0;
    let knowledgeSuccessCount = 0;
    const failures: string[] = [];
    const targetKnowledgeBaseId = mirrorKnowledgeBaseId;
    try {
      for (const file of list) {
        try {
          await getDataService().uploadProjectFile(projectId, file);
          successCount += 1;
          if (targetKnowledgeBaseId) {
            try {
              await getDataService().uploadDocument(targetKnowledgeBaseId, file);
              knowledgeSuccessCount += 1;
            } catch (e) {
              const message = e instanceof Error ? e.message : "加入知识库失败";
              failures.push(`${file.name}：项目已保存，加入知识库失败：${message}`);
            }
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : "上传失败";
          failures.push(`${file.name}：${message}`);
        }
      }
      if (
        targetKnowledgeBaseId &&
        knowledgeSuccessCount > 0 &&
        project &&
        !(project.knowledgeBaseIds ?? []).includes(targetKnowledgeBaseId)
      ) {
        const saved = await getDataService().updateProject(projectId, {
          knowledgeBaseIds: [
            ...(project.knowledgeBaseIds ?? []),
            targetKnowledgeBaseId,
          ],
        });
        queryClient.setQueryData(["project", projectId], saved);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        targetKnowledgeBaseId
          ? queryClient.invalidateQueries({
              queryKey: ["kb-documents", targetKnowledgeBaseId],
            })
          : Promise.resolve(),
        targetKnowledgeBaseId
          ? queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] })
          : Promise.resolve(),
      ]);
      if (failures.length === 0) {
        toast.success(
          targetKnowledgeBaseId
            ? successCount === 1
              ? "资料已加入项目和知识库"
              : `已加入 ${successCount} 个项目资料，并同步到知识库`
            : successCount === 1
              ? "资料已上传"
              : `已上传 ${successCount} 个资料`
        );
      } else if (successCount > 0) {
        toast.warning(`已上传 ${successCount} 个资料，${failures.length} 个失败`, {
          description: formatUploadFailures(failures),
        });
      } else {
        toast.error(`${failures.length} 个资料上传失败`, {
          description: formatUploadFailures(failures),
        });
      }
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  };

  const requestDeleteProject = () => {
    if (!project) return;
    setDeleteTarget({ type: "project", id: project.id, name: project.name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "file") {
        await getDataService().deleteProjectFile(deleteTarget.id);
        queryClient.invalidateQueries({ queryKey: ["project", editingProjectId] });
        toast.success("文件已删除");
      } else {
        await getDataService().deleteProject(deleteTarget.id);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.removeQueries({ queryKey: ["project", deleteTarget.id] });
        queryClient.removeQueries({ queryKey: ["project-conversations", deleteTarget.id] });
        setEditingProjectId(null);
        toast.success("项目已删除");
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const open = !!editingProjectId && !!project;
  const chatModels = models.filter((m) => !m.capabilities.includes("image-generation"));
  const mountedKnowledgeBaseIds = project?.knowledgeBaseIds ?? [];

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && setEditingProjectId(null)}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑项目</DialogTitle>
        </DialogHeader>

        {project && (
          <div className="space-y-4">
            {/* 名称 + 颜色 */}
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="size-10 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
              />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="项目名称"
                className="flex-1"
              />
            </div>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述（可选）"
            />

            {/* 默认模型 */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                默认模型
              </label>
              <Select
                value={project.modelId ?? ""}
                onValueChange={saveModel}
                options={[
                  { value: "", label: "跟随全局默认" },
                  ...chatModels.map((m) => ({ value: m.id, label: m.displayName })),
                ]}
              />
            </div>

            {/* 指令 */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                项目指令
              </label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
                placeholder="这个项目里的所有会话都会遵循这里的指令…"
              />
            </div>

            {/* 资料 */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  项目资料
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  accept=".pdf,.docx,.txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.java,.go,.rs,.c,.cpp,.h,.css,.sql,.sh,.rb,.php,.log"
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <UploadIcon className="size-3" />
                  )}
                  上传
                </button>
              </div>
              {knowledgeBases.length > 0 && (
                <Select
                  value={mirrorKnowledgeBaseId}
                  onValueChange={setMirrorKnowledgeBaseId}
                  className="mb-2"
                  options={[
                    { value: "", label: "只加入项目资料" },
                    ...knowledgeBases.map((kb) => ({
                      value: kb.id,
                      label: `同时加入知识库：${kb.name}`,
                    })),
                  ]}
                />
              )}
              <div className="space-y-1.5">
                {project.files.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无项目资料</p>
                ) : (
                  project.files.map((f) => (
                    <div
                      key={f.id}
                      className="group/file flex items-center gap-2 rounded-lg border px-3 py-2"
                    >
                      <FileIcon className="size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-xs">{f.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatBytes(f.size)}
                      </span>
                      <button
                        type="button"
                        aria-label={`删除文件「${f.name}」`}
                        onClick={() => requestDeleteFile(f)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover/file:opacity-100"
                      >
                        <Trash2Icon className="size-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  关联知识库
                </label>
                {mountedKnowledgeBaseIds.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    已关联 {mountedKnowledgeBaseIds.length} 个
                  </span>
                )}
              </div>
              {knowledgeBases.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无可关联知识库</p>
              ) : (
                <div className="space-y-1.5">
                  {knowledgeBases.map((kb) => {
                    const checked = mountedKnowledgeBaseIds.includes(kb.id);
                    const saving = savingKnowledgeBaseId === kb.id;
                    return (
                      <label
                        key={kb.id}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!!savingKnowledgeBaseId}
                          onChange={(event) =>
                            void toggleKnowledgeBase(kb.id, event.target.checked)
                          }
                          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                        />
                        <BookOpenIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {kb.name}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
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
            </div>

            {/* 底部操作 */}
            <div className="flex items-center justify-between border-t pt-3">
              <Button variant="ghost" size="sm" onClick={requestDeleteProject}>
                <Trash2Icon className="size-4" /> 删除项目
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingProjectId(null)}>
                  取消
                </Button>
                <Button size="sm" onClick={save} disabled={!name.trim()}>
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={!!deleteTarget}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !deleting) setDeleteTarget(null);
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
    </>
  );
}
