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
} from "lucide-react";
import { getDataService } from "@/lib/data";
import { clientRandomUUID } from "@/lib/client-id";
import type { ChatStyle, McpServer, MemoryEntry, User } from "@/lib/types";
import {
  optimisticInsertRecord,
  optimisticPatchRecords,
  optimisticRemoveRecord,
} from "@/lib/optimistic-query";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { useUiStore } from "@/stores/ui-store";
import { toast } from "sonner";

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="设置" description="账户、界面、记忆、回复风格与连接器" />
      <Tabs defaultValue="account">
        <TabsList className="mb-1">
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
  const { messageRailEnabled, setMessageRailEnabled } = useUiStore();
  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getDataService().getCurrentUser(),
  });
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (user) Promise.resolve().then(() => setName(user.name));
  }, [user]);

  if (!user) return null;

  const save = async () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const optimistic = optimisticPatchRecords<User>(
      queryClient,
      [["current-user"]],
      user.id,
      { name: cleanName }
    );
    try {
      const saved = await getDataService().updateProfile({ name: cleanName });
      optimistic.reconcile(saved);
      toast.success("已保存");
    } catch (error) {
      optimistic.rollback();
      setName(user.name);
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-5 shadow-[var(--shadow-card)]">
        <Avatar name={user.name} src={user.avatarUrl} className="size-14 text-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        {user.role === "admin" && <Badge className="shrink-0">管理员</Badge>}
      </Card>

      <Card className="space-y-4 p-5 shadow-[var(--shadow-card)]">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            昵称
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1"
            />
            <Button className="btn-brand" onClick={save} disabled={!name.trim() || name === user.name}>
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

      <Card className="space-y-3 p-5 shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium">界面</p>
        <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">聊天消息导航条</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              在聊天页右侧显示消息导航，点击可跳转到对应用户消息。
            </p>
          </div>
          <Switch
            checked={messageRailEnabled}
            onCheckedChange={setMessageRailEnabled}
            aria-label="启用聊天消息导航条"
          />
        </div>
      </Card>

      <Card className="space-y-3 p-5 shadow-[var(--shadow-card)]">
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
  const [deleteTarget, setDeleteTarget] = React.useState<MemoryEntry | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const { data: memories = [] } = useQuery({
    queryKey: ["memories"],
    queryFn: () => getDataService().listMemories(),
  });

  const add = async () => {
    const content = newMemory.trim();
    if (!content) return;
    const now = new Date().toISOString();
    const temporary: MemoryEntry = {
      id: `optimistic-memory-${clientRandomUUID()}`,
      content,
      createdAt: now,
      updatedAt: now,
      clientMutationState: "pending",
    };
    const optimistic = optimisticInsertRecord<MemoryEntry>(
      queryClient,
      [["memories"]],
      temporary
    );
    setNewMemory("");
    try {
      const saved = await getDataService().saveMemory({ content });
      optimistic.reconcile(saved);
      toast.success("记忆已添加");
    } catch (error) {
      optimistic.rollback();
      setNewMemory(content);
      toast.error(error instanceof Error ? error.message : "记忆添加失败");
    }
  };

  const remove = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const target = deleteTarget;
    const optimistic = optimisticRemoveRecord<MemoryEntry>(
      queryClient,
      [["memories"]],
      target.id
    );
    setDeleteTarget(null);
    try {
      await getDataService().deleteMemory(target.id);
      toast.success("记忆已删除");
    } catch (e) {
      optimistic.rollback();
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        模型会在对话中自动记录关于你的偏好与事实，也会在新对话中回忆相关内容。你可以随时删除任何一条。
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={newMemory}
          onChange={(e) => setNewMemory(e.target.value)}
          placeholder="手动添加一条记忆，例如：我偏好简洁的回答"
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="min-w-0 flex-1"
        />
        <Button className="btn-brand" onClick={add} disabled={!newMemory.trim()}>
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
            <Card key={m.id} className="group flex items-start gap-3 px-4 py-3 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
              <BrainIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{m.content}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatRelativeTime(m.updatedAt)}
                  {m.clientMutationState === "pending" && " · 保存中…"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`删除记忆「${m.content.slice(0, 32)}」`}
                onClick={() => setDeleteTarget(m)}
                className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2Icon className="size-4" />
              </button>
            </Card>
          ))}
        </div>
      )}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="删除记忆"
        description={`将删除这条记忆：「${deleteTarget?.content ?? ""}」。此操作不可撤销。`}
        deleting={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        onConfirm={remove}
      />
    </div>
  );
}

// ---------- 回复风格 ----------

