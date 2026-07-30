// 工具面板:内置工具开关 / 知识库多选 / MCP(全局自动启用 + 用户逐台)/ 智能路由总开关
// 状态全部落在 ui-store.chatTools(持久化),发送时随消息一起提交

import { useQuery } from "@tanstack/react-query";
import { getKnowledgeBases, getMcpServers } from "@/api/chat-options";
import type { ChatToolToggles } from "@/api/types";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/ui-store";

const BUILTIN_TOGGLES: Array<{
  key: "webSearch" | "imageGeneration" | "codeRunner" | "knowledgeSearch";
  label: string;
  icon: string;
  description: string;
}> = [
  { key: "webSearch", label: "联网搜索", icon: "🔎", description: "搜索网页获取最新信息" },
  { key: "imageGeneration", label: "生成图片", icon: "🎨", description: "根据描述生成图片" },
  { key: "codeRunner", label: "运行代码", icon: "⚡", description: "在沙箱中执行代码" },
  { key: "knowledgeSearch", label: "知识库检索", icon: "📚", description: "检索你的知识库文档" },
];

export function ToolControlsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const tools = useUiStore((s) => s.chatTools);
  const setChatTools = useUiStore((s) => s.setChatTools);
  const routing = tools.autoRouting ?? false;

  const update = (patch: Partial<ChatToolToggles>) =>
    setChatTools({ ...tools, ...patch });

  const { data: knowledgeBases, isLoading: kbLoading } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: getKnowledgeBases,
    enabled: open && tools.knowledgeSearch,
    staleTime: 60_000,
  });
  const { data: globalMcp } = useQuery({
    queryKey: ["mcp", "global"],
    queryFn: () => getMcpServers("global"),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: userMcp } = useQuery({
    queryKey: ["mcp", "user"],
    queryFn: () => getMcpServers("user"),
    enabled: open,
    staleTime: 60_000,
  });

  const toggleKb = (id: string) => {
    const set = new Set(tools.knowledgeBaseIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    update({ knowledgeBaseIds: [...set] });
  };

  const toggleMcp = (id: string) => {
    const set = new Set(tools.mcpServerIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    update({ mcpServerIds: [...set] });
  };

  return (
    <Dialog open={open} onClose={onClose} title="工具" widthClassName="max-w-md">
      <div className="flex flex-col gap-4">
        {/* 智能路由总开关 */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-text">智能路由</p>
            <p className="text-xs text-text-2">
              {routing ? "由模型自动选择工具" : "手动选择要启用的工具"}
            </p>
          </div>
          <Switch
            checked={routing}
            onChange={(v) => update({ autoRouting: v })}
            label="智能路由"
          />
        </div>

        <fieldset disabled={routing} className={cn(routing && "opacity-50")}>
          <div className="flex flex-col gap-1">
            <p className="mb-1 text-xs font-medium text-text-3">内置工具</p>
            {BUILTIN_TOGGLES.map((t) => (
              <div
                key={t.key}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2"
              >
                <div className="flex items-center gap-2.5">
                  <span aria-hidden>{t.icon}</span>
                  <div>
                    <p className="text-sm text-text">{t.label}</p>
                    <p className="text-xs text-text-3">{t.description}</p>
                  </div>
                </div>
                <Switch
                  checked={tools[t.key]}
                  onChange={(v) => update({ [t.key]: v })}
                  label={t.label}
                  disabled={routing}
                />
              </div>
            ))}
          </div>

          {/* 知识库多选 */}
          {tools.knowledgeSearch && (
            <div className="mt-2 rounded-xl border border-border p-2">
              <p className="mb-1 px-1 text-xs font-medium text-text-3">
                选择知识库
              </p>
              {kbLoading ? (
                <div className="flex justify-center py-3 text-text-3">
                  <Spinner className="size-4" />
                </div>
              ) : !knowledgeBases || knowledgeBases.length === 0 ? (
                <p className="px-1 py-2 text-xs text-text-3">
                  暂无知识库,可先在「知识库」页创建
                </p>
              ) : (
                knowledgeBases.map((kb) => (
                  <label
                    key={kb.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={tools.knowledgeBaseIds.includes(kb.id)}
                      onChange={() => toggleKb(kb.id)}
                      className="size-3.5 accent-primary"
                    />
                    <span className="truncate">{kb.name}</span>
                  </label>
                ))
              )}
            </div>
          )}

          {/* MCP */}
          <div className="mt-3 flex flex-col gap-1">
            <p className="mb-1 text-xs font-medium text-text-3">MCP 服务器</p>
            {(globalMcp ?? []).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">{s.name}</p>
                  <p className="truncate text-xs text-text-3">{s.url}</p>
                </div>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-2">
                  自动启用
                </span>
              </div>
            ))}
            {(userMcp ?? []).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">{s.name}</p>
                  <p className="truncate text-xs text-text-3">{s.url}</p>
                </div>
                <Switch
                  checked={tools.mcpServerIds.includes(s.id)}
                  onChange={() => toggleMcp(s.id)}
                  label={s.name}
                  disabled={routing}
                />
              </div>
            ))}
            {(globalMcp ?? []).length === 0 && (userMcp ?? []).length === 0 && (
              <p className="px-2 py-1 text-xs text-text-3">
                暂无 MCP 服务器,可在「设置」中添加
              </p>
            )}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

/** 已启用工具的摘要徽标(Composer 触发按钮旁显示) */
export function toolToggleSummary(tools: ChatToolToggles): string {
  if (tools.autoRouting) return "智能路由";
  const on: string[] = [];
  if (tools.webSearch) on.push("联网");
  if (tools.imageGeneration) on.push("生图");
  if (tools.codeRunner) on.push("代码");
  if (tools.knowledgeSearch) on.push("知识库");
  on.push(...Array(tools.mcpServerIds.length).fill("MCP"));
  return on.length > 0 ? on.join("·") : "";
}
