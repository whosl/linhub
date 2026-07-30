import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listConversations } from "@/api/conversations";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { useUiStore } from "@/stores/ui-store";
import type { Conversation } from "@/api/types";

/** 搜索对话框:⌘/Ctrl+/ 唤起,输入防抖 300ms */
export function SearchDialog() {
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} widthClassName="max-w-lg">
      {/* 仅在打开时挂载,关闭即卸载,天然重置输入态 */}
      {open ? <SearchContent onClose={() => setOpen(false)} /> : null}
    </Dialog>
  );
}

function SearchContent({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  // 输入防抖
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const { data, isFetching } = useQuery({
    queryKey: ["conversations", "search", query],
    queryFn: () => listConversations(query || undefined),
  });

  const results = data ?? [];

  const go = (c: Conversation) => {
    onClose();
    navigate(`/chat/${c.id}`);
  };

  return (
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="搜索会话…"
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-primary"
        />
        <div className="max-h-72 overflow-y-auto">
          {isFetching ? (
            <div className="flex items-center justify-center gap-2 py-6 text-text-2">
              <Spinner />
              <span className="text-sm">搜索中…</span>
            </div>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-3">
              {query ? "没有找到相关会话" : "输入关键词开始搜索"}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => go(c)}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-text hover:bg-surface-2"
                  >
                    <span className="block truncate">{c.title || "未命名会话"}</span>
                    <span className="block text-xs text-text-3">
                      {new Date(c.updatedAt).toLocaleString("zh-CN")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-right text-xs text-text-3">Esc 关闭</p>
      </div>
  );
}
