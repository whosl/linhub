// Artifact 面板的选中状态:ToolCallCard「查看」/ ChatHeader 列表共用

import { create } from "zustand";

interface ArtifactPanelState {
  /** 当前选中的 artifact id;null = 面板关闭 */
  selectedId: string | null;
  /** 头部「N 个 Artifact」按钮打开的列表弹层 */
  listOpen: boolean;
  open: (artifactId: string) => void;
  close: () => void;
  openList: () => void;
  closeList: () => void;
}

export const useArtifactPanelStore = create<ArtifactPanelState>()((set) => ({
  selectedId: null,
  listOpen: false,
  open: (artifactId) => set({ selectedId: artifactId, listOpen: false }),
  close: () => set({ selectedId: null }),
  openList: () => set({ listOpen: true }),
  closeList: () => set({ listOpen: false }),
}));
