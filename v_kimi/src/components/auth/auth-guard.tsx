"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getDataService } from "@/lib/data";

/** 未登录时跳转登录页（mock 模式下 getCurrentUser 恒有值，不会触发） */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading, error, refetch } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getDataService().getCurrentUser(),
    retry: false,
  });

  React.useEffect(() => {
    if (!isLoading && user === null) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <span className="flex size-10 animate-pulse items-center justify-center rounded-2xl bg-primary font-serif text-lg text-primary-foreground">
          L
        </span>
      </div>
    );
  }
  // I17: 网络错误（非未登录）时显示错误态 + 重试，而非白屏
  if (error && user === undefined) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-muted-foreground">
          无法连接到服务器，请检查网络后重试。
        </p>
        <button
          onClick={() => void refetch()}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
        >
          重试
        </button>
      </div>
    );
  }
  if (user === null) return null;
  return <>{children}</>;
}
