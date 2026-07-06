"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareIcon, SearchIcon } from "lucide-react";
import { getDataService } from "@/lib/data";
import { formatRelativeTime } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useUiStore } from "@/stores/ui-store";

export function SearchDialog() {
  const router = useRouter();
  const { searchOpen, setSearchOpen } = useUiStore();
  const [query, setQuery] = React.useState("");
  // I19: 防抖——输入值与查询值分离，避免每次按键都发 /api/conversations 请求
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [] } = useQuery({
    queryKey: ["conversation-search", debouncedQuery],
    queryFn: () =>
      debouncedQuery.trim()
        ? getDataService().searchConversations(debouncedQuery.trim())
        : getDataService().listConversations(),
    enabled: searchOpen,
  });

  React.useEffect(() => {
    if (!searchOpen) {
      Promise.resolve().then(() => {
        setQuery("");
        setDebouncedQuery("");
      });
    }
  }, [searchOpen]);

  return (
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent hideClose className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">搜索会话</DialogTitle>
        <div className="flex items-center gap-2.5 border-b px-4">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索历史会话…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              没有找到匹配的会话
            </p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSearchOpen(false);
                  router.push(`/chat/${c.id}`);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
              >
                <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(c.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
