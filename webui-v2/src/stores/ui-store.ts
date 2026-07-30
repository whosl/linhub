import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatToolToggles } from "@/api/types";
import type { ThinkingEffort } from "@/api/chat";

export type Theme = "light" | "dark" | "system";

/** 工具开关默认值(每次进入聊天页从 ui-store 读取) */
export function defaultChatTools(): ChatToolToggles {
  return {
    autoRouting: false,
    webSearch: false,
    imageGeneration: false,
    codeRunner: false,
    knowledgeSearch: false,
    mcpServerIds: [],
    knowledgeBaseIds: [],
  };
}

interface UiState {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  searchOpen: boolean;
  theme: Theme;
  /** 最近一次选中的模型(per conversation 时优先用 conversation.modelId) */
  selectedModelId?: string;
  /** 回复风格(style-normal 等内置 id) */
  defaultReplyStyleId?: string;
  /** 每个模型记住的思考强度 */
  modelThinkingEfforts: Record<string, ThinkingEffort>;
  extendedThinking: boolean;
  /** Composer 工具开关(持久化) */
  chatTools: ChatToolToggles;
  /** 右侧消息刻度条 */
  messageRailEnabled: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setMobileSidebarOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setTheme: (theme: Theme) => void;
  setSelectedModelId: (id: string | undefined) => void;
  setDefaultReplyStyleId: (id: string | undefined) => void;
  setModelThinkingEffort: (modelId: string, effort: ThinkingEffort) => void;
  setExtendedThinking: (v: boolean) => void;
  setChatTools: (tools: ChatToolToggles) => void;
  setMessageRailEnabled: (v: boolean) => void;
}

const THEME_KEY = "linhub-v2-theme";

/** 把主题应用到 <html> class;system 时跟随系统偏好 */
export function applyTheme(theme: Theme): void {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const raw = localStorage.getItem(THEME_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      searchOpen: false,
      theme: readInitialTheme(),
      selectedModelId: undefined,
      defaultReplyStyleId: undefined,
      modelThinkingEfforts: {},
      extendedThinking: false,
      chatTools: defaultChatTools(),
      messageRailEnabled: true,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setMobileSidebarOpen: (v) => set({ mobileSidebarOpen: v }),
      setSearchOpen: (v) => set({ searchOpen: v }),
      setTheme: (theme) => {
        localStorage.setItem(THEME_KEY, theme);
        applyTheme(theme);
        set({ theme });
      },
      setSelectedModelId: (id) => set({ selectedModelId: id }),
      setDefaultReplyStyleId: (id) => set({ defaultReplyStyleId: id }),
      setModelThinkingEffort: (modelId, effort) =>
        set((s) => ({
          modelThinkingEfforts: { ...s.modelThinkingEfforts, [modelId]: effort },
        })),
      setExtendedThinking: (v) => set({ extendedThinking: v }),
      setChatTools: (tools) => set({ chatTools: tools }),
      setMessageRailEnabled: (v) => set({ messageRailEnabled: v }),
    }),
    {
      name: "linhub-v2-ui",
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        theme: s.theme,
        selectedModelId: s.selectedModelId,
        defaultReplyStyleId: s.defaultReplyStyleId,
        modelThinkingEfforts: s.modelThinkingEfforts,
        extendedThinking: s.extendedThinking,
        chatTools: s.chatTools,
        messageRailEnabled: s.messageRailEnabled,
      }),
    },
  ),
);
