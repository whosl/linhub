import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProject,
  patchProject,
  projectKey,
  projectsKey,
  type Project,
} from "@/api/projects";
import { Button } from "@/components/ui/Button";
import { PageLoading } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/toast";
import { ProjectConversationsTab } from "./ProjectConversationsTab";
import { ProjectFilesTab } from "./ProjectFilesTab";
import { ProjectSettingsTab } from "./ProjectSettingsTab";

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("conversations");

  const {
    data: project,
    isLoading,
    isError,
  } = useQuery({
    queryKey: projectKey(id),
    queryFn: () => getProject(id),
    enabled: Boolean(id),
  });

  /** 页头内联改名:乐观更新,失败回滚 */
  const rename = useMutation({
    mutationFn: (name: string) => patchProject(id, { name }),
    onMutate: async (name) => {
      await qc.cancelQueries({ queryKey: projectKey(id) });
      const previous = qc.getQueryData<Project>(projectKey(id));
      qc.setQueryData<Project>(projectKey(id), (old) =>
        old ? { ...old, name } : old,
      );
      return { previous };
    },
    onError: (_err, _name, context) => {
      if (context?.previous) {
        qc.setQueryData(projectKey(id), context.previous);
      }
      toast.error("重命名失败,请重试");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: projectKey(id) });
      void qc.invalidateQueries({ queryKey: projectsKey });
    },
  });

  if (isLoading) {
    return <PageLoading />;
  }

  if (isError || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-text-2">项目不存在或已被删除</p>
        <Button variant="outline" onClick={() => navigate("/projects")}>
          返回项目列表
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto px-6 py-8">
      <ProjectHeader
        project={project}
        onBack={() => navigate("/projects")}
        onRename={(name) => rename.mutate(name)}
      />
      <Tabs
        tabs={[
          { value: "conversations", label: "对话" },
          { value: "files", label: "文件与知识库" },
          { value: "settings", label: "设置" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "conversations" && <ProjectConversationsTab projectId={project.id} />}
      {tab === "files" && <ProjectFilesTab project={project} />}
      {tab === "settings" && <ProjectSettingsTab key={project.id} project={project} />}
    </div>
  );
}

function ProjectHeader({
  project,
  onBack,
  onRename,
}: {
  project: Project;
  onBack: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== project.name) {
      onRename(name);
    } else {
      setDraft(project.name);
    }
  };

  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="返回项目列表">
          ← 返回
        </Button>
        <span
          className="size-3.5 shrink-0 rounded-full"
          style={{ backgroundColor: project.color ?? "var(--color-primary)" }}
          aria-hidden
        />
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(project.name);
                setEditing(false);
              }
            }}
            autoFocus
            maxLength={50}
            className="h-8 min-w-0 flex-1 rounded-md border border-primary bg-surface px-2 text-lg font-semibold text-text focus-visible:outline-none"
          />
        ) : (
          <h1
            className="min-w-0 flex-1 cursor-text truncate text-lg font-semibold text-text"
            title="点击修改名称"
            onClick={() => {
              setDraft(project.name);
              setEditing(true);
            }}
          >
            {project.name}
          </h1>
        )}
      </div>
      {project.description && (
        <p className="pl-[4.75rem] text-sm text-text-2">{project.description}</p>
      )}
    </header>
  );
}
