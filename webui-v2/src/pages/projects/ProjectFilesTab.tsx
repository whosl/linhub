import { useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAttachment,
  listKnowledgeBases,
  knowledgeListKey,
  patchProject,
  projectKey,
  projectsKey,
  type Project,
  type ProjectPatch,
} from "@/api/projects";
import { uploadFile } from "@/api/upload";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatFileSize, formatRelativeTime } from "./utils";

/** 项目详情 - 文件与知识库 Tab */
export function ProjectFilesTab({ project }: { project: Project }) {
  return (
    <section className="flex flex-col gap-8">
      <FilesSection project={project} />
      <KnowledgeSection project={project} />
    </section>
  );
}

/* ---------------- 文件区 ---------------- */

function FilesSection({ project }: { project: Project }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const files = project.files ?? [];

  /** 多文件上传:逐个走 uploadFile,结束后统一刷新项目 */
  const handlePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setUploading(true);
    let failed = 0;
    for (const file of picked) {
      try {
        await uploadFile(file, project.id);
      } catch {
        failed += 1;
      }
    }
    setUploading(false);
    if (failed > 0) {
      toast.error(`${failed} 个文件上传失败`);
    } else {
      toast.success("上传完成");
    }
    void qc.invalidateQueries({ queryKey: projectKey(project.id) });
    void qc.invalidateQueries({ queryKey: projectsKey });
  };

  /** 删除文件:乐观从列表移除,失败回滚 */
  const remove = useMutation({
    mutationFn: (fileId: string) => deleteAttachment(fileId),
    onMutate: async (fileId) => {
      await qc.cancelQueries({ queryKey: projectKey(project.id) });
      const previous = qc.getQueryData<Project>(projectKey(project.id));
      qc.setQueryData<Project>(projectKey(project.id), (old) =>
        old
          ? { ...old, files: (old.files ?? []).filter((f) => f.id !== fileId) }
          : old,
      );
      return { previous };
    },
    onError: (_err, _fileId, context) => {
      if (context?.previous) {
        qc.setQueryData(projectKey(project.id), context.previous);
      }
      toast.error("删除文件失败,请重试");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: projectKey(project.id) });
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">项目文件</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Spinner className="size-3.5" /> 上传中…
            </>
          ) : (
            "上传文件"
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => void handlePick(e)}
        />
      </div>

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-text-3">
          暂无文件,上传后可在该项目对话中引用
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-text">
                {file.name}
              </span>
              <span className="shrink-0 text-xs text-text-3">
                {formatFileSize(file.size)}
              </span>
              <span className="shrink-0 text-xs text-text-3">
                {formatRelativeTime(file.createdAt)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(file.id)}
              >
                删除
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- 知识库区 ---------------- */

function KnowledgeSection({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const { data: knowledgeBases, isLoading } = useQuery({
    queryKey: knowledgeListKey,
    queryFn: listKnowledgeBases,
  });

  const linkedIds = project.knowledgeBaseIds ?? [];

  /** 勾选关联:乐观改 knowledgeBaseIds,失败回滚 */
  const toggle = useMutation({
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
      toast.error("更新知识库关联失败,请重试");
    },
    onSettled: () => {
      setPendingIds([]);
      void qc.invalidateQueries({ queryKey: projectKey(project.id) });
      void qc.invalidateQueries({ queryKey: projectsKey });
    },
  });

  const handleToggle = (kbId: string) => {
    const next = linkedIds.includes(kbId)
      ? linkedIds.filter((id) => id !== kbId)
      : [...linkedIds, kbId];
    setPendingIds((ids) => [...ids, kbId]);
    toggle.mutate({ knowledgeBaseIds: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text">关联知识库</h3>
      {isLoading ? (
        <div className="flex justify-center py-6 text-text-2">
          <Spinner className="size-5" />
        </div>
      ) : !knowledgeBases || knowledgeBases.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-text-3">
          还没有知识库,可先到「知识库」页面创建
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {knowledgeBases.map((kb) => {
            const checked = linkedIds.includes(kb.id);
            return (
              <li key={kb.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                    checked
                      ? "border-primary/50 bg-primary-soft/40"
                      : "border-border bg-surface hover:bg-surface-2",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={pendingIds.includes(kb.id)}
                    onChange={() => handleToggle(kb.id)}
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">
                      {kb.name}
                    </span>
                    {kb.description && (
                      <span className="block truncate text-xs text-text-3">
                        {kb.description}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-text-3">
                    {kb.documentCount} 个文档 · {kb.totalChunks} 个分块
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
