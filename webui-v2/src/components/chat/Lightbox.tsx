// 图片灯箱:全屏遮罩,Esc / 点击关闭;可选「局部重绘」入口

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function Lightbox({
  src,
  alt,
  onClose,
  onEdit,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
  /** 提供时显示「局部重绘」按钮 */
  onEdit?: () => void;
}) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);

  if (!src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt ?? "查看图片"}
        className="max-h-full max-w-full rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-black/50 text-lg text-white hover:bg-black/70"
      >
        ✕
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm text-white transition-colors hover:bg-black/80"
        >
          🖌 局部重绘
        </button>
      )}
    </div>,
    document.body,
  );
}
