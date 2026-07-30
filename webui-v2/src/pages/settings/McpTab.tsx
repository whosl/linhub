import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteMcpServer,
  getMcpServers,
  saveMcpServer,
  settingsKeys,
  testMcpServer,
  type McpServer,
  type McpServerInput,
} from "@/api/settings";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { PageLoading } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "./SettingsPage";

const STATUS_LABELS: Record<McpServer["status"], string> = {
  connected: "已连接",
  error: "连接异常",
  unknown: "未测试",
};

const TRANSPORT_LABELS: Record<McpServer["transport"], string> = {
  sse: "SSE",
  "streamable-http": "HTTP",
};

/** MCP 连接器 Tab:列表 / 添加编辑 / 测试连接 / 启停 / 删除 */
export function McpTab() {
  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<McpServer | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McpServer | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: settingsKeys.mcp,
    queryFn: getMcpServers,
  });

  const saveMutation = useMutation({
    mutationFn: (input: McpServerInput) => saveMcpServer(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.mcp });
      const previous = queryClient.getQueryData<McpServer[]>(settingsKeys.mcp);
      queryClient.setQueryData<McpServer[]>(settingsKeys.mcp, (old = []) => {
        if (input.id) {
          return old.map((s) =>
            s.id === input.id
              ? {
                  ...s,
                  name: input.name,
                  url: input.url,
                  transport: input.transport,
                  enabled: input.enabled ?? s.enabled,
                }
              : s,
          );
        }
        const optimistic: McpServer = {
          id: `temp-${Date.now()}`,
          scope: "user",
          name: input.name,
          url: input.url,
          transport: input.transport,
          enabled: input.enabled ?? true,
          status: "unknown",
        };
        return [...old, optimistic];
      });
      return { previous };
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.mcp, context.previous);
      }
      toast.error(errorMessage(err, "保存失败"));
    },
    onSuccess: () => {
      toast.success("已保存");
      setEditTarget(null);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.mcp });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (server: McpServer) =>
      saveMcpServer({
        id: server.id,
        name: server.name,
        url: server.url,
        transport: server.transport,
        enabled: !server.enabled,
      }),
    onMutate: async (server) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.mcp });
      const previous = queryClient.getQueryData<McpServer[]>(settingsKeys.mcp);
      queryClient.setQueryData<McpServer[]>(settingsKeys.mcp, (old = []) =>
        old.map((s) =>
          s.id === server.id ? { ...s, enabled: !server.enabled } : s,
        ),
      );
      return { previous };
    },
    onError: (err, _server, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.mcp, context.previous);
      }
      toast.error(errorMessage(err, "操作失败"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.mcp });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMcpServer(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.mcp });
      const previous = queryClient.getQueryData<McpServer[]>(settingsKeys.mcp);
      queryClient.setQueryData<McpServer[]>(settingsKeys.mcp, (old = []) =>
        old.filter((s) => s.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.mcp, context.previous);
      }
      toast.error(errorMessage(err, "删除失败"));
    },
    onSuccess: () => {
      toast.success("已删除");
      setDeleteTarget(null);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.mcp });
    },
  });

  const testConnection = async (server: McpServer) => {
    if (testingId) return;
    setTestingId(server.id);
    try {
      const result = await testMcpServer(server.id);
      if (result.ok) {
        toast.success(`连接成功,${result.tools?.length ?? 0} 个工具`);
        void queryClient.invalidateQueries({ queryKey: settingsKeys.mcp });
      } else {
        toast.error(result.error || "连接失败");
      }
    } catch (err) {
      toast.error(errorMessage(err, "连接失败"));
    } finally {
      setTestingId(null);
    }
  };

  const servers = query.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-2">
          连接 MCP 服务器,让模型可以调用外部工具
        </p>
        <Button size="sm" onClick={() => setEditTarget("new")}>
          添加连接器
        </Button>
      </div>

      {query.isPending && <PageLoading text="加载连接器…" />}
      {query.isError && (
        <div className="flex flex-col items-center gap-2 py-12">
          <p className="text-sm text-danger">
            {errorMessage(query.error, "加载失败")}
          </p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            重试
          </Button>
        </div>
      )}
      {query.isSuccess && servers.length === 0 && (
        <p className="py-12 text-center text-sm text-text-3">
          暂无 MCP 连接器
        </p>
      )}

      {servers.length > 0 && (
        <div className="flex flex-col gap-3">
          {servers.map((server) => (
            <div
              key={server.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-center gap-2">
                <h3 className="min-w-0 truncate text-sm font-semibold text-text">
                  {server.name}
                </h3>
                <Badge>{TRANSPORT_LABELS[server.transport]}</Badge>
                <Badge
                  tone={
                    server.status === "connected"
                      ? "success"
                      : server.status === "error"
                        ? "danger"
                        : "default"
                  }
                >
                  {STATUS_LABELS[server.status]}
                </Badge>
                <div className="flex-1" />
                <Switch
                  checked={server.enabled}
                  onChange={() => toggleMutation.mutate(server)}
                  disabled={toggleMutation.isPending}
                  label={`启用 ${server.name}`}
                />
              </div>
              <p className="mt-1 truncate text-xs text-text-3">{server.url}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-text-3">
                  {server.tools ? `${server.tools.length} 个工具` : "工具未知"}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={testingId !== null}
                    onClick={() => void testConnection(server)}
                  >
                    {testingId === server.id ? "测试中…" : "测试连接"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditTarget(server)}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    onClick={() => setDeleteTarget(server)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <McpEditDialog
          target={editTarget}
          pending={saveMutation.isPending}
          onClose={() => setEditTarget(null)}
          onSubmit={(input) => saveMutation.mutate(input)}
        />
      )}

      {deleteTarget && (
        <Dialog
          open
          onClose={() => setDeleteTarget(null)}
          title="删除连接器"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "删除中…" : "删除"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-text">
            确定删除「{deleteTarget.name}」吗?聊天中将无法再用它的工具。
          </p>
        </Dialog>
      )}
    </div>
  );
}

interface McpEditDialogProps {
  target: McpServer | "new";
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: McpServerInput) => void;
}

function McpEditDialog({ target, pending, onClose, onSubmit }: McpEditDialogProps) {
  const isNew = target === "new";
  const [name, setName] = useState(isNew ? "" : target.name);
  const [url, setUrl] = useState(isNew ? "" : target.url);
  const [transport, setTransport] = useState<McpServer["transport"]>(
    isNew ? "streamable-http" : target.transport,
  );

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl || pending) return;
    onSubmit({
      id: isNew ? undefined : target.id,
      name: trimmedName,
      url: trimmedUrl,
      transport,
      enabled: isNew ? true : target.enabled,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? "添加 MCP 连接器" : "编辑 MCP 连接器"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim() || !url.trim() || pending}
          >
            {pending ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-2">名称</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如:内部文档检索"
            maxLength={50}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-2">服务器 URL</span>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-2">传输方式</span>
          <select
            value={transport}
            onChange={(e) =>
              setTransport(e.target.value as McpServer["transport"])
            }
            className={cn(
              "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text",
              "focus-visible:outline-2 focus-visible:outline-primary",
            )}
          >
            <option value="streamable-http">Streamable HTTP</option>
            <option value="sse">SSE</option>
          </select>
        </label>
      </div>
    </Dialog>
  );
}
