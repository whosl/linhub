"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  MessageSquareIcon,
  Trash2Icon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import type { MediaAsset } from "@/lib/types";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/misc";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { toast } from "sonner";

type FilterKind = "all" | "upload" | "generated";

const FILTERS: { id: FilterKind; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "upload", label: "上传" },
  { id: "generated", label: "生成" },
];

function isImage(mime: string) {
  return mime.startsWith("image/");
}

function kindLabel(kind: MediaAsset["kind"]) {
  if (kind === "upload") return "上传";
  if (kind === "edited") return "编辑";
  return "生成";
}

export default function FilesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<FilterKind>("all");
  const [deleteTarget, setDeleteTarget] = React.useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["media-assets", filter],
    queryFn: () =>
      getDataService().listMediaAssets({
        kind: filter === "all" ? "all" : filter,
        limit: 100,
      }),
  });

  const items = data?.items ?? [];
  const images = items.filter((a) => isImage(a.mimeType));
  const docs = items.filter((a) => !isImage(a.mimeType));

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await getDataService().deleteMediaAsset(deleteTarget.id);
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
      toast.success("已删除");
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageContainer wide>
      <PageHeader
        title="文件"
        description="查看上传与生成的图片、文档等媒体资产"
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileIcon />}
          title="还没有文件"
          description="上传附件或让模型生成图片后，会显示在这里。"
        />
      ) : (
        <div className="space-y-8">
          {images.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ImageIcon className="size-4" />
                图片（{images.length}）
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {images.map((asset, i) => (
                  <motion.div
                    key={asset.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.25 }}
                    className="group relative overflow-hidden rounded-xl border bg-card"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="truncate text-xs text-white">{asset.name}</p>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <span className="text-[10px] text-white/80">
                          {kindLabel(asset.kind)} · {formatRelativeTime(asset.createdAt)}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {asset.conversationId && (
                            <Link
                              href={`/chat/${asset.conversationId}`}
                              className="rounded p-1 text-white/90 hover:bg-white/20"
                              title="打开会话"
                            >
                              <MessageSquareIcon className="size-3.5" />
                            </Link>
                          )}
                          <button
                            type="button"
                            aria-label="删除"
                            onClick={() => setDeleteTarget(asset)}
                            className="rounded p-1 text-white/90 hover:bg-white/20"
                          >
                            <Trash2Icon className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {docs.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileTextIcon className="size-4" />
                文档（{docs.length}）
              </h2>
              <ul className="divide-y rounded-xl border">
                {docs.map((asset) => (
                  <li
                    key={asset.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileTextIcon className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{asset.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {kindLabel(asset.kind)} · {formatBytes(asset.size)} ·{" "}
                        {formatRelativeTime(asset.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {asset.conversationId && (
                        <Link
                          href={`/chat/${asset.conversationId}`}
                          className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <MessageSquareIcon className="size-3.5" />
                          会话
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(asset)}
                        aria-label="删除"
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除文件？"
        description={
          deleteTarget
            ? `确定删除「${deleteTarget.name}」？此操作不可恢复。`
            : ""
        }
        confirmLabel="删除"
        loading={deleting}
        onConfirm={confirmDelete}
        destructive
      />
    </PageContainer>
  );
}
