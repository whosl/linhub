"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  TooltipContent,
  TooltipRoot,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  optimisticPatchRecords,
  optimisticRemoveRecord,
} from "@/lib/optimistic-query";

type ProjectOption = {
  id: string;
  name: string;
  color?: string;
};

type ConversationPatch = Parameters<
  ReturnType<typeof getDataService>["updateConversation"]
>[1];

export type ConversationActionHandlers = {
  rename: (conversation: Conversation) => void;
  requestDelete: (conversation: Conversation) => void;
  togglePin: (conversation: Conversation) => Promise<void>;
  toggleArchive: (conversation: Conversation) => Promise<void>;
  moveToProject: (
    conversation: Conversation,
    projectId: string | null
  ) => Promise<void>;
};

export function useConversationActions(): {
  actions: ConversationActionHandlers;
  dialogs: React.ReactNode;
} {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [renameTarget, setRenameTarget] = React.useState<Conversation | null>(
    null
  );
  const [renameTitle, setRenameTitle] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<Conversation | null>(
    null
  );
  const [conversationBusy, setConversationBusy] = React.useState(false);

  const invalidateProjectConversationQueries = React.useCallback(
    (projectId?: string | null) => {
      if (!projectId) return;
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      void queryClient.invalidateQueries({
        queryKey: ["project-conversations", projectId],
      });
    },
    [queryClient]
  );

  const mutateConversation = React.useCallback(
    async (id: string, patch: ConversationPatch) => {
      const { projectId, ...cacheFields } = patch;
      const cachePatch: Partial<Conversation> = {
        ...cacheFields,
        ...(projectId !== undefined
          ? { projectId: projectId ?? undefined }
          : {}),
      };
      const optimistic = optimisticPatchRecords<Conversation>(
        queryClient,
        [
          ["conversations"],
          ["conversation", id],
          ["conversation-search"],
          ["project-conversations"],
        ],
        id,
        cachePatch
      );
      try {
        const saved = await getDataService().updateConversation(id, patch);
        optimistic.reconcile(saved);
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["conversation", id] });
        return true;
      } catch (error) {
        optimistic.rollback();
        toast.error(error instanceof Error ? error.message : "会话更新失败");
        return false;
      }
    },
    [queryClient]
  );

  const deleteConversation = React.useCallback(
    async (conversation: Conversation) => {
      const isCurrentConversation =
        pathname === `/chat/${conversation.id}` ||
        (typeof window !== "undefined" &&
          window.location.pathname === `/chat/${conversation.id}`);

      const optimistic = optimisticRemoveRecord<Conversation>(
        queryClient,
        [["conversations"], ["conversation-search"], ["project-conversations"]],
        conversation.id
      );
      if (isCurrentConversation) router.replace("/");
      try {
        await getDataService().deleteConversation(conversation.id);
      } catch (error) {
        optimistic.rollback();
        if (isCurrentConversation) router.replace(`/chat/${conversation.id}`);
        toast.error(error instanceof Error ? error.message : "删除失败");
        return false;
      }
      useChatStore.getState().removeSession(conversation.id);
      queryClient.removeQueries({ queryKey: ["conversation", conversation.id] });
      queryClient.removeQueries({ queryKey: ["artifacts", conversation.id] });
      queryClient.removeQueries({ queryKey: ["conversation-search"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      invalidateProjectConversationQueries(conversation.projectId);
      toast.success("会话已删除");
      return true;
    },
    [invalidateProjectConversationQueries, pathname, queryClient, router]
  );

  const rename = React.useCallback((conversation: Conversation) => {
    setRenameTarget(conversation);
    setRenameTitle(conversation.title);
  }, []);

  const requestDelete = React.useCallback((conversation: Conversation) => {
    setDeleteTarget(conversation);
  }, []);

  const togglePin = React.useCallback(
    async (conversation: Conversation) => {
      await mutateConversation(conversation.id, {
        pinned: !conversation.pinned,
      });
      invalidateProjectConversationQueries(conversation.projectId);
    },
    [invalidateProjectConversationQueries, mutateConversation]
  );

  const toggleArchive = React.useCallback(
    async (conversation: Conversation) => {
      const archived = !conversation.archived;
      const saved = await mutateConversation(conversation.id, { archived });
      if (!saved) return;
      invalidateProjectConversationQueries(conversation.projectId);
      toast.success(archived ? "会话已归档" : "会话已取消归档");
      if (archived && pathname === `/chat/${conversation.id}`) {
        router.push("/");
      }
    },
    [invalidateProjectConversationQueries, mutateConversation, pathname, router]
  );

  const moveToProject = React.useCallback(
    async (conversation: Conversation, projectId: string | null) => {
      const saved = await mutateConversation(conversation.id, { projectId });
      if (!saved) return;
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      invalidateProjectConversationQueries(conversation.projectId);
      invalidateProjectConversationQueries(projectId);
      toast.success(projectId ? "已移动到项目" : "已移出项目");
    },
    [invalidateProjectConversationQueries, mutateConversation, queryClient]
  );

  const confirmRename = React.useCallback(async () => {
    if (!renameTarget) return;
    const title = renameTitle.trim();
    if (!title) return;
    setConversationBusy(true);
    try {
      if (title !== renameTarget.title) {
        const saved = await mutateConversation(renameTarget.id, { title });
        if (!saved) return;
        invalidateProjectConversationQueries(renameTarget.projectId);
        toast.success("会话已重命名");
      }
      setRenameTarget(null);
    } finally {
      setConversationBusy(false);
    }
  }, [
    invalidateProjectConversationQueries,
    mutateConversation,
    renameTarget,
    renameTitle,
  ]);

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setConversationBusy(true);
    try {
      const deleted = await deleteConversation(deleteTarget);
      if (deleted) setDeleteTarget(null);
    } finally {
      setConversationBusy(false);
    }
  }, [deleteConversation, deleteTarget]);

  const actions = React.useMemo<ConversationActionHandlers>(
    () => ({
      rename,
      requestDelete,
      togglePin,
      toggleArchive,
      moveToProject,
    }),
    [moveToProject, rename, requestDelete, toggleArchive, togglePin]
  );

  const dialogs = (
    <>
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open && !conversationBusy) setRenameTarget(null);
        }}
      >
        <DialogContent aria-describedby="conversation-rename-description">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription id="conversation-rename-description">
              为这个会话设置一个更容易识别的名称。
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameTitle}
            onChange={(event) => setRenameTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirmRename();
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={conversationBusy}
              onClick={() => setRenameTarget(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={conversationBusy || !renameTitle.trim()}
              onClick={() => void confirmRename()}
            >
              {conversationBusy ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !conversationBusy) setDeleteTarget(null);
        }}
        title="删除会话"
        description={
          deleteTarget
            ? `确定删除会话「${deleteTarget.title}」？删除后无法撤销。`
            : "确定删除这个会话？删除后无法撤销。"
        }
        confirmLabel="删除"
        destructive
        loading={conversationBusy}
        onConfirm={confirmDelete}
      />
    </>
  );

  return { actions, dialogs };
}

