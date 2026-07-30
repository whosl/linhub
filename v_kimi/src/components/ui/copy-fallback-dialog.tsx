"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
          className="glow-focus max-h-[55vh] min-h-40 w-full resize-y rounded-xl border bg-muted/40 p-3 font-mono text-sm leading-relaxed outline-none transition-[border-color,box-shadow]"
        />
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
