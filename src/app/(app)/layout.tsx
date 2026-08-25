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

const SIDEBAR_SWIPE_MIN_DISTANCE_PX = 80;
const SIDEBAR_SWIPE_FAST_DISTANCE_PX = 52;
const SIDEBAR_SWIPE_MAX_DURATION_MS = 450;
const SIDEBAR_SWIPE_FAST_DURATION_MS = 250;
const SIDEBAR_SWIPE_MIN_VELOCITY = 0.45;
const SIDEBAR_SWIPE_DIRECTION_RATIO = 1.8;
const SIDEBAR_SWIPE_VERTICAL_CANCEL_PX = 20;
const SIDEBAR_SWIPE_BLOCKED_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "button",
  "a",
  "pre",
  "code",
  "table",
  "img",
  "video",
  "canvas",
  "iframe",
  "[contenteditable]",
  "[role='button']",
  "[role='dialog']",
  "[role='slider']",
  "[role='textbox']",
  "[data-sidebar-swipe-ignore]",
].join(",");

type SidebarSwipeStart = {
  x: number;
  y: number;
  startedAt: number;
};

function blocksSidebarSwipe(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  if (target.closest(SIDEBAR_SWIPE_BLOCKED_SELECTOR)) return true;
  if (window.getSelection()?.type === "Range") return true;

  let current: Element | null = target;
  while (current && current !== document.body) {
    if (current instanceof HTMLElement) {
      const style = window.getComputedStyle(current);
      const horizontallyScrollable =
        ["auto", "scroll"].includes(style.overflowX) &&
        current.scrollWidth > current.clientWidth + 1;
      if (horizontallyScrollable || style.touchAction.includes("pan-x")) {
        return true;
      }
    }
    current = current.parentElement;
  }
  return false;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const {
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebar,
  } = useUiStore();
  const pathname = usePathname();
  const isChatSurface = pathname === "/" || pathname.startsWith("/chat/");
  useGlobalShortcuts();

  // 移动端：全屏向右滑打开侧栏；输入、预览和横向滚动区域保留原生手势。
  const touchStart = React.useRef<SidebarSwipeStart | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (
      mobileSidebarOpen ||
      e.touches.length !== 1 ||
      window.matchMedia("(min-width: 768px)").matches ||
      blocksSidebarSwipe(e.target)
    ) {
      touchStart.current = null;
      return;
    }
    const t = e.touches[0];
    touchStart.current = {
      x: t.clientX,
      y: t.clientY,
      startedAt: performance.now(),
    };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start || e.touches.length !== 1) {
      touchStart.current = null;
      return;
    }
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(t.clientY - start.y);
    const elapsed = performance.now() - start.startedAt;
    const directionRatio = dx / Math.max(absDy, 1);

    if (
      dx < -16 ||
      elapsed > SIDEBAR_SWIPE_MAX_DURATION_MS ||
      (absDy > SIDEBAR_SWIPE_VERTICAL_CANCEL_PX && absDy > absDx)
    ) {
      touchStart.current = null;
      return;
    }

    const enoughDistance = dx >= SIDEBAR_SWIPE_MIN_DISTANCE_PX;
    const fastEnough =
      dx >= SIDEBAR_SWIPE_FAST_DISTANCE_PX &&
      elapsed <= SIDEBAR_SWIPE_FAST_DURATION_MS &&
      dx / Math.max(elapsed, 1) >= SIDEBAR_SWIPE_MIN_VELOCITY;
    if (
      directionRatio >= SIDEBAR_SWIPE_DIRECTION_RATIO &&
      (enoughDistance || fastEnough)
    ) {
      setMobileSidebar(true);
      touchStart.current = null;
    }
  };
  const resetTouch = () => {
    touchStart.current = null;
  };

  return (
    <AuthGuard>
    <div
      className="flex h-dvh w-full overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={resetTouch}
      onTouchCancel={resetTouch}
    >
      <Sidebar />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* 折叠态的展开按钮（桌面） */}
        <AnimatePresence>
          {sidebarCollapsed && !isChatSurface && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="absolute left-3 top-3 z-20 hidden md:block"
            >
              <Tooltip label="展开侧栏" shortcut="⌘\">
                <Button
                  type="button"
                  aria-label="展开侧栏"
                  variant="ghost"
                  size="icon-sm"
                  onClick={toggleSidebar}
                >
                  <PanelLeftIcon />
                </Button>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 移动端顶栏按钮 */}
        {!isChatSurface && (
          <div className="absolute left-3 top-3 z-20 md:hidden">
            <Button
              type="button"
              aria-label="打开侧栏"
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileSidebar(true)}
            >
              <MenuIcon />
            </Button>
          </div>
        )}

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