export function ConversationActionMenu({
  conversation,
  projects,
  actions,
  trigger,
  triggerClassName,
  side = "right",
  align = "start",
  tooltipLabel,
}: {
  conversation: Conversation;
  projects: ProjectOption[];
  actions: ConversationActionHandlers;
  trigger?: React.ReactElement;
  triggerClassName?: string;
  side?: React.ComponentProps<typeof DropdownMenuContent>["side"];
  align?: React.ComponentProps<typeof DropdownMenuContent>["align"];
  tooltipLabel?: React.ReactNode;
}) {
  const triggerElement =
    trigger ?? (
      <button
        type="button"
        aria-label={`会话「${conversation.title}」更多操作`}
        className={cn(
          "mr-1 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-border focus:opacity-100 group-hover:opacity-100",
          triggerClassName
        )}
      >
        <MoreHorizontalIcon className="size-4" />
      </button>
    );
  const triggerNode = (
    <DropdownMenuTrigger asChild>{triggerElement}</DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {tooltipLabel ? (
        <TooltipRoot delayDuration={350}>
          <TooltipTrigger asChild>{triggerNode}</TooltipTrigger>
          <TooltipContent side="bottom">
            <span>{tooltipLabel}</span>
          </TooltipContent>
        </TooltipRoot>
      ) : (
        triggerNode
      )}
      <DropdownMenuContent align={align} side={side}>
        <DropdownMenuItem onClick={() => actions.rename(conversation)}>
          <PencilIcon /> 重命名
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void actions.togglePin(conversation)}>
          {conversation.pinned ? (
            <>
              <PinOffIcon /> 取消置顶
            </>
          ) : (
            <>
              <PinIcon /> 置顶
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void actions.toggleArchive(conversation)}>
          <ArchiveIcon /> {conversation.archived ? "取消归档" : "归档"}
        </DropdownMenuItem>
        {projects.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
              移动到项目
            </p>
            {conversation.projectId && (
              <DropdownMenuItem
                onClick={() => void actions.moveToProject(conversation, null)}
              >
                移出项目
              </DropdownMenuItem>
            )}
            {projects
              .filter((project) => project.id !== conversation.projectId)
              .slice(0, 8)
              .map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() =>
                    void actions.moveToProject(conversation, project.id)
                  }
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color ?? "#C96442" }}
                  />
                  {project.name}
                </DropdownMenuItem>
              ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => actions.requestDelete(conversation)}
        >
          <Trash2Icon /> 删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
