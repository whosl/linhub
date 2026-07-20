"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenIcon,
  ChevronDownIcon,
  FileIcon,
  FolderIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import type { Conversation, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiStore } from "@/stores/ui-store";
import { UserMenu } from "./user-menu";
import { ProjectEditDialog } from "./project-edit-dialog";
import {
  ConversationActionMenu,
  type ConversationActionHandlers,
  useConversationActions,
} from "@/components/shell/conversation-actions";

const NAV_ITEMS = [
  { href: "/projects", label: "项目", icon: FolderIcon },
  { href: "/skills", label: "技能", icon: SparklesIcon },
  { href: "/knowledge", label: "知识库", icon: BookOpenIcon },
  { href: "/files", label: "文件", icon: FileIcon },
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

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground md:text-[11px]">
      {children}
    </p>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, setSearchOpen, mobileSidebarOpen, setMobileSidebar, setEditingProjectId, collapsedProjects, toggleProjectCollapsed, pinnedProjects, toggleProjectPinned } =
    useUiStore();
  const { actions, dialogs } = useConversationActions();

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

  // 按项目分组：项目内会话 + 无项目会话
  const knownProjectIds = new Set(projects.map((p) => p.id));
  const projectConvs = active.filter(
    (c) => c.projectId && knownProjectIds.has(c.projectId)
  );
  const noProjectConvs = active.filter(
    (c) => !c.projectId || !knownProjectIds.has(c.projectId)
  );
  const pinned = noProjectConvs.filter((c) => c.pinned);
  const recent = noProjectConvs.filter((c) => !c.pinned);
  const allProjectGroups = projects
    .map((p) => ({
      project: p,
      conversations: projectConvs
        .filter((c) => c.projectId === p.id)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    }))
    .filter((g) => g.conversations.length > 0)
    .sort((a, b) => {
      const aPinned = pinnedProjects.has(a.project.id);
      const bPinned = pinnedProjects.has(b.project.id);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return 0;
    });
  const pinnedProjectGroups = allProjectGroups.filter((g) =>
    pinnedProjects.has(g.project.id)
  );
  const projectGroups = allProjectGroups.filter(
    (g) => !pinnedProjects.has(g.project.id)
  );

  const grouped = noProjectConvs.reduce<Record<string, Conversation[]>>((acc, c) => {
    (acc[groupLabel(c)] ??= []).push(c);
    return acc;
  }, {});
  const groupOrder = ["今天", "昨天", "近 7 天", "近 30 天", "更早"];

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
          className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-xl font-semibold tracking-tight transition-colors hover:bg-sidebar-accent md:gap-2 md:text-[15px]"
        >
          <span className="flex size-8 items-center justify-center md:size-6" aria-hidden="true">
            <Image
              src="/icon.svg"
              alt=""
              width={32}
              height={32}
              priority
              className="size-full object-contain"
            />
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

      {/* 固定操作：新对话 / 搜索 */}
      <div className="flex flex-col gap-0.5 px-3 pt-4">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[15px] font-medium text-primary transition-colors hover:bg-sidebar-accent md:text-sm"
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
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[15px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent md:text-sm"
        >
          <SearchIcon className="size-4" />
          搜索对话
        </button>
      </div>

      {/* 可滚动导航与会话列表 */}
      <div className="mt-4 flex-1 overflow-y-auto px-3 pb-2">
        <div className="mb-4 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[15px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent md:text-sm",
                pathname.startsWith(item.href) &&
                  "bg-sidebar-accent font-medium text-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </div>
        {(pinnedProjectGroups.length > 0 || pinned.length > 0) && (
          <div className="mb-3">
            <SidebarSectionLabel>已置顶</SidebarSectionLabel>
            {pinnedProjectGroups.map(({ project: p, conversations: pConvs }) => (
              <ProjectGroup
                key={`pinned-proj-${p.id}`}
                project={p}
                conversations={pConvs}
                pathname={pathname}
                collapsed={collapsedProjects.has(p.id)}
                pinned
                onToggleCollapse={() => toggleProjectCollapsed(p.id)}
                onTogglePin={() => toggleProjectPinned(p.id)}
                onEdit={() => setEditingProjectId(p.id)}
                projects={projects}
                actions={actions}
              />
            ))}
            {pinned.length > 0 && (
              <ConversationGroup
                conversations={pinned}
                pathname={pathname}
                projects={projects}
                actions={actions}
              />
            )}
          </div>
        )}
        {projectGroups.length > 0 && (
          <div className="mb-3">
            <SidebarSectionLabel>项目</SidebarSectionLabel>
            {projectGroups.map(({ project: p, conversations: pConvs }) => (
              <ProjectGroup
                key={`proj-${p.id}`}
                project={p}
                conversations={pConvs}
                pathname={pathname}
                collapsed={collapsedProjects.has(p.id)}
                pinned={pinnedProjects.has(p.id)}
                onToggleCollapse={() => toggleProjectCollapsed(p.id)}
                onTogglePin={() => toggleProjectPinned(p.id)}
                onEdit={() => setEditingProjectId(p.id)}
                projects={projects}
                actions={actions}
              />
            ))}
          </div>
        )}
        {(recent.length > 0 || archived.length > 0) && (
          <div className="mb-3">
            {groupOrder.map(
              (g) =>
                grouped[g] && (
                  <ConversationGroup
                    key={g}
                    label={g}
                    conversations={grouped[g]}
                    pathname={pathname}
                    projects={projects}
                    actions={actions}
                  />
                )
            )}
            {archived.length > 0 && (
              <ConversationGroup
                label="已归档"
                conversations={archived}
                pathname={pathname}
                projects={projects}
                actions={actions}
              />
            )}
          </div>
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
      {dialogs}
    </>
  );
}

function ConversationGroup({
  label,
  conversations,
  pathname,
  projects,
  actions,
}: {
  label?: string;
  conversations: Conversation[];
  pathname: string;
  projects: { id: string; name: string; color?: string }[];
  actions: ConversationActionHandlers;
}) {
  return (
    <div className="mb-3">
      {label && (
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground md:text-[11px]">
          {label}
        </p>
      )}
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
                "flex-1 truncate px-2 py-1.5 text-[15px] text-sidebar-foreground md:text-sm",
                isActive && "font-medium text-foreground"
              )}
            >
              {c.pinned && (
                <PinIcon className="mr-1.5 inline size-3 text-muted-foreground" />
              )}
              {c.title}
            </Link>
            <ConversationActionMenu
              conversation={c}
              projects={projects}
              actions={actions}
              triggerClassName={cn(isActive && "opacity-100")}
            />
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
  pinned,
  onToggleCollapse,
  onTogglePin,
  onEdit,
  projects,
  actions,
}: {
  project: Project;
  conversations: Conversation[];
  pathname: string;
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onEdit: () => void;
  projects: { id: string; name: string; color?: string }[];
  actions: ConversationActionHandlers;
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
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-[15px] text-sidebar-foreground md:text-sm"
        >
          {pinned ? (
            <PinIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
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
            <DropdownMenuItem onClick={onTogglePin}>
              {pinned ? (
                <>
                  <PinOffIcon /> 取消置顶
                </>
              ) : (
                <>
                  <PinIcon /> 置顶
                </>
              )}
            </DropdownMenuItem>
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
                    "flex-1 truncate px-2 py-1.5 text-[15px] text-sidebar-foreground md:text-sm",
                    isActive && "font-medium text-foreground"
                  )}
                >
                  {c.pinned && <PinIcon className="mr-1.5 inline size-3 text-muted-foreground" />}
                  {c.title}
                </Link>
                <ConversationActionMenu
                  conversation={c}
                  projects={projects}
                  actions={actions}
                  triggerClassName={cn(isActive && "opacity-100")}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
