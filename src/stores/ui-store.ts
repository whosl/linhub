"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  searchOpen: boolean;
  /** 当前编辑的项目 id（控制项目编辑弹窗开关） */
  editingProjectId: string | null;
  /** 侧边栏收起的项目 id 集合 */
  collapsedProjects: Set<string>;
  toggleSidebar: () => void;
  setMobileSidebar: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setEditingProjectId: (id: string | null) => void;
  toggleProjectCollapsed: (id: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      searchOpen: false,
      editingProjectId: null,
      collapsedProjects: new Set<string>(),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
      setSearchOpen: (open) => set({ searchOpen: open }),
      setEditingProjectId: (id) => set({ editingProjectId: id }),
      toggleProjectCollapsed: (id) =>
        set((s) => {
          const next = new Set(s.collapsedProjects);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { collapsedProjects: next };
        }),
    }),
    {
      name: "linhub-ui",
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
);
