import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProject,
  listProjects,
  projectsKey,
  type Project,
  type ProjectCreateInput,
} from "@/api/projects";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { PageLoading } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatRelativeTime, PROJECT_COLORS } from "./utils";

export function ProjectsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: projects,
    isLoading,
    isError,
  } = useQuery({ queryKey: projectsKey, queryFn: listProjects });

  const create = useMutation({
    mutationFn: (input: ProjectCreateInput) => createProject(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: projectsKey });
      const previous = qc.getQueryData<Project[]>(projectsKey);
      const now = new Date().toISOString();
      const optimistic: Project = {
        id: `tmp-${now}`,
        name: input.name,
        description: input.description,
        color: input.color,
        knowledgeBaseIds: [],
        knowledgeBases: [],
        createdAt: now,
        updatedAt: now,
        conversationCount: 0,
        files: [],
      };
      qc.setQueryData<Project[]>(projectsKey, (old) => [
        optimistic,
        ...(old ?? []),
      ]);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        qc.setQueryData(projectsKey, context.previous);
      }
      toast.error("创建项目失败,请重试");
    },
    onSuccess: () => {
      setCreateOpen(false);
      toast.success("项目已创建");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: projectsKey });
    },
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 overflow-y-auto px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">项目</h1>
        <Button onClick={() => setCreateOpen(true)}>新建项目</Button>
      </header>

      {isLoading ? (
        <PageLoading />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-20 text-sm text-text-2">
          <p>项目列表加载失败</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void qc.invalidateQueries({ queryKey: projectsKey })
            }
          >
            重试
          </Button>
        </div>
      ) : !projects || projects.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => navigate(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        pending={create.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(input) => create.mutate(input)}
      />
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: () => void;
}) {
  const color = project.color ?? "var(--color-primary)";
  const conversationCount = project.conversationCount ?? 0;
  const fileCount = project.files?.length ?? 0;
  const kbCount =
    project.knowledgeBaseIds?.length ?? project.knowledgeBases?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-left transition-colors hover:border-primary/50"
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="truncate text-sm font-semibold text-text group-hover:text-primary">
          {project.name}
        </h2>
        <p className="line-clamp-2 min-h-10 text-sm text-text-2">
          {project.description || "暂无描述"}
        </p>
        <p className="text-xs text-text-3">
          {conversationCount} 个会话 · {fileCount} 个文件 · {kbCount} 个知识库
        </p>
        <p className="text-xs text-text-3">
          更新于 {formatRelativeTime(project.updatedAt)}
        </p>
      </div>
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary-soft">
        <svg
          className="size-8 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        </svg>
      </div>
      <p className="text-sm text-text-2">还没有项目</p>
      <Button onClick={onCreate}>创建第一个项目</Button>
    </div>
  );
}

function CreateProjectDialog({
  open,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: ProjectCreateInput) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);

  const reset = () => {
    setName("");
    setDescription("");
    setColor(PROJECT_COLORS[0]);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("请输入项目名称");
      return;
    }
    onSubmit({
      name: trimmed,
      description: description.trim() || undefined,
      color,
    });
    reset();
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="新建项目"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button
            type="submit"
            form="create-project-form"
            disabled={pending || !name.trim()}
          >
            {pending ? "创建中…" : "创建"}
          </Button>
        </>
      }
    >
      <form
        id="create-project-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-text-2">
            名称 <span className="text-danger">*</span>
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如:产品调研"
            autoFocus
            maxLength={50}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-text-2">描述</span>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="这个项目是做什么的(可选)"
            maxLength={200}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-text-2">颜色</span>
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
      </form>
    </Dialog>
  );
}
