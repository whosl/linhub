import { cn } from "@/lib/cn";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** 最大宽度类,默认 max-w-sm */
  widthClassName?: string;
}

/** 遮罩 + 居中卡片,Esc 关闭 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  widthClassName,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "w-full rounded-xl border border-border bg-surface p-5 shadow-lg",
          widthClassName ?? "max-w-sm",
        )}
      >
        {title && (
          <h2 className="mb-3 text-base font-semibold text-text">{title}</h2>
        )}
        <div className="text-sm text-text">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
