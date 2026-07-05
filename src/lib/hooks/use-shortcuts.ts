"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/stores/ui-store";

/** 全局快捷键：⌘K 新对话、⌘/ 搜索、⌘\ 折叠侧栏 */
export function useGlobalShortcuts() {
  const router = useRouter();
  const { toggleSidebar, setSearchOpen } = useUiStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "k") {
        e.preventDefault();
        router.push("/");
      } else if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, toggleSidebar, setSearchOpen]);
}
