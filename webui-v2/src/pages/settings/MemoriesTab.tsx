import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@/api/billing";
import {
  createMemory,
  deleteMemory,
  getMemories,
  settingsKeys,
  type MemoryEntry,
} from "@/api/settings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageLoading } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "./SettingsPage";

/** 记忆 Tab:手动管理模型自动保存的偏好记忆,全部乐观更新 */
export function MemoriesTab() {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");

  const query = useQuery({
    queryKey: settingsKeys.memories,
    queryFn: getMemories,
  });

  const addMutation = useMutation({
    mutationFn: (text: string) => createMemory(text),
    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.memories });
      const previous = queryClient.getQueryData<MemoryEntry[]>(
        settingsKeys.memories,
      );
      const now = new Date().toISOString();
      const optimistic: MemoryEntry = {
        id: `temp-${Date.now()}`,
        content: text,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<MemoryEntry[]>(
        settingsKeys.memories,
        (old = []) => [optimistic, ...old],
      );
      return { previous };
    },
    onError: (err, _text, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.memories, context.previous);
      }
      toast.error(errorMessage(err, "添加失败"));
    },
    onSuccess: () => toast.success("已添加"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.memories });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.memories });
      const previous = queryClient.getQueryData<MemoryEntry[]>(
        settingsKeys.memories,
      );
      queryClient.setQueryData<MemoryEntry[]>(
        settingsKeys.memories,
        (old = []) => old.filter((m) => m.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.memories, context.previous);
      }
      toast.error(errorMessage(err, "删除失败"));
    },
    onSuccess: () => toast.success("已删除"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.memories });
    },
  });

  const submit = () => {
    const text = content.trim();
    if (!text || addMutation.isPending) return;
    addMutation.mutate(text);
    setContent("");
  };

  const memories = query.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-2">
        开启记忆的模型会自动保存/检索你的偏好,也可手动管理
      </p>

      <div className="flex gap-2">
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="添加一条记忆,如:我喜欢简洁的回答"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <Button
          variant="outline"
          disabled={!content.trim() || addMutation.isPending}
          onClick={submit}
        >
          添加
        </Button>
      </div>

      {query.isPending && <PageLoading text="加载记忆…" />}
      {query.isError && (
        <div className="flex flex-col items-center gap-2 py-12">
          <p className="text-sm text-danger">
            {errorMessage(query.error, "加载失败")}
          </p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            重试
          </Button>
        </div>
      )}
      {query.isSuccess && memories.length === 0 && (
        <p className="py-12 text-center text-sm text-text-3">暂无记忆</p>
      )}

      {memories.length > 0 && (
        <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border bg-surface">
          {memories.map((m) => (
            <div key={m.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words text-text">{m.content}</p>
                <p className="mt-0.5 text-xs text-text-3">
                  {formatDateTime(m.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(m.id)}
              >
                删除
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
