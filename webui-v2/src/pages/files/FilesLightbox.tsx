// 图片灯箱:全屏预览 + 名称/大小/时间 + 来源对话入口
// 不复用 chat/Lightbox:它需要额外的元信息区与「查看来源对话」链接,而共享组件不可改

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useMediaUrl, type MediaAsset } from "@/api/media";
import { formatDateTime, formatSize } from "./format";

export function FilesLightbox({
  asset,
  onClose,
}: {
  asset: MediaAsset | null;
  onClose: () => void;
}) {
  const src = useMediaUrl(asset?.id ?? null, asset?.url);

  useEffect(() => {
    if (!asset) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asset, onClose]);

  if (!asset) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-black/50 text-lg text-white hover:bg-black/70"
      >
        ✕
      </button>
      <div
        className="flex max-h-full max-w-full flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {src ? (
          <img
            src={src}
            alt={asset.name}
            className="max-h-[75vh] max-w-full rounded-xl object-contain"
          />
        ) : (
          <div className="flex h-40 w-64 items-center justify-center rounded-xl bg-black/40 text-sm text-white/70">
            图片加载中…
          </div>
        )}
        <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full bg-black/60 px-4 py-2 text-sm text-white">
          <span className="max-w-64 truncate font-medium">{asset.name}</span>
          <span className="text-white/70">{formatSize(asset.size)}</span>
          <span className="text-white/70">{formatDateTime(asset.createdAt)}</span>
          {asset.conversationId && (
            <Link
              to={`/chat/${asset.conversationId}`}
              className="font-medium text-white underline underline-offset-2 hover:text-white/80"
              onClick={onClose}
            >
              查看来源对话
            </Link>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
