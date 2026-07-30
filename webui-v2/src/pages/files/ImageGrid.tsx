// 图片区:响应式网格缩略图,hover 显示名称与操作(预览/删除)

import { useMediaUrl, type MediaAsset } from "@/api/media";
import { cn } from "@/lib/cn";

export function ImageGrid({
  assets,
  onPreview,
  onDelete,
}: {
  assets: MediaAsset[];
  onPreview: (asset: MediaAsset) => void;
  onDelete: (asset: MediaAsset) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((asset) => (
        <ImageCard
          key={asset.id}
          asset={asset}
          onPreview={() => onPreview(asset)}
          onDelete={() => onDelete(asset)}
        />
      ))}
    </div>
  );
}

function ImageCard({
  asset,
  onPreview,
  onDelete,
}: {
  asset: MediaAsset;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const src = useMediaUrl(asset.id, asset.url);

  return (
    <div
      className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-2"
      onClick={onPreview}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onPreview();
      }}
    >
      {src ? (
        <img
          src={src}
          alt={asset.name}
          loading="lazy"
          className="size-full object-cover transition-transform group-hover:scale-105"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-xs text-text-3">
          加载中…
        </div>
      )}
      {/* hover 遮罩:名称 + 操作 */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2.5",
          "opacity-0 transition-opacity group-hover:opacity-100",
        )}
      >
        <p className="truncate text-xs font-medium text-white">{asset.name}</p>
        <div className="mt-1.5 flex gap-1.5">
          <button
            type="button"
            className="rounded-md bg-white/20 px-2 py-1 text-xs text-white backdrop-blur hover:bg-white/30"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
          >
            预览
          </button>
          <button
            type="button"
            className="rounded-md bg-white/20 px-2 py-1 text-xs text-white backdrop-blur hover:bg-danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
