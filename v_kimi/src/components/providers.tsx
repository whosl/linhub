"use client";

import * as React from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PwaRegister } from "@/components/pwa-register";

/** 跟随 next-themes 的 toast：玻璃拟态 + 圆角 + 阴影，亮/暗双主题自动切换 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-center"
      richColors
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{
        classNames: {
          toast:
            "rounded-xl! backdrop-blur-xl! [border-color:var(--glass-border)]! [box-shadow:var(--shadow-lift)]!",
          title: "text-foreground!",
          description: "text-muted-foreground!",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={350}>
          {children}
          <ThemedToaster />
          <PwaRegister />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
