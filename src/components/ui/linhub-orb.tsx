"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * LinHub 的动态视觉标记。WebView 壳与网页共用这一实现，避免 Android
 * 新对话页和 Web 新对话页维护两套不同的品牌动画。
 */
export function LinHubOrb({ className }: { className?: string }) {
  return (
    <motion.div
      aria-hidden="true"
      className={cn(
        "relative mx-auto size-[52px] overflow-hidden rounded-full shadow-[0_8px_28px_color-mix(in_srgb,var(--primary)_20%,transparent)]",
        className
      )}
      style={{
        background:
          "radial-gradient(circle at 42% 38%, var(--primary) 0%, color-mix(in srgb, var(--primary) 72%, #8b6fc9) 48%, color-mix(in srgb, var(--primary) 8%, transparent) 100%)",
      }}
      animate={{ scale: [1, 1.035, 1], rotate: [0, 2.5, 0] }}
      transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
    >
      <motion.span
        className="absolute size-2 rounded-full bg-white/45"
        animate={{ left: ["28%", "42%", "28%"], top: ["24%", "38%", "24%"] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}
