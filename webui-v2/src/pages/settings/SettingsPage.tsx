import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { AccountTab } from "./AccountTab";
import { McpTab } from "./McpTab";
import { MemoriesTab } from "./MemoriesTab";
import { StylesTab } from "./StylesTab";

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

type SettingsTab = "account" | "memories" | "styles" | "mcp";

/** 设置页:账户 / 记忆 / 回复风格 / MCP 连接器 */
export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("account");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
        <header>
          <h1 className="text-xl font-semibold text-text">设置</h1>
          <p className="mt-0.5 text-sm text-text-2">
            管理账户、记忆、回复风格与 MCP 连接器
          </p>
        </header>

        <Tabs
          tabs={[
            { value: "account", label: "账户" },
            { value: "memories", label: "记忆" },
            { value: "styles", label: "回复风格" },
            { value: "mcp", label: "MCP 连接器" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as SettingsTab)}
        />

        {tab === "account" && <AccountTab />}
        {tab === "memories" && <MemoriesTab />}
        {tab === "styles" && <StylesTab />}
        {tab === "mcp" && <McpTab />}
      </div>
    </div>
  );
}
