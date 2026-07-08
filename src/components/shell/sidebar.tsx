"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  BookOpenIcon,
  ChevronDownIcon,
  FolderIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import type { Conversation, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
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
import { Tooltip } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiStore } from "@/stores/ui-store";
import { UserMenu } from "./user-menu";
import { ProjectEditDialog } from "./project-edit-dialog";
import { toast } from "sonner";

const NAV_ITEMS = [
  { href: "/projects", label: "项目", icon: FolderIcon },
  { href: "/skills", label: "技能", icon: SparklesIcon },
  { href: "/knowledge", label: "知识库", icon: BookOpenIcon },
];

function groupLabel(c: Conversation): string {
  const diff = Date.now() - new Date(c.updatedAt).getTime();
  const day = 86_400_000;
  if (diff < day) return "今天";
  if (diff < 2 * day) return "昨天";
  if (diff < 7 * day) return "近 7 天";
  if (diff < 30 * day) return "近 30 天";
  return "更早";
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sidebarCollapsed, toggleSidebar, setSearchOpen, mobileSidebarOpen, setMobileSidebar, setEditingProjectId, collapsedProjects, toggleProjectCollapsed } =
    useUiStore();
  const [renameTarget, setRenameTarget] = React.useState<Conversation | null>(null);
  const [renameTitle, setRenameTitle] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<Conversation | null>(null);
  const [conversationBusy, setConversationBusy] = React.useState(false);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => getDataService().listConversations(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getDataService().listProjects(),
  });

  const active = conversations.filter((c) => !c.archived);
  const archived = conversations.filter((c) => c.archived);
  const pinned = active.filter((c) => c.pinned);
  const recent = active.filter((c) => !c.pinned);

  // 按项目分组：项目内会话 + 无项目会话
  const projectConvs = recent.filter((c) => c.projectId);
  const noProjectConvs = recent.filter((c) => !c.projectId);
  const projectGroups = projects.map((p) => ({
    project: p,
    conversations: projectConvs.filter((c) => c.projectId === p.id),
  })).filter((g) => g.conversations.length > 0);

  const grouped = noProjectConvs.reduce<Record<string, Conversation[]>>((acc, c) => {
    (acc[groupLabel(c)] ??= []).push(c);
    return acc;
  }, {});
  const groupOrder = ["今天", "昨天", "近 7 天", "近 30 天", "更早"];

  const mutateConversation = async (
    id: string,
    patch: Parameters<ReturnType<typeof getDataService>["updateConversation"]>[1]
  ) => {
    await getDataService().updateConversation(id, patch);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const invalidateProjectConversationQueries = (projectId?: string | null) => {
    if (!projectId) return;
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-conversations", projectId] });
  };

  const handleDelete = async (c: Conversation) => {
    await getDataService().deleteConversation(c.id);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    invalidateProjectConversationQueries(c.projectId);
    toast.success("会话已删除");
    if (pathname === `/chat/${c.id}`) router.push("/");
  };

  const handleArchive = async (c: Conversation) => {
    await mutateConversation(c.id, { archived: true });
    invalidateProjectConversationQueries(c.projectId);
    toast.success("会话已归档");
    if (pathname === `/chat/${c.id}`) router.push("/");
  };

  const handleUnarchive = async (c: Conversation) => {
    await mutateConversation(c.id, { archived: false });
    invalidateProjectConversationQueries(c.projectId);
    toast.success("会话已取消归档");
  };

  const handleMoveToProject = async (c: Conversation, projectId: string | null) => {
    await mutateConversation(c.id, { projectId });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    if (c.projectId) {
      queryClient.invalidateQueries({ queryKey: ["project", c.projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-conversations", c.projectId] });
    }
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-conversations", projectId] });
    }
    toast.success(projectId ? "已移动到项目" : "已移出项目");
  };

  const handleRename = (c: Conversation) => {
    setRenameTarget(c);
    setRenameTitle(c.title);
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const title = renameTitle.trim();
    if (!title) return;
    setConversationBusy(true);
    try {
      if (title !== renameTarget.title) {
        await mutateConversation(renameTarget.id, { title });
        invalidateProjectConversationQueries(renameTarget.projectId);
        toast.success("会话已重命名");
      }
      setRenameTarget(null);
    } finally {
      setConversationBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setConversationBusy(true);
    try {
      await handleDelete(deleteTarget);
      setDeleteTarget(null);
    } finally {
      setConversationBusy(false);
    }
  };

  const renderContent = (mobile: boolean) => {
    const sidebarButtonLabel = mobile ? "关闭侧栏" : "收起侧栏";
    const handleSidebarButtonClick = () => {
      if (mobile) {
        setMobileSidebar(false);
        return;
      }
      toggleSidebar();
    };

    return (
    <div className="flex h-full flex-col">
      {/* 顶部：logo 与折叠 */}
      <div className="flex items-center justify-between px-3 pt-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[15px] font-semibold tracking-tight transition-colors hover:bg-sidebar-accent"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-primary font-serif text-sm text-primary-foreground">
            L
          </span>
          LinHub
        </Link>
        <Tooltip label={sidebarButtonLabel} shortcut="⌘\">
          <Button
            type="button"
            aria-label={sidebarButtonLabel}
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-foreground"
            onClick={handleSidebarButtonClick}
          >
            <PanelLeftIcon />
          </Button>
        </Tooltip>
      </div>

      {/* 新对话 / 搜索 */}
      <div className="flex flex-col gap-0.5 px-3 pt-4">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-sidebar-accent"
        >
          <MessageSquarePlusIcon className="size-4" />
          新对话
          <kbd className="ml-auto hidden rounded border border-border px-1 font-mono text-[10px] text-muted-foreground group-hover:inline">
            ⌘K
          </kbd>
        </Link>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <SearchIcon className="size-4" />
          搜索会话
        </button>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
              pathname.startsWith(item.href) &&
                "bg-sidebar-accent font-medium text-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </div>

      {/* 会话列表 */}
      <div className="mt-4 flex-1 overflow-y-auto px-3 pb-2">
        {pinned.length > 0 && (
          <ConversationGroup
            label="已置顶"
            conversations={pinned}
            pathname={pathname}
            onTogglePin={(c) => mutateConversation(c.id, { pinned: !c.pinned })}
            onArchive={handleArchive}
            archiveLabel="归档"
            onRename={handleRename}
            onDelete={setDeleteTarget}
            projects={projects}
            onMoveToProject={handleMoveToProject}
          />
        )}
        {/* 项目分组（可折叠文件夹） */}
        {projectGroups.map(({ project: p, conversations: pConvs }) => (
          <ProjectGroup
            key={`proj-${p.id}`}
            project={p}
            conversations={pConvs}
            pathname={pathname}
            collapsed={collapsedProjects.has(p.id)}
            onToggleCollapse={() => toggleProjectCollapsed(p.id)}
            onEdit={() => setEditingProjectId(p.id)}
            onTogglePin={(c) => mutateConversation(c.id, { pinned: !c.pinned })}
            onArchive={handleArchive}
            archiveLabel="归档"
            onRename={handleRename}
            onDelete={setDeleteTarget}
            projects={projects}
            onMoveToProject={handleMoveToProject}
          />
        ))}
        {groupOrder.map(
          (g) =>
            grouped[g] && (
              <ConversationGroup
                key={g}
                label={g}
                conversations={grouped[g]}
                pathname={pathname}
                onTogglePin={(c) => mutateConversation(c.id, { pinned: !c.pinned })}
                onArchive={handleArchive}
                archiveLabel="归档"
                onRename={handleRename}
                onDelete={setDeleteTarget}
                projects={projects}
                onMoveToProject={handleMoveToProject}
              />
            )
        )}
        {archived.length > 0 && (
          <ConversationGroup
            label="已归档"
            conversations={archived}
            pathname={pathname}
            onTogglePin={(c) => mutateConversation(c.id, { pinned: !c.pinned })}
            onArchive={handleUnarchive}
            archiveLabel="取消归档"
            onRename={handleRename}
            onDelete={setDeleteTarget}
            projects={projects}
            onMoveToProject={handleMoveToProject}
          />
        )}
      </div>

      {/* 底部用户区 */}
      <div className="border-t border-sidebar-border p-3">
        <UserMenu />
      </div>
    </div>
    );
  };

  return (
    <>
      {/* 桌面端 */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 0 : 272 }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="relative z-30 hidden h-full shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar md:block"
      >
        <div className="h-full w-[272px]">{renderContent(false)}</div>
      </motion.aside>

      {/* 移动端抽屉 */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setMobileSidebar(false)}
            />
            <motion.aside
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] bg-sidebar shadow-xl md:hidden"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) setMobileSidebar(false);
              }}
            >
              {renderContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <ProjectEditDialog />
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open && !conversationBusy) setRenameTarget(null);
        }}
      >
        <DialogContent aria-describedby="sidebar-rename-description">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription id="sidebar-rename-description">
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
}

