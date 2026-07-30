// 会话页头部:标题(点击重命名)+ 当前模型名

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listArtifacts } from "@/api/artifacts";
import { listConversations, patchConversation } from "@/api/conversations";
import { toast } from "@/components/ui/toast";
import { useArtifactPanelStore } from "@/stores/artifact-panel-store";
import { useModels } from "./ModelMenu";

export function ChatHeader({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // 会话元数据复用侧栏的列表缓存
  const { data: conversation } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => listConversations(),
    select: (list) => list.find((c) => c.id === conversationId),
  });
  const { find } = useModels();
  const model = find(conversation?.modelId);

  // 会话内 artifact 数量(流式 artifact 事件会 invalidate 此 key)
  const { data: artifacts } = useQuery({
    queryKey: ["artifacts", conversationId],
    queryFn: () => listArtifacts(conversationId),
  });
  const openArtifactList = useArtifactPanelStore((s) => s.openList);

  const saveTitle = async () => {
    const title = draft.trim();
    setEditing(false);
    if (!title || title === conversation?.title) return;
    try {
      await patchConversation(conversationId, { title });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重命名失败");
    }
  };

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      {editing ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveTitle();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => void saveTitle()}
          autoFocus
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-sm text-text outline-none focus:border-primary"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(conversation?.title ?? "");
            setEditing(true);
          }}
          title="点击重命名"
          className="min-w-0 truncate rounded-md px-1 text-sm font-medium text-text hover:bg-surface-2"
        >
          {conversation?.title ?? "对话"}
        </button>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {artifacts && artifacts.length > 0 && (
          <button
            type="button"
            onClick={openArtifactList}
            className="rounded-md border border-border px-2 py-0.5 text-xs text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
          >
            📄 {artifacts.length} 个 Artifact
          </button>
        )}
        {model && (
          <span className="text-xs text-text-3">{model.displayName}</span>
        )}
      </span>
    </div>
  );
}
