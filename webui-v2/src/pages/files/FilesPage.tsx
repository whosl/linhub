// 文件中心:图片网格 + 文档列表,支持搜索(防抖)/类型筛选/游标分页/删除(乐观更新)

import { useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  deleteMedia,
  listMedia,
  type MediaAsset,
  type MediaKindFilter,
  type MediaListResponse,
} from "@/api/media";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { PageLoading, Spinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/toast";
import { DocList, DocPreviewDialog } from "./DocList";
import { FilesLightbox } from "./FilesLightbox";
import { ImageGrid } from "./ImageGrid";

const KIND_TABS = [
  { value: "all", label: "全部" },
  { value: "upload", label: "上传" },
  { value: "generated", label: "生成" },
  { value: "edited", label: "编辑" },
];

const PAGE_SIZE = 30;

export function FilesPage() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<MediaKindFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");

  // 预览/删除目标
  const [lightboxAsset, setLightboxAsset] = useState<MediaAsset | null>(null);
  const [docAsset, setDocAsset] = useState<MediaAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);

  // 搜索防抖 300ms
  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useInfiniteQuery({
    queryKey: ["files", kind, q],
    queryFn: ({ pageParam }) =>
      listMedia({ kind, q: q || undefined, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMedia(id),
    // 乐观移除:所有筛选维度的缓存同步剔除,失败回滚
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["files"] });
      const snapshots = queryClient.getQueriesData<InfiniteData<MediaListResponse>>({
        queryKey: ["files"],
      });
      queryClient.setQueriesData<InfiniteData<MediaListResponse>>(
        { queryKey: ["files"] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((p) => ({
                  ...p,
                  items: p.items.filter((item) => item.id !== id),
                })),
              }
            : old,
      );
      return { snapshots };
    },
    onError: (err, _id, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(err instanceof Error ? err.message : "删除失败,请稍后重试");
    },
    onSuccess: () => toast.success("已删除"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["files"] }),
  });

  /** 删除入口:skipConfirm 用于文档预览 Dialog 内已二次确认的场景 */
  const handleDelete = (asset: MediaAsset, skipConfirm = false) => {
    if (skipConfirm) {
      deleteMutation.mutate(asset.id);
    } else {
      setDeleteTarget(asset);
    }
  };

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  // 分两组:图片 / 文档,组内按时间倒序
  const { images, docs } = useMemo(() => {
    const byTimeDesc = (a: MediaAsset, b: MediaAsset) =>
      b.createdAt.localeCompare(a.createdAt);
    return {
      images: items.filter((i) => i.mimeType.startsWith("image/")).sort(byTimeDesc),
      docs: items.filter((i) => !i.mimeType.startsWith("image/")).sort(byTimeDesc),
    };
  }, [items]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
        {/* 页头:标题 + 搜索 + 筛选 */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold text-text">文件</h1>
          <div className="w-full sm:w-72">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索文件名…"
              aria-label="搜索文件"
            />
          </div>
        </header>
        <div className="w-full sm:w-80">
          <Tabs tabs={KIND_TABS} value={kind} onChange={(v) => setKind(v as MediaKindFilter)} />
        </div>

        {/* 内容 */}
        {query.isLoading ? (
          <PageLoading />
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-text-2">
            <p>加载失败,请稍后重试</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <p className="text-sm text-text-2">
              暂无文件,在对话中上传或生成图片后会出现在这里
            </p>
          </div>
        ) : (
          <>
            {images.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-medium text-text-2">图片</h2>
                <ImageGrid
                  assets={images}
                  onPreview={setLightboxAsset}
                  onDelete={(a) => handleDelete(a)}
                />
              </section>
            )}
            {docs.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-medium text-text-2">文档</h2>
                <DocList assets={docs} onPreview={setDocAsset} />
              </section>
            )}

            {/* 加载更多 */}
            {query.hasNextPage && (
              <div className="flex justify-center pt-2 pb-4">
                <Button
                  variant="outline"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? (
                    <>
                      <Spinner /> 加载中…
                    </>
                  ) : (
                    "加载更多"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 图片灯箱 */}
      <FilesLightbox asset={lightboxAsset} onClose={() => setLightboxAsset(null)} />

      {/* 文档预览 */}
      <DocPreviewDialog
        asset={docAsset}
        onClose={() => setDocAsset(null)}
        onDelete={(a) => handleDelete(a, true)}
      />

      {/* 删除确认 */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="删除文件"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </>
        }
      >
        确定要删除「{deleteTarget?.name}」吗?此操作不可撤销。
      </Dialog>
    </div>
  );
}
