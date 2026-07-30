import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUiStore } from "@/stores/ui-store";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/** 判断 ⌘(mac)或 Ctrl(其他) */
function withMod(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

/**
 * 全局快捷键:
 * - ⌘/Ctrl + K → 回到新聊天(/)
 * - ⌘/Ctrl + / → 打开搜索
 * - ⌘/Ctrl + \ → 折叠/展开侧栏
 */
export function useShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!withMod(e)) return;
      const key = e.key.toLowerCase();
      const ui = useUiStore.getState();

      if (key === "k") {
        e.preventDefault();
        navigate("/");
      } else if (key === "/") {
        e.preventDefault();
        ui.setSearchOpen(!ui.searchOpen);
      } else if (key === "\\") {
        e.preventDefault();
        ui.toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
