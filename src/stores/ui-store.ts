"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isThinkingEffort } from "@/lib/model-thinking";
import type { ThinkingEffort } from "@/lib/types";

interface UiState {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  searchOpen: boolean;
  /** 当前编辑的项目 id（控制项目编辑弹窗开关） */
  editingProjectId: string | null;
  /** 侧边栏收起的项目 id 集合 */
  collapsedProjects: Set<string>;
  /** 侧边栏置顶的项目 id 集合 */
  pinnedProjects: Set<string>;
  /** 聊天消息导航条是否启用 */
  messageRailEnabled: boolean;
  /** 新对话默认回复风格 */
  defaultReplyStyleId: string;
  /** 用户覆盖的模型默认思考强度，未覆盖时走模型推荐值 */
  modelThinkingEfforts: Record<string, ThinkingEffort>;
  toggleSidebar: () => void;
  setMobileSidebar: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setEditingProjectId: (id: string | null) => void;
  toggleProjectCollapsed: (id: string) => void;
  toggleProjectPinned: (id: string) => void;
  setMessageRailEnabled: (enabled: boolean) => void;
  setDefaultReplyStyleId: (styleId: string) => void;
  setModelThinkingEffort: (modelId: string, effort: ThinkingEffort) => void;
  resetModelThinkingEffort: (modelId: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      searchOpen: false,
      editingProjectId: null,
      collapsedProjects: new Set<string>(),
      pinnedProjects: new Set<string>(),
      messageRailEnabled: true,
      defaultReplyStyleId: "style-normal",
      modelThinkingEfforts: {},
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
      toggleProjectPinned: (id) =>
        set((s) => {
          const next = new Set(s.pinnedProjects);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { pinnedProjects: next };
        }),
      setMessageRailEnabled: (enabled) =>
        set({ messageRailEnabled: enabled }),
      setDefaultReplyStyleId: (styleId) =>
        set({ defaultReplyStyleId: styleId }),
      setModelThinkingEffort: (modelId, effort) =>
        set((s) => ({
          modelThinkingEfforts: {
            ...s.modelThinkingEfforts,
            [modelId]: effort,
          },
        })),
      resetModelThinkingEffort: (modelId) =>
        set((s) => {
          const next = { ...s.modelThinkingEfforts };
          delete next[modelId];
          return { modelThinkingEfforts: next };
        }),
    }),
    {
      name: "linhub-ui",
      partialize: (s) =>
        ({
          sidebarCollapsed: s.sidebarCollapsed,
          collapsedProjects: Array.from(s.collapsedProjects),
          pinnedProjects: Array.from(s.pinnedProjects),
          messageRailEnabled: s.messageRailEnabled,
          defaultReplyStyleId: s.defaultReplyStyleId,
          modelThinkingEfforts: s.modelThinkingEfforts,
        }) as unknown as UiState,
      merge: (persisted, current) => {
        const saved = persisted as Partial<{
          sidebarCollapsed: boolean;
          collapsedProjects: string[];
          pinnedProjects: string[];
          messageRailEnabled: boolean;
          defaultReplyStyleId: string;
          modelThinkingEfforts: Record<string, unknown>;
        }>;
        const savedModelThinkingEfforts =
          saved.modelThinkingEfforts &&
          typeof saved.modelThinkingEfforts === "object" &&
          !Array.isArray(saved.modelThinkingEfforts)
            ? Object.fromEntries(
                Object.entries(saved.modelThinkingEfforts).filter((entry): entry is [string, ThinkingEffort] =>
                  isThinkingEffort(entry[1])
                )
              )
            : current.modelThinkingEfforts;
        return {
          ...current,
          sidebarCollapsed: saved.sidebarCollapsed ?? current.sidebarCollapsed,
          collapsedProjects: new Set(
            Array.isArray(saved.collapsedProjects) ? saved.collapsedProjects : []
          ),
          pinnedProjects: new Set(
            Array.isArray(saved.pinnedProjects) ? saved.pinnedProjects : []
          ),
          messageRailEnabled:
            typeof saved.messageRailEnabled === "boolean"
              ? saved.messageRailEnabled
              : current.messageRailEnabled,
          defaultReplyStyleId:
            typeof saved.defaultReplyStyleId === "string"
              ? saved.defaultReplyStyleId
              : current.defaultReplyStyleId,
          modelThinkingEfforts: savedModelThinkingEfforts,
        };
      },
    }
  )
);
