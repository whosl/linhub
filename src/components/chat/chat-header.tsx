"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MenuIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import type { Conversation, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  ConversationActionMenu,
  useConversationActions,
} from "@/components/shell/conversation-actions";
import { toast } from "sonner";

type ChatHeaderProps = {
  conversation?: Conversation | null;
  activeProject?: Project | null;
  pendingProject?: Project | null;
  onClearProject?: () => void;
};

function buildProjectChatHref(projectId: string) {
  const params = new URLSearchParams({ project: projectId });
  return `/?${params.toString()}`;
}

function ChatTitleBreadcrumb({
  conversation,
  project,
}: {
  conversation?: Conversation | null;
  project?: Project | null;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(conversation?.title ?? "");
  const [saving, setSaving] = React.useState(false);

  const saveTitle = React.useCallback(async () => {
    if (!conversation || saving) return;

    const title = draftTitle.trim();
    if (!title || title === conversation.title) {
      setDraftTitle(conversation.title);
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const saved = await getDataService().updateConversation(conversation.id, {
        title,
      });
      queryClient.setQueryData(["conversation", conversation.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({
        queryKey: ["conversation", conversation.id],
      });
      if (conversation.projectId) {
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
        void queryClient.invalidateQueries({
          queryKey: ["project", conversation.projectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["project-conversations", conversation.projectId],
        });
      }
      setEditing(false);
      toast.success("会话已重命名");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名失败");
    } finally {
      setSaving(false);
    }
  }, [conversation, draftTitle, queryClient, saving]);

  if (!conversation && !project) {
    return <div className="min-w-0 flex-1" />;
  }

  const title = conversation?.title ?? "新对话";
  const hasProject = !!project;

  return (
    <div className="pointer-events-auto flex h-9 min-w-0 flex-1 items-center gap-1.5 px-1 text-base sm:text-[17px]">
      {hasProject && (
        <>
          <Tooltip label="进入项目详情">
            <Link
              href={`/projects/${project.id}`}
              aria-label={`进入项目「${project.name}」`}
              className="min-w-0 max-w-[45%] shrink truncate rounded-md px-1 py-0.5 font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
            >
              {project.name}
            </Link>
          </Tooltip>
          <span className="shrink-0 text-muted-foreground">/</span>
        </>
      )}

      {conversation && editing ? (
        <input
          aria-label="重命名会话"
          value={draftTitle}
          disabled={saving}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraftTitle(conversation.title);
              setEditing(false);
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card/95 px-2 text-base font-medium shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60 sm:text-[17px]"
          autoFocus
        />
      ) : conversation ? (
        <button
          type="button"
          aria-label={`重命名会话「${title}」`}
          onClick={() => {
            setDraftTitle(title);
            setEditing(true);
          }}
          className={cn(
            "min-w-0 flex-1 truncate rounded-md px-1 py-0.5 text-left font-medium text-foreground transition-colors hover:bg-accent",
            !hasProject && "max-w-full"
          )}
        >
          {title}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate px-1 py-0.5 font-medium text-muted-foreground">
          新对话
        </span>
      )}
    </div>
  );
}

function SidebarToggleButton({
  sidebarCollapsed,
  toggleSidebar,
}: {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}) {
  if (!sidebarCollapsed) return null;

  return (
    <Tooltip label="展开侧栏" shortcut="⌘\">
      <Button
        type="button"
        aria-label="展开侧栏"
        variant="ghost"
        size="icon-sm"
        className="pointer-events-auto hidden size-9 shrink-0 rounded-md text-foreground hover:bg-accent md:inline-flex"
        onClick={toggleSidebar}
      >
        <PanelLeftIcon />
      </Button>
    </Tooltip>
  );
}

export function ChatHeader({
  conversation,
  activeProject,
  pendingProject,
  onClearProject,
}: ChatHeaderProps) {
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar, setMobileSidebar } = useUiStore();
  const { actions, dialogs } = useConversationActions();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getDataService().listProjects(),
    enabled: !!conversation,
  });

  const project = activeProject ?? pendingProject ?? null;
  const isPendingProjectNewChat = !conversation && !!pendingProject;
  const newChatLabel = isPendingProjectNewChat ? "发起临时对话" : "新增对话";

  const handleNewChat = () => {
    if (isPendingProjectNewChat && onClearProject) {
      onClearProject();
      return;
    }
    if (conversation?.projectId && activeProject) {
      router.push(buildProjectChatHref(activeProject.id));
      return;
    }
    router.push("/");
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-background via-background/90 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20">
        <div className="mx-auto flex w-full max-w-3xl min-w-0 items-start gap-2 px-4">
          <Tooltip label="打开侧栏">
            <Button
            type="button"
            aria-label="打开侧栏"
            variant="ghost"
            size="icon-sm"
            className="pointer-events-auto size-9 shrink-0 rounded-md text-foreground hover:bg-accent md:hidden"
            onClick={() => setMobileSidebar(true)}
          >
              <MenuIcon />
            </Button>
          </Tooltip>

          <SidebarToggleButton
            sidebarCollapsed={sidebarCollapsed}
            toggleSidebar={toggleSidebar}
          />
          <div className="ml-auto flex min-w-0 flex-1 items-start justify-end gap-2">
            <ChatTitleBreadcrumb
              key={`${conversation?.id ?? "new"}:${conversation?.title ?? ""}:${project?.id ?? ""}`}
              conversation={conversation}
              project={project}
            />

            <div className="pointer-events-auto flex h-9 shrink-0 items-center gap-1 rounded-xl border bg-card/95 p-1 shadow-lg backdrop-blur">
              <Tooltip label={newChatLabel}>
                <Button
                  type="button"
                  aria-label={newChatLabel}
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 rounded-lg text-foreground hover:bg-accent"
                  onClick={handleNewChat}
                >
                  <MessageSquarePlusIcon />
                </Button>
              </Tooltip>
              {conversation ? (
                <ConversationActionMenu
                  conversation={conversation}
                  projects={projects}
                  actions={actions}
                  side="bottom"
                  align="end"
                  tooltipLabel="对话设置"
                  trigger={
                    <Button
                      type="button"
                      aria-label="对话设置"
                      variant="ghost"
                      size="icon-sm"
                      className="size-7 rounded-lg text-foreground hover:bg-accent"
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  }
                />
              ) : (
                <Tooltip label="发送第一条消息后可设置会话">
                  <button
                    type="button"
                    aria-label="对话设置"
                    aria-disabled="true"
                    className="inline-flex size-7 cursor-not-allowed items-center justify-center rounded-lg text-muted-foreground opacity-60"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>
      {dialogs}
    </>
  );
}