function ConversationGroup({
  label,
  conversations,
  pathname,
  onTogglePin,
  onArchive,
  archiveLabel = "归档",
  onRename,
  onDelete,
  projects,
  onMoveToProject,
}: {
  label: string;
  conversations: Conversation[];
  pathname: string;
  onTogglePin: (c: Conversation) => void;
  onArchive: (c: Conversation) => void;
  archiveLabel?: string;
  onRename: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
  projects: { id: string; name: string; color?: string }[];
  onMoveToProject: (c: Conversation, projectId: string | null) => void;
}) {
  return (
    <div className="mb-3">
      <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
        {label}
      </p>
      {conversations.map((c) => {
        const isActive = pathname === `/chat/${c.id}`;
        return (
          <div
            key={c.id}
            className={cn(
              "group relative flex items-center rounded-lg transition-colors hover:bg-sidebar-accent",
              isActive && "bg-sidebar-accent"
            )}
          >
            <Link
              href={`/chat/${c.id}`}
              className={cn(
                "flex-1 truncate px-2 py-1.5 text-sm text-sidebar-foreground",
                isActive && "font-medium text-foreground"
              )}
            >
              {c.pinned && (
                <PinIcon className="mr-1.5 inline size-3 text-muted-foreground" />
              )}
              {c.title}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`会话「${c.title}」更多操作`}
                  className={cn(
                    "mr-1 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-border focus:opacity-100 group-hover:opacity-100",
                    isActive && "opacity-100"
                  )}
                >
                  <MoreHorizontalIcon className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="right">
                <DropdownMenuItem onClick={() => onRename(c)}>
                  <PencilIcon /> 重命名
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTogglePin(c)}>
                  {c.pinned ? (
                    <>
                      <PinOffIcon /> 取消置顶
                    </>
                  ) : (
                    <>
                      <PinIcon /> 置顶
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onArchive(c)}>
                  <ArchiveIcon /> {archiveLabel}
                </DropdownMenuItem>
                {projects.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">移动到项目</p>
                    {c.projectId && (
                      <DropdownMenuItem onClick={() => onMoveToProject(c, null)}>
                        移出项目
                      </DropdownMenuItem>
                    )}
                    {projects
                      .filter((p) => p.id !== c.projectId)
                      .slice(0, 8)
                      .map((p) => (
                        <DropdownMenuItem key={p.id} onClick={() => onMoveToProject(c, p.id)}>
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? "#C96442" }} />
                          {p.name}
                        </DropdownMenuItem>
                      ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(c)}>
                  <Trash2Icon /> 删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}

/** 项目分组：可折叠文件夹 + ⋯ 菜单（编辑/新对话/删除） */
function ProjectGroup({
  project,
  conversations,
  pathname,
  collapsed,
  onToggleCollapse,
  onEdit,
  onTogglePin,
  onArchive,
  archiveLabel = "归档",
  onRename,
  onDelete,
  projects,
  onMoveToProject,
}: {
  project: Project;
  conversations: Conversation[];
  pathname: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onEdit: () => void;
  onTogglePin: (c: Conversation) => void;
  onArchive: (c: Conversation) => void;
  archiveLabel?: string;
  onRename: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
  projects: { id: string; name: string; color?: string }[];
  onMoveToProject: (c: Conversation, projectId: string | null) => void;
}) {
  return (
    <div className="mb-1">
      {/* 项目标题行 */}
      <div className="group/proj flex items-center rounded-lg transition-colors hover:bg-sidebar-accent">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "展开" : "收起"}项目「${project.name}」`}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-sm text-sidebar-foreground"
        >
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{project.name}</span>
          <ChevronDownIcon
            className={cn(
              "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
              collapsed && "-rotate-90"
            )}
          />
        </button>
        {/* ⋯ 菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`项目「${project.name}」更多操作`}
              className="mr-1 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-border focus:opacity-100 group-hover/proj:opacity-100"
            >
              <MoreHorizontalIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right">
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon /> 编辑项目
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/?project=${project.id}`}>
                <MessageSquarePlusIcon className="size-4" /> 在项目中新对话
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 展开的对话列表 */}
      {!collapsed && conversations.length > 0 && (
        <div className="ml-3 border-l border-sidebar-border pl-1">
          {conversations.map((c) => {
            const isActive = pathname === `/chat/${c.id}`;
            return (
              <div
                key={c.id}
                className={cn(
                  "group relative flex items-center rounded-lg transition-colors hover:bg-sidebar-accent",
                  isActive && "bg-sidebar-accent"
                )}
              >
                <Link
                  href={`/chat/${c.id}`}
                  className={cn(
                    "flex-1 truncate px-2 py-1.5 text-sm text-sidebar-foreground",
                    isActive && "font-medium text-foreground"
                  )}
                >
                  {c.pinned && <PinIcon className="mr-1.5 inline size-3 text-muted-foreground" />}
                  {c.title}
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`会话「${c.title}」更多操作`}
                      className={cn(
                        "mr-1 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-border focus:opacity-100 group-hover:opacity-100",
                        isActive && "opacity-100"
                      )}
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="right">
                    <DropdownMenuItem onClick={() => onRename(c)}>
                      <PencilIcon /> 重命名
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onTogglePin(c)}>
                      {c.pinned ? <><PinOffIcon /> 取消置顶</> : <><PinIcon /> 置顶</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onArchive(c)}>
                      <ArchiveIcon /> {archiveLabel}
                    </DropdownMenuItem>
                    {projects.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">移动到项目</p>
                        {c.projectId && (
                          <DropdownMenuItem onClick={() => onMoveToProject(c, null)}>
                            移出项目
                          </DropdownMenuItem>
                        )}
                        {projects.filter((p) => p.id !== c.projectId).slice(0, 8).map((p) => (
                          <DropdownMenuItem key={p.id} onClick={() => onMoveToProject(c, p.id)}>
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? "#C96442" }} />
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(c)}>
                      <Trash2Icon /> 删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
