import { Outlet, useLocation } from "react-router-dom";
import { SearchDialog } from "@/components/shell/SearchDialog";
import { Sidebar } from "@/components/shell/Sidebar";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useUiStore } from "@/stores/ui-store";

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, "新对话"],
  [/^\/chat\//, "对话"],
  [/^\/projects/, "项目"],
  [/^\/knowledge/, "知识库"],
  [/^\/skills/, "技能"],
  [/^\/files/, "文件"],
  [/^\/billing/, "用量"],
  [/^\/settings/, "设置"],
  [/^\/admin/, "管理后台"],
];

/** 应用外壳:侧栏 + 移动端顶栏 + 主内容 */
export function AppShell() {
  useShortcuts();
  const location = useLocation();
  const setMobileOpen = useUiStore((s) => s.setMobileSidebarOpen);

  const title =
    TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? "LinHub";

  return (
    <div className="flex h-full bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 移动端顶栏 */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg px-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="打开菜单"
            className="flex size-9 items-center justify-center rounded-md text-text hover:bg-surface-2"
          >
            ☰
          </button>
          <span className="text-sm font-medium text-text">{title}</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <SearchDialog />
    </div>
  );
}
