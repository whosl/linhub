import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/** 纯 CSS hover tooltip */
export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2",
          "rounded-md bg-text px-2 py-1 text-xs whitespace-nowrap text-bg opacity-0",
          "transition-opacity group-hover/tip:opacity-100",
        )}
      >
        {content}
      </span>
    </span>
  );
}
