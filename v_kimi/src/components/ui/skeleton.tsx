import { cn } from "@/lib/utils";

/** 骨架屏块:shimmer 动画,替代加载 spinner */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}
