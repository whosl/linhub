"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getDataService } from "@/lib/data";

/** 未登录时跳转登录页（mock 模式下 getCurrentUser 恒有值，不会触发） */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading } = useQuery({
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
  if (user === null) return null;
  return <>{children}</>;
}
