import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { listConversations } from "@/api/conversations";
import type { Conversation } from "@/api/types";
import { ConversationItem } from "@/components/shell/ConversationItem";
import { DropdownItem, DropdownMenu } from "@/components/ui/DropdownMenu";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/cn";

interface Group {
  label: string;
  items: Conversation[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 按时间分组:今天 / 昨天 / 7 天内 / 30 天内 / 更早 */
function groupByTime(list: Conversation[]): Group[] {
  const now = Date.now();
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const buckets: Group[] = [
    { label: "今天", items: [] },
    { label: "昨天", items: [] },
    { label: "7 天内", items: [] },
    { label: "30 天内", items: [] },
    { label: "更早", items: [] },
  ];
  for (const c of list) {
    const t = new Date(c.updatedAt).getTime();
    if (t >= startOfToday) buckets[0].items.push(c);
    else if (t >= startOfToday - DAY_MS) buckets[1].items.push(c);
    else if (t >= now - 7 * DAY_MS) buckets[2].items.push(c);
    else if (t >= now - 30 * DAY_MS) buckets[3].items.push(c);
    else buckets[4].items.push(c);
  }
  return buckets.filter((g) => g.items.length > 0);
}

const NAV_ITEMS = [
  { to: "/projects", label: "项目" },
  { to: "/knowledge", label: "知识库" },
  { to: "/skills", label: "技能" },
  { to: "/files", label: "文件" },
  { to: "/billing", label: "用量" },
  { to: "/settings", label: "设置" },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { id: activeId } = useParams();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const mobileOpen = useUiStore((s) => s.mobileSidebarOpen);
  const setMobileOpen = useUiStore((s) => s.setMobileSidebarOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => listConversations(),
  });

  const { pinned, groups, archived } = useMemo(() => {
    const all = data ?? [];
    const active = all.filter((c) => !c.archived);
    return {
      pinned: active
        .filter((c) => c.pinned)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      groups: groupByTime(
        active
          .filter((c) => !c.pinned)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ),
      archived: all
        .filter((c) => c.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }, [data]);

  const dark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const closeMobile = () => setMobileOpen(false);

  const body = (
    <div className="flex h-full w-70 flex-col border-r border-border bg-bg">
      {/* 顶部:品牌 + 新建对话 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Link to="/" className="text-lg font-semibold tracking-tight text-text">
          LinHub
        </Link>
        <button
          type="button"
          onClick={() => useUiStore.getState().toggleSidebar()}
          className="hidden rounded-md p-1.5 text-text-2 hover:bg-surface-2 md:block"
          aria-label="折叠侧栏"
        >
          ⇤
        </button>
      </div>
      <div className="px-3">
        <button
          type="button"
          onClick={() => {
            navigate("/");
            closeMobile();
          }}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          <span aria-hidden>+</span> 新建对话
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="mt-2 flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-text-3 hover:bg-surface-2"
        >
          <span aria-hidden>⌕</span> 搜索会话
          <span className="ml-auto text-xs">⌘/</span>
        </button>
      </div>

      {/* 会话列表 */}
      <div className="mt-3 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex justify-center py-8 text-text-2">
            <Spinner className="size-5" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <p className="text-sm text-text-2">加载失败</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm text-primary hover:underline"
            >
              重试
            </button>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <Section label="置顶">
                {pinned.map((c) => (
                  <ConversationItem
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    onNavigate={closeMobile}
                  />
                ))}
              </Section>
            )}
            {groups.map((g) => (
              <Section key={g.label} label={g.label}>
                {g.items.map((c) => (
                  <ConversationItem
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    onNavigate={closeMobile}
                  />
                ))}
              </Section>
            ))}
            {pinned.length === 0 && groups.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-text-3">
                暂无会话,开始新对话吧
              </p>
            )}
            {archived.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setArchivedOpen((v) => !v)}
                  className="flex w-full items-center gap-1 px-2 py-1 text-xs font-medium text-text-3 hover:text-text-2"
                >
                  <span
                    className={cn(
                      "inline-block transition-transform",
                      archivedOpen && "rotate-90",
                    )}
                  >
                    ▸
                  </span>
                  已归档({archived.length})
                </button>
                {archivedOpen &&
                  archived.map((c) => (
                    <ConversationItem
                      key={c.id}
                      conversation={c}
                      active={c.id === activeId}
                      onNavigate={closeMobile}
                    />
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部导航 + 用户菜单 */}
      <div className="border-t border-border px-2 py-2">
        <nav className="grid grid-cols-3 gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeMobile}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-2 py-1.5 text-center text-sm transition-colors",
                  isActive
                    ? "bg-surface-2 font-medium text-text"
                    : "text-text-2 hover:bg-surface-2/60 hover:text-text",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <DropdownMenu
          align="left"
          trigger={
            <span className="mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-medium text-primary">
                {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-text">
                  {user?.name || "未命名用户"}
                </span>
                <span className="block truncate text-xs text-text-3">
                  {user?.email}
                </span>
              </span>
            </span>
          }
        >
          <div className="flex items-center justify-between gap-4 px-2.5 py-1.5">
            <span className="text-sm text-text">深色模式</span>
            <Switch
              checked={dark}
              onChange={(v) => setTheme(v ? "dark" : "light")}
              label="深色模式"
            />
          </div>
          {user?.role === "admin" && (
            <DropdownItem
              onClick={() => {
                navigate("/admin");
                closeMobile();
              }}
            >
              管理后台
            </DropdownItem>
          )}
          <DropdownItem
            danger
            onClick={() => {
              void logout().then(() => navigate("/login"));
            }}
          >
            退出登录
          </DropdownItem>
        </DropdownMenu>
      </div>
    </div>
  );

  if (collapsed) return null;

  return (
    <>
      {/* 桌面:固定侧栏 */}
      <aside className="hidden shrink-0 md:block">{body}</aside>
      {/* 移动端:抽屉 + 遮罩 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeMobile}
            aria-hidden
          />
          <aside className="absolute top-0 left-0 h-full">{body}</aside>
        </div>
      )}
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="px-2 py-1 text-xs font-medium text-text-3">{label}</p>
      {children}
    </div>
  );
}
