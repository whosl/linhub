"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainIcon,
  CheckCircle2Icon,
  DownloadIcon,
  Loader2Icon,
  PlugIcon,
  PlusIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import type { McpServer } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Select,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { toast } from "sonner";

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="设置" description="账户、记忆、回复风格与连接器" />
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">账户</TabsTrigger>
          <TabsTrigger value="memory">记忆</TabsTrigger>
          <TabsTrigger value="styles">回复风格</TabsTrigger>
          <TabsTrigger value="mcp">MCP 连接器</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
        <TabsContent value="memory">
          <MemoryTab />
        </TabsContent>
        <TabsContent value="styles">
          <StylesTab />
        </TabsContent>
        <TabsContent value="mcp">
          <McpTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ---------- 账户 ----------

function AccountTab() {
  const queryClient = useQueryClient();
  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getDataService().getCurrentUser(),
  });
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  if (!user) return null;

  const save = async () => {
    await getDataService().updateProfile({ name });
    queryClient.invalidateQueries({ queryKey: ["current-user"] });
    toast.success("已保存");
  };

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={user.name} src={user.avatarUrl} className="size-14 text-xl" />
        <div className="flex-1">
          <p className="font-medium">{user.name}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        {user.role === "admin" && <Badge>管理员</Badge>}
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            昵称
          </label>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={save} disabled={!name.trim() || name === user.name}>
              保存
            </Button>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            修改密码
          </label>
          <Button
            variant="outline"
            onClick={() => toast.info("P2 接入认证后可修改密码")}
          >
            修改密码
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <p className="text-sm font-medium">数据</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => toast.info("将导出全部会话为 Markdown（P2 后可用）")}>
            <DownloadIcon /> 导出数据
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => toast.info("P2 接入认证后可删除账户")}
          >
            <Trash2Icon /> 删除账户
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------- 记忆 ----------

function MemoryTab() {
  const queryClient = useQueryClient();
  const [newMemory, setNewMemory] = React.useState("");
  const { data: memories = [] } = useQuery({
    queryKey: ["memories"],
    queryFn: () => getDataService().listMemories(),
  });

  const add = async () => {
    if (!newMemory.trim()) return;
    await getDataService().saveMemory({ content: newMemory.trim() });
    queryClient.invalidateQueries({ queryKey: ["memories"] });
    setNewMemory("");
    toast.success("记忆已添加");
  };

  const remove = async (id: string) => {
    await getDataService().deleteMemory(id);
    queryClient.invalidateQueries({ queryKey: ["memories"] });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        模型会在对话中自动记录关于你的偏好与事实，也会在新对话中回忆相关内容。你可以随时删除任何一条。
      </p>
      <div className="flex gap-2">
        <Input
          value={newMemory}
          onChange={(e) => setNewMemory(e.target.value)}
          placeholder="手动添加一条记忆，例如：我偏好简洁的回答"
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add} disabled={!newMemory.trim()}>
          <PlusIcon /> 添加
        </Button>
      </div>
      {memories.length === 0 ? (
        <EmptyState
          icon={<BrainIcon />}
          title="还没有记忆"
          description="随着对话进行，模型会自动积累对你的了解。"
        />
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <Card key={m.id} className="group flex items-start gap-3 px-4 py-3">
              <BrainIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{m.content}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatRelativeTime(m.updatedAt)}
                </p>
              </div>
              <button
                onClick={() => remove(m.id)}
                className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2Icon className="size-4" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- 回复风格 ----------

function StylesTab() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", description: "", prompt: "" });
  const { data: styles = [] } = useQuery({
    queryKey: ["styles"],
    queryFn: () => getDataService().listStyles(),
  });

  const save = async () => {
    await getDataService().saveStyle(form);
    queryClient.invalidateQueries({ queryKey: ["styles"] });
    setEditorOpen(false);
    setForm({ name: "", description: "", prompt: "" });
    toast.success("风格已创建");
  };

  const remove = async (id: string) => {
    await getDataService().deleteStyle(id);
    queryClient.invalidateQueries({ queryKey: ["styles"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          风格决定回复的语气与详略，可在输入框随时切换。
        </p>
        <Button size="sm" onClick={() => setEditorOpen(true)}>
          <PlusIcon /> 自定义风格
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {styles.map((s) => (
          <Card key={s.id} className="group p-4">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-medium">{s.name}</h3>
              {s.builtIn ? (
                <Badge variant="outline">内置</Badge>
              ) : (
                <button
                  onClick={() => remove(s.id)}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
          </Card>
        ))}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>自定义回复风格</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="风格名称"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="一句话描述"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <Textarea
              placeholder="风格指令，例如：回答要简短犀利，多用比喻…"
              rows={4}
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={!form.name.trim() || !form.prompt.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- 用户级 MCP ----------

function McpTab() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: "",
    url: "",
    transport: "streamable-http" as McpServer["transport"],
  });

  const { data: servers = [] } = useQuery({
    queryKey: ["mcp-servers", "user"],
    queryFn: () => getDataService().listMcpServers("user"),
  });

  const add = async () => {
    await getDataService().saveMcpServer({ ...form, scope: "user" });
    queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    setAddOpen(false);
    setForm({ name: "", url: "", transport: "streamable-http" });
    toast.success("MCP 服务器已添加");
  };

  const test = async (id: string) => {
    setTesting(id);
    const result = await getDataService().testMcpServer(id);
    setTesting(null);
    queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    if (result.ok) toast.success(`连接成功，发现 ${result.tools.length} 个工具`);
    else toast.error(result.error ?? "连接失败");
  };

  const remove = async (id: string) => {
    await getDataService().deleteMcpServer(id);
    queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
  };

  const toggle = async (server: McpServer) => {
    await getDataService().saveMcpServer({ ...server, enabled: !server.enabled });
    queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          添加你自己的 MCP 服务器，其工具仅对你可用，可在对话工具面板中启停。
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <PlusIcon /> 添加服务器
        </Button>
      </div>

      {servers.length === 0 ? (
        <EmptyState
          icon={<PlugIcon />}
          title="还没有自定义 MCP 服务器"
          description="连接 Notion、飞书或任何支持 MCP 协议的服务，让模型调用它们的工具。"
        />
      ) : (
        <div className="space-y-2">
          {servers.map((s) => (
            <Card key={s.id} className="group p-4">
              <div className="flex items-center gap-3">
                <PlugIcon className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {s.name}
                    {s.status === "connected" && (
                      <CheckCircle2Icon className="size-3.5 text-success" />
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{s.url}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => test(s.id)}
                  disabled={testing === s.id}
                >
                  {testing === s.id ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    "测试连接"
                  )}
                </Button>
                <Switch checked={s.enabled} onCheckedChange={() => toggle(s)} />
                <button
                  onClick={() => remove(s.id)}
                  className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2Icon className="size-4" />
                </button>
              </div>
              {s.tools.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 pl-7">
                  {s.tools.map((t) => (
                    <Badge key={t.name} variant="secondary">
                      {t.name}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加 MCP 服务器</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="名称，例如：我的 Notion"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="服务器 URL（https://…/mcp）"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <Select
              value={form.transport}
              onValueChange={(v) =>
                setForm({ ...form, transport: v as McpServer["transport"] })
              }
              options={[
                { value: "streamable-http", label: "Streamable HTTP" },
                { value: "sse", label: "SSE" },
              ]}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button onClick={add} disabled={!form.name.trim() || !form.url.trim()}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
