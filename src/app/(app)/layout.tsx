"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { MenuIcon, PanelLeftIcon } from "lucide-react";
import { Sidebar } from "@/components/shell/sidebar";
import { AuthGuard } from "@/components/auth/auth-guard";
import { SearchDialog } from "@/components/shell/search-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useUiStore } from "@/stores/ui-store";
import { useGlobalShortcuts } from "@/lib/hooks/use-shortcuts";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, toggleSidebar, setMobileSidebar } = useUiStore();
  const pathname = usePathname();
  useGlobalShortcuts();

  // 移动端：从左边缘右滑打开侧栏
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t.clientX < 32 ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = Math.abs(t.clientY - touchStart.current.y);
    if (dx > 60 && dy < 40) {
      setMobileSidebar(true);
      touchStart.current = null;
    }
  };

  return (
    <AuthGuard>
    <div
      className="flex h-dvh w-full overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      <Sidebar />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* 折叠态的展开按钮（桌面） */}
        <AnimatePresence>
          {sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="absolute left-3 top-3 z-20 hidden md:block"
            >
              <Tooltip label="展开侧栏" shortcut="⌘\">
                <Button variant="ghost" size="icon-sm" onClick={toggleSidebar}>
                  <PanelLeftIcon />
                </Button>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 移动端顶栏按钮 */}
        <div className="absolute left-3 top-3 z-20 md:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileSidebar(true)}
          >
            <MenuIcon />
          </Button>
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <SearchDialog />
    </div>
    </AuthGuard>
  );
}
