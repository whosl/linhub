import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteProject,
  patchProject,
  projectKey,
  projectsKey,
  type Project,
  type ProjectPatch,
} from "@/api/projects";
import { getModels } from "@/api/models";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { PROJECT_COLORS } from "./utils";

/** 项目详情 - 设置 Tab:指令 / 默认模型 / 基本信息编辑 + 删除项目 */
export function ProjectSettingsTab({ project }: { project: Project }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [color, setColor] = useState<string>(
    project.color ?? PROJECT_COLORS[0],
  );
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [modelId, setModelId] = useState(project.modelId ?? "");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: modelsData } = useQuery({
    queryKey: ["models"],
    queryFn: getModels,
  });
  const enabledModels = (modelsData?.models ?? []).filter((m) => m.enabled);

  /** 保存设置:乐观更新,失败回滚 */
  const save = useMutation({
    mutationFn: (patch: ProjectPatch) => patchProject(project.id, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: projectKey(project.id) });
      const previous = qc.getQueryData<Project>(projectKey(project.id));
      qc.setQueryData<Project>(projectKey(project.id), (old) =>
        old ? { ...old, ...patch } : old,
      );
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) {
        qc.setQueryData(projectKey(project.id), context.previous);
      }
      toast.error("保存失败,请重试");
    },
    onSuccess: () => {
      toast.success("设置已保存");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: projectKey(project.id) });
      void qc.invalidateQueries({ queryKey: projectsKey });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: () => {
      toast.success("项目已删除");
      void qc.invalidateQueries({ queryKey: projectsKey });
      navigate("/projects");
    },
    onError: () => {
      toast.error("删除项目失败,请重试");
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("请输入项目名称");
      return;
    }
    save.mutate({
      name: trimmedName,
      description: description.trim() || undefined,
      color,
      instructions: instructions.trim() || undefined,
      // 空串表示跟随全局默认,传 null 清除
      modelId: modelId || null,
    });
  };

  return (
    <section className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">项目指令</span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder="例如:回答时始终使用中文,并给出可执行的步骤。"
            className={cn(
              "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text",
              "placeholder:text-text-3",
              "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary",
            )}
          />
          <span className="text-xs text-text-3">
            将作为系统提示词注入该项目下的对话
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">默认模型</span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className={cn(
              "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text",
              "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary",
            )}
          >
            <option value="">跟随全局默认</option>
            {enabledModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-3">
            该项目下新对话默认使用的模型
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">名称</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">描述</span>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="这个项目是做什么的(可选)"
            maxLength={200}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">颜色</span>
          <div className="flex gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`选择颜色 ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  "size-7 rounded-full transition-transform",
                  color === c
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                    : "hover:scale-110",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "保存中…" : "保存"}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3 rounded-xl border border-danger/40 p-4">
        <h3 className="text-sm font-semibold text-danger">危险操作</h3>
        <p className="text-sm text-text-2">
          删除项目后,项目下的对话不会被删除,只会解除与项目的关联。
        </p>
        <div>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            删除项目
          </Button>
        </div>
      </div>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除项目"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={remove.isPending}
            >
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending ? "删除中…" : "确认删除"}
            </Button>
          </>
        }
      >
        确定要删除项目「{project.name}」吗?对话不会被删除,只会解除关联。此操作不可撤销。
      </Dialog>
    </section>
  );
}
