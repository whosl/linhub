// 管理后台:供应商 / 模型与计价 / 套餐 / 用户 / 技能审核 / 系统设置
// 非 admin 显示"无权限访问"并跳回 /

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { PageLoading } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { useAuthStore } from "@/stores/auth-store";
import { ModelsTab } from "./ModelsTab";
import { PlansTab } from "./PlansTab";
import { ProvidersTab } from "./ProvidersTab";
import { SettingsTab } from "./SettingsTab";
import { SkillsReviewTab } from "./SkillsReviewTab";
import { UsersTab } from "./UsersTab";

type AdminTabKey =
  | "providers"
  | "models"
  | "plans"
  | "users"
  | "skills"
  | "settings";

export function AdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const [tab, setTab] = useState<AdminTabKey>("providers");

  const denied = user !== null && user.role !== "admin";

  // 非 admin:短暂展示后跳回首页
  useEffect(() => {
    if (!denied) return;
    const timer = setTimeout(() => navigate("/", { replace: true }), 1500);
    return () => clearTimeout(timer);
  }, [denied, navigate]);

  if (status === "idle" || status === "loading") {
    return <PageLoading />;
  }

  if (denied) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-text-2">无权限访问,即将跳回首页…</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/", { replace: true })}
        >
          返回首页
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        <header>
          <h1 className="text-xl font-semibold text-text">管理后台</h1>
          <p className="mt-0.5 text-sm text-text-2">
            供应商、模型计价、套餐、用户与系统配置
          </p>
        </header>

        <Tabs
          tabs={[
            { value: "providers", label: "供应商" },
            { value: "models", label: "模型与计价" },
            { value: "plans", label: "套餐" },
            { value: "users", label: "用户" },
            { value: "skills", label: "技能审核" },
            { value: "settings", label: "系统设置" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as AdminTabKey)}
        />

        {tab === "providers" && <ProvidersTab />}
        {tab === "models" && <ModelsTab />}
        {tab === "plans" && <PlansTab />}
        {tab === "users" && <UsersTab />}
        {tab === "skills" && <SkillsReviewTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
