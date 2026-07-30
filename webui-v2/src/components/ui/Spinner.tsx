import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      role="status"
      aria-label="加载中"
    />
  );
}

/** 居中整页加载态 */
export function PageLoading({ text = "加载中…" }: { text?: string }) {
  return (
    <div className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-3 text-text-2">
      <Spinner className="size-6" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
