"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "glass-strong z-50 overflow-hidden rounded-lg px-2.5 py-1.5 text-xs text-foreground animate-in fade-in-0 zoom-in-95",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/** 简化用法：<Tooltip label="提示"><button/></Tooltip> */
function Tooltip({
  label,
  children,
  side,
  shortcut,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  shortcut?: string;
}) {
  return (
    <TooltipRoot delayDuration={350}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span className="flex items-center gap-1.5">
          {label}
          {shortcut && (
            <kbd className="rounded bg-foreground/10 px-1 font-mono text-[10px] text-muted-foreground">
              {shortcut}
            </kbd>
          )}
        </span>
      </TooltipContent>
    </TooltipRoot>
  );
}

export { Tooltip, TooltipRoot, TooltipTrigger, TooltipContent, TooltipProvider };
