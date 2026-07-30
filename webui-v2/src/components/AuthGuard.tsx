import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { PageLoading } from "@/components/ui/Spinner";
import { useAuthStore } from "@/stores/auth-store";

/**
 * 认证守卫:
 * - 首次进入 bootstrap(token + GET /api/me)
 * - 未登录 → /login
 * - 网络错误 → 重试态
 */
export function AuthGuard() {
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    if (status === "idle") {
      void bootstrap();
    }
  }, [status, bootstrap]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="min-h-full bg-bg">
        <PageLoading text="正在验证登录状态…" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-bg px-4">
        <p className="text-sm text-text-2">{error ?? "网络错误,无法验证登录状态"}</p>
        <Button variant="outline" onClick={() => void bootstrap()}>
          重试
        </Button>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
