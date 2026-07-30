import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UNAUTHORIZED_EVENT } from "@/api/http";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { Toaster } from "@/components/ui/toast";
import { queryClient } from "@/lib/query-client";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ChatPage from "@/pages/chat/ChatPage";
import { AdminPage } from "@/pages/admin/AdminPage";
import { BillingPage } from "@/pages/billing/BillingPage";
import { FilesPage } from "@/pages/files/FilesPage";
import { KnowledgePage } from "@/pages/knowledge/KnowledgePage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { ProjectDetailPage } from "@/pages/projects/ProjectDetailPage";
import { ProjectsPage } from "@/pages/projects/ProjectsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { SkillsPage } from "@/pages/skills/SkillsPage";
import SharedArtifactPage from "@/pages/SharedArtifactPage";
import { useAuthStore } from "@/stores/auth-store";
import { applyTheme, useUiStore } from "@/stores/ui-store";

/** 监听 401 广播:清用户态并跳转登录页 */
function UnauthorizedListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const onUnauthorized = () => {
      useAuthStore.getState().markUnauthenticated();
      navigate("/login", { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate]);
  return null;
}

/** 启动时应用持久化主题,并跟随系统变化(system 模式) */
function ThemeInitializer() {
  useEffect(() => {
    applyTheme(useUiStore.getState().theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (useUiStore.getState().theme === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeInitializer />
        <UnauthorizedListener />
        <Toaster />
        <Routes>
          {/* 无外壳 */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          {/* 公开分享页 */}
          <Route path="/share/artifact/:token" element={<SharedArtifactPage />} />
          {/* 外壳内(需登录) */}
          <Route element={<AuthGuard />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<ChatPage />} />
              <Route path="/chat/:id" element={<ChatPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/knowledge" element={<KnowledgePage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/files" element={<FilesPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>
          {/* 兜底 */}
          <Route
            path="*"
            element={<PlaceholderPage title="页面不存在" description="请检查地址是否正确。" />}
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
