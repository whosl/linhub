"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
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

/** 项目编辑弹窗：从侧边栏 ⋯ 菜单打开，含改名/改色/指令/模型/文件管理 */
export function ProjectEditDialog() {
  const { editingProjectId, setEditingProjectId } = useUiStore();
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState("#C96442");
  const [instructions, setInstructions] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const initializedProjectId = React.useRef<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  const requestDeleteFile = (file: { id: string; name: string }) => {
    setDeleteTarget({ type: "file", id: file.id, name: file.name });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!editingProjectId) return;
    const list = Array.from(files);
    if (list.length === 0 || uploading) return;
    setUploading(true);
    try {
      for (const file of list) {
        await getDataService().uploadProjectFile(editingProjectId, file);
      }
      queryClient.invalidateQueries({ queryKey: ["project", editingProjectId] });
      toast.success(list.length === 1 ? "文件已上传" : `已上传 ${list.length} 个文件`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
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

            {/* 文件 */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  项目文件
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
              <div className="space-y-1.5">
                {project.files.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无文件</p>
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
