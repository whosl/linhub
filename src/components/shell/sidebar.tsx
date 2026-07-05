"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  BookOpenIcon,
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
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiStore } from "@/stores/ui-store";
import { UserMenu } from "./user-menu";
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
  const { sidebarCollapsed, toggleSidebar, setSearchOpen, mobileSidebarOpen, setMobileSidebar } =
    useUiStore();

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => getDataService().listConversations(),
  });

  const active = conversations.filter((c) => !c.archived);
  const pinned = active.filter((c) => c.pinned);
  const recent = active.filter((c) => !c.pinned);

  const grouped = recent.reduce<Record<string, Conversation[]>>((acc, c) => {
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

  const handleDelete = async (c: Conversation) => {
    await getDataService().deleteConversation(c.id);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    toast.success("会话已删除");
    if (pathname === `/chat/${c.id}`) router.push("/");
  };

  const handleRename = async (c: Conversation) => {
    const title = window.prompt("重命名会话", c.title);
    if (title && title.trim()) await mutateConversation(c.id, { title: title.trim() });
  };

  const content = (
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
        <Tooltip label="收起侧栏" shortcut="⌘\">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-foreground"
            onClick={toggleSidebar}
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
            onArchive={(c) => mutateConversation(c.id, { archived: true })}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        )}
        {groupOrder.map(
          (g) =>
            grouped[g] && (
              <ConversationGroup
                key={g}
                label={g}
                conversations={grouped[g]}
                pathname={pathname}
                onTogglePin={(c) => mutateConversation(c.id, { pinned: !c.pinned })}
                onArchive={(c) => mutateConversation(c.id, { archived: true })}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            )
        )}
      </div>

      {/* 底部用户区 */}
      <div className="border-t border-sidebar-border p-3">
        <UserMenu />
      </div>
    </div>
  );

  return (
    <>
      {/* 桌面端 */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 0 : 272 }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="relative z-30 hidden h-full shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar md:block"
      >
        <div className="h-full w-[272px]">{content}</div>
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
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function ConversationGroup({
  label,
  conversations,
  pathname,
  onTogglePin,
  onArchive,
  onRename,
  onDelete,
}: {
  label: string;
  conversations: Conversation[];
  pathname: string;
  onTogglePin: (c: Conversation) => void;
  onArchive: (c: Conversation) => void;
  onRename: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
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
                  <ArchiveIcon /> 归档
                </DropdownMenuItem>
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
