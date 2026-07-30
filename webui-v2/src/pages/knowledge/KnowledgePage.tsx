import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteKnowledgeBase,
  knowledgeKeys,
  listKnowledgeBases,
  type KnowledgeBase,
} from "@/api/knowledge";
import { Button } from "@/components/ui/Button";
import { PageLoading } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { DocumentPanel } from "./DocumentPanel";
import { KnowledgeBaseList } from "./KnowledgeBaseList";
import { NewKnowledgeBaseDialog } from "./NewKnowledgeBaseDialog";
import { errorMessage } from "./utils";

/** 知识库页:左侧知识库列表(约 280px)+ 右侧文档面板 */
export function KnowledgePage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingKb, setDeletingKb] = useState<KnowledgeBase | null>(null);

  const basesQuery = useQuery({
    queryKey: knowledgeKeys.bases,
    queryFn: listKnowledgeBases,
  });

  const bases = basesQuery.data ?? [];
  // 选中的知识库被删除(或乐观回滚)后自动落空,右侧回到未选中态
  const selected = bases.find((kb) => kb.id === selectedId) ?? null;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKnowledgeBase(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: knowledgeKeys.bases });
      const previous = queryClient.getQueryData<KnowledgeBase[]>(
        knowledgeKeys.bases,
      );
      queryClient.setQueryData<KnowledgeBase[]>(knowledgeKeys.bases, (old) =>
        (old ?? []).filter((kb) => kb.id !== id),
      );
      queryClient.removeQueries({ queryKey: knowledgeKeys.documents(id) });
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(knowledgeKeys.bases, context.previous);
      }
      toast.error(errorMessage(err, "删除知识库失败"));
    },
    onSuccess: () => {
      toast.success("知识库已删除");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.bases });
    },
  });

  // 全部为空:整页空态
  if (basesQuery.isSuccess && bases.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
        <BookIcon className="size-12 text-text-3" />
        <p className="text-base text-text-2">
          创建第一个知识库,让 AI 基于你的文档回答
        </p>
        <Button onClick={() => setCreateOpen(true)}>新建知识库</Button>
        <NewKnowledgeBaseDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(kb) => setSelectedId(kb.id)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧:知识库列表 */}
      <aside className="flex w-70 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-sm font-semibold text-text">知识库</h1>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            新建知识库
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {basesQuery.isLoading ? (
            <PageLoading />
          ) : basesQuery.isError ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-text-2">
              <p>加载失败</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void basesQuery.refetch()}
              >
                重试
              </Button>
            </div>
          ) : (
            <KnowledgeBaseList
              bases={bases}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={setDeletingKb}
            />
          )}
        </div>
      </aside>

      {/* 右侧:文档面板 / 未选中空态 */}
      {selected ? (
        <DocumentPanel key={selected.id} kb={selected} />
      ) : (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-sm text-text-3">选择或创建一个知识库</p>
        </div>
      )}

      <NewKnowledgeBaseDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(kb) => setSelectedId(kb.id)}
      />
      <ConfirmDialog
        open={deletingKb !== null}
        title="删除知识库"
        description={`确定删除「${deletingKb?.name ?? ""}」吗?将同时删除其中所有文档,且无法恢复。`}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deletingKb) {
            deleteMutation.mutate(deletingKb.id);
            setDeletingKb(null);
          }
        }}
        onClose={() => setDeletingKb(null)}
      />
    </div>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
