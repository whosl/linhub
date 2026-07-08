"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

export function CopyFallbackDialog({
  text,
  onClose,
}: {
  text: string | null;
  onClose: () => void;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const open = text !== null;

  React.useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, text]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogTitle>手动复制</DialogTitle>
        <DialogDescription>
          当前浏览器禁止自动复制，请复制下方已选中的内容。
        </DialogDescription>
        <textarea
          ref={textareaRef}
          readOnly
          value={text ?? ""}
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
          className="max-h-[55vh] min-h-40 w-full resize-y rounded-lg border bg-muted/40 p-3 font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring/40"
        />
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            关闭
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
