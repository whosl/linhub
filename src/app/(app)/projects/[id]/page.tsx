"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  FileIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, EmptyState, Separator } from "@/components/ui/misc";
import { PageContainer } from "@/components/shell/page-header";
import { toast } from "sonner";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editingInstructions, setEditingInstructions] = React.useState(false);
  const [instructions, setInstructions] = React.useState("");

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getDataService().getProject(id),
  });
  const { data: conversations = [] } = useQuery({
    queryKey: ["project-conversations", id],
    queryFn: () => getDataService().listProjectConversations(id),
  });

  if (!project) return null;

  const saveInstructions = async () => {
    await getDataService().saveProject({ ...project, instructions });
    queryClient.invalidateQueries({ queryKey: ["project", id] });
    setEditingInstructions(false);
    toast.success("项目指令已更新");
  };

  const deleteProject = async () => {
    if (!window.confirm(`确定删除项目「${project.name}」？会话不会被删除。`)) return;
    await getDataService().deleteProject(id);
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    router.push("/projects");
  };

  return (
    <PageContainer wide>
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> 全部项目
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 animate-fade-up">
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 items-center justify-center rounded-xl font-serif text-lg text-white"
            style={{ backgroundColor: project.color ?? "#C96442" }}
          >
            {project.name.slice(0, 1)}
          </span>
          <div>
            <h1 className="font-serif text-2xl">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={deleteProject}>
            <Trash2Icon /> 删除项目
          </Button>
          <Button size="sm" asChild>
            <Link href={`/?project=${id}`}>
              <MessageSquarePlusIcon /> 在项目中新对话
            </Link>
          </Button>
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

        {/* 右栏：指令与文件 */}
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">项目指令</h2>
              {!editingInstructions && (
                <button
                  onClick={() => {
                    setInstructions(project.instructions ?? "");
                    setEditingInstructions(true);
                  }}
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
                  <Button variant="ghost" size="sm" onClick={() => setEditingInstructions(false)}>
                    取消
                  </Button>
                  <Button size="sm" onClick={saveInstructions}>
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <Card className="p-4 text-sm leading-relaxed text-muted-foreground">
                {project.instructions || "尚未设置。项目指令会注入到项目内每个会话的系统提示词。"}
              </Card>
            )}
          </div>

          <Separator />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">项目文件</h2>
              <button
                onClick={() => toast.info("文件上传将在 P6 接入")}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <UploadIcon className="size-3" /> 上传
              </button>
            </div>
            <div className="space-y-2">
              {project.files.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  上传的文件会作为项目内所有会话的共享上下文。
                </p>
              ) : (
                project.files.map((f) => (
                  <Card key={f.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                    <FileIcon className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{f.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(f.size)}
                      </span>
                    </span>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