function StylesTab() {
  const queryClient = useQueryClient();
  const { defaultReplyStyleId, setDefaultReplyStyleId } = useUiStore();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", description: "", prompt: "" });
  const [deleteTarget, setDeleteTarget] = React.useState<ChatStyle | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const { data: styles = [] } = useQuery({
    queryKey: ["styles"],
    queryFn: () => getDataService().listStyles(),
  });
  const effectiveDefaultStyleId =
    styles.find((style) => style.id === defaultReplyStyleId)?.id ??
    styles.find((style) => style.id === "style-normal")?.id ??
    styles[0]?.id ??
    "";

  const save = async () => {
    const temporary: ChatStyle = {
      id: `optimistic-style-${clientRandomUUID()}`,
      name: form.name.trim(),
      description: form.description.trim(),
      prompt: form.prompt,
      builtIn: false,
      clientMutationState: "pending",
    };
    const optimistic = optimisticInsertRecord<ChatStyle>(
      queryClient,
      [["styles"]],
      temporary
    );
    setEditorOpen(false);
    setForm({ name: "", description: "", prompt: "" });
    try {
      const saved = await getDataService().saveStyle(form);
      optimistic.reconcile(saved);
      toast.success("风格已创建");
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "风格创建失败");
    }
  };

  const remove = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const target = deleteTarget;
    const optimistic = optimisticRemoveRecord<ChatStyle>(
      queryClient,
      [["styles"]],
      target.id
    );
    setDeleteTarget(null);
    try {
      await getDataService().deleteStyle(target.id);
      toast.success("风格已删除");
    } catch (e) {
      optimistic.rollback();
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          风格决定回复的语气与详略，新对话会使用你选择的默认风格。
        </p>
        <Button size="sm" className="btn-brand self-start" onClick={() => setEditorOpen(true)}>
          <PlusIcon /> 自定义风格
        </Button>
      </div>
      {styles.length > 0 && (
        <Card className="space-y-2 p-4 shadow-[var(--shadow-card)]">
          <label className="text-sm font-medium">默认回复风格</label>
          <Select
            value={effectiveDefaultStyleId}
            onValueChange={setDefaultReplyStyleId}
            options={styles.map((style) => ({
              value: style.id,
              label: style.name,
            }))}
            className="max-w-xs"
          />
        </Card>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {styles.map((s) => (
          <Card key={s.id} className="group p-4 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-lift)]">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-medium">
                {s.name}
                {s.clientMutationState === "pending" && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    保存中…
                  </span>
                )}
              </h3>
              {s.builtIn ? (
                <Badge variant="outline">内置</Badge>
              ) : (
                <button
                  type="button"
                  aria-label={`删除回复风格「${s.name}」`}
                  onClick={() => setDeleteTarget(s)}
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
      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="删除回复风格"
        description={`将删除回复风格「${deleteTarget?.name ?? ""}」。此操作不可撤销。`}
        deleting={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        onConfirm={remove}
      />
    </div>
  );
}

// ---------- 用户级 MCP ----------

function McpTab() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<McpServer | null>(null);
  const [deleting, setDeleting] = React.useState(false);
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
    const temporary: McpServer = {
      id: `optimistic-mcp-${clientRandomUUID()}`,
      scope: "user",
      name: form.name.trim(),
      url: form.url.trim(),
      transport: form.transport,
      enabled: false,
      status: "unknown",
      tools: [],
      clientMutationState: "pending",
    };
    const optimistic = optimisticInsertRecord<McpServer>(
      queryClient,
      [["mcp-servers", "user"]],
      temporary
    );
    setAddOpen(false);
    setForm({ name: "", url: "", transport: "streamable-http" });
    try {
      const saved = await getDataService().saveMcpServer({
        ...form,
        name: form.name.trim(),
        url: form.url.trim(),
        scope: "user",
      });
      optimistic.reconcile(saved);
      toast.success("MCP 服务器已添加");
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "添加失败");
    }
  };

  const test = async (id: string) => {
    setTesting(id);
    const result = await getDataService().testMcpServer(id);
    setTesting(null);
    queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    if (result.ok) toast.success(`连接成功，发现 ${result.tools.length} 个工具`);
    else toast.error(result.error ?? "连接失败");
  };

  const remove = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const target = deleteTarget;
    const optimistic = optimisticRemoveRecord<McpServer>(
      queryClient,
      [["mcp-servers"]],
      target.id
    );
    setDeleteTarget(null);
    try {
      await getDataService().deleteMcpServer(target.id);
      toast.success("MCP 服务器已删除");
    } catch (e) {
      optimistic.rollback();
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const toggle = async (server: McpServer) => {
    const enabled = !server.enabled;
    const optimistic = optimisticPatchRecords<McpServer>(
      queryClient,
      [["mcp-servers"]],
      server.id,
      { enabled }
    );
    try {
      const saved = await getDataService().saveMcpServer({
        id: server.id,
        name: server.name,
        url: server.url,
        transport: server.transport,
        scope: server.scope,
        enabled,
      });
      optimistic.reconcile(saved);
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          添加你自己的 MCP 服务器，其工具仅对你可用，可在对话工具面板中启停。
        </p>
        <Button size="sm" className="btn-brand self-start" onClick={() => setAddOpen(true)}>
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
            <Card key={s.id} className="group p-4 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-lift)]">
              <div className="flex flex-wrap items-center gap-3">
                <PlugIcon className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {s.name}
                    {s.clientMutationState === "pending" && (
                      <span className="text-xs font-normal text-muted-foreground">
                        添加中…
                      </span>
                    )}
                    {s.status === "connected" && (
                      <CheckCircle2Icon className="size-3.5 text-success" />
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{s.url}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={() => toggle(s)}
                    aria-label={`${s.enabled ? "停用" : "启用"} MCP 服务器「${s.name}」`}
                  />
                  <button
                    type="button"
                    aria-label={`删除 MCP 服务器「${s.name}」`}
                    onClick={() => setDeleteTarget(s)}
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </div>
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
      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="删除 MCP 服务器"
        description={`将删除 MCP 服务器「${deleteTarget?.name ?? ""}」。此操作不可撤销。`}
        deleting={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        onConfirm={remove}
      />
    </div>
  );
}

function DeleteConfirmDialog({
  open,
  title,
  description,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="settings-delete-description">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id="settings-delete-description">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={deleting} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="destructive" disabled={deleting} onClick={onConfirm}>
            {deleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
