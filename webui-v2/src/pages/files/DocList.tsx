// 文档区:列表行 + 点击预览 Dialog(拉取 metadata,展示提取文本/来源对话/删除)

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getMediaMetadata, type MediaAsset } from "@/api/media";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateTime, formatSize } from "./format";

/** 按 mimeType 选一个文件图标 */
function fileIcon(mimeType: string): string {
  if (mimeType.includes("pdf")) return "📕";
  if (mimeType.includes("word") || mimeType.includes("officedocument.word")) return "📘";
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return "📊";
  if (mimeType.includes("text") || mimeType.includes("markdown")) return "📄";
  return "📁";
}

export function DocList({
  assets,
  onPreview,
}: {
  assets: MediaAsset[];
  onPreview: (asset: MediaAsset) => void;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {assets.map((asset) => (
        <li key={asset.id}>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
            onClick={() => onPreview(asset)}
          >
            <span className="text-xl" aria-hidden>
              {fileIcon(asset.mimeType)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text">
                {asset.name}
              </span>
              <span className="block text-xs text-text-3">{asset.mimeType}</span>
            </span>
            <span className="shrink-0 text-xs text-text-2">{formatSize(asset.size)}</span>
            <span className="hidden shrink-0 text-xs text-text-3 sm:block">
              {formatDateTime(asset.createdAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DocPreviewDialog({
  asset,
  onClose,
  onDelete,
}: {
  asset: MediaAsset | null;
  onClose: () => void;
  onDelete: (asset: MediaAsset) => void;
}) {
  const id = asset?.id ?? null;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["media-metadata", id],
    queryFn: () => getMediaMetadata(id as string),
    enabled: id !== null,
  });

  const detail = data ?? asset;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <Dialog
      open={asset !== null}
      onClose={onClose}
      title={asset?.name}
      widthClassName="max-w-2xl"
    >
      {asset && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
            <span>{asset.mimeType}</span>
            <span>{formatSize(asset.size)}</span>
            <span>{formatDateTime(asset.createdAt)}</span>
          </div>

          {/* 提取文本 */}
          <div>
            <h3 className="mb-1.5 text-sm font-medium text-text">提取文本</h3>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-2">
                <Spinner /> 加载中…
              </div>
            ) : isError ? (
              <p className="text-sm text-danger">详情加载失败,请稍后重试</p>
            ) : detail?.extractedText ? (
              <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap text-text">
                {detail.extractedText}
              </pre>
            ) : (
              <p className="text-sm text-text-3">暂无提取文本</p>
            )}
          </div>

          {/* 操作区 */}
          <div className="flex items-center justify-between gap-2">
            {detail?.conversationId ? (
              <Link
                to={`/chat/${detail.conversationId}`}
                className="text-sm font-medium text-primary hover:underline"
                onClick={onClose}
              >
                查看来源对话 →
              </Link>
            ) : (
              <span />
            )}
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-2">确认删除该文件?</span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    onDelete(asset);
                    setConfirmingDelete(false);
                    onClose();
                  }}
                >
                  删除
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                  取消
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)}>
                删除
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
