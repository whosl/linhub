"use client";

import { motion } from "motion/react";
import { AmbientBackground } from "@/components/ui/ambient-background";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-dvh items-center justify-center bg-background px-4">
      <AmbientBackground />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.21, 1.02, 0.73, 1] }}
        className="glass-strong w-full max-w-sm rounded-3xl p-8"
      >
        <div className="mb-8 text-center">
          <span className="btn-brand mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl font-serif text-xl animate-breathe">
            L
          </span>
          <h1 className="text-gradient font-serif text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
