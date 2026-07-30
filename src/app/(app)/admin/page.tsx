"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clientRandomUUID } from "@/lib/client-id";
import {
  AlertCircleIcon,
  BotIcon,
  CheckCircleIcon,
  CheckIcon,
  CoinsIcon,
  DownloadIcon,
  GlobeIcon,
  ImageIcon,
  KeyIcon,
  Loader2Icon,
  MicIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  ServerIcon,
  Trash2Icon,
  UsersIcon,
  Volume2Icon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import type {
  AppSettings,
  LedgerEntry,
  Model,
  ModelCapability,
  McpServer,
  EngineId,
  Plan,
  Provider,
  ProviderKind,
  RemoteModel,
  UsageRecord,
  User,
} from "@/lib/types";
import {
  optimisticInsertRecord,
  optimisticPatchQuery,
  optimisticPatchRecords,
  optimisticRemoveRecord,
} from "@/lib/optimistic-query";
import { cn, formatCents, formatRelativeTime, formatTokens } from "@/lib/utils";
import { formatQuotaCents, isUnlimitedQuota } from "@/lib/billing-plan";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";

const PROVIDER_KINDS: { value: ProviderKind; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "zhipu", label: "智谱 GLM" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "xiaomi", label: "Xiaomi MiMo" },
  { value: "xiaomi-token-plan", label: "Xiaomi MiMo (Token Plan)" },
];

export default function AdminPage() {
  const router = useRouter();
  const { data: user, isLoading, error, refetch } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getDataService().getCurrentUser(),
    retry: false,
  });

  if (isLoading) {
    return (
      <PageContainer wide>
        <div className="flex min-h-[45vh] items-center justify-center">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer wide>
        <EmptyState
          icon={<AlertCircleIcon />}
          title="无法确认权限"
          description="请检查服务器连接后重试。"
          action={<Button onClick={() => void refetch()}>重试</Button>}
        />
      </PageContainer>
    );
  }

  if (user?.role !== "admin") {
    return (
      <PageContainer wide>
        <EmptyState
          icon={<AlertCircleIcon />}
          title="无权访问"
          description="当前账号没有管理后台权限。"
          action={
            <Button variant="outline" onClick={() => router.replace("/")}>
              返回首页
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer wide>
      <PageHeader
        title="管理后台"
        description="供应商、模型计价、套餐与系统设置 — 普通用户即开即用"
      />
      <Tabs defaultValue="providers">
        <TabsList className="justify-start">
          <TabsTrigger value="providers">供应商</TabsTrigger>
          <TabsTrigger value="models">模型与计价</TabsTrigger>
          <TabsTrigger value="plans">套餐</TabsTrigger>
          <TabsTrigger value="users">用户</TabsTrigger>
          <TabsTrigger value="skills">技能审核</TabsTrigger>
          <TabsTrigger value="settings">系统设置</TabsTrigger>
        </TabsList>
        <TabsContent value="providers">
          <ProvidersTab />
        </TabsContent>
        <TabsContent value="models">
          <ModelsTab />
        </TabsContent>
        <TabsContent value="plans">
          <PlansAdminTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="skills">
          <SkillReviewTab />
        </TabsContent>
        <TabsContent value="settings">
          <SystemSettingsTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ---------- 供应商 ----------

function ProvidersTab() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Provider | null>(null);
  const [fetchingFor, setFetchingFor] = React.useState<Provider | null>(null);
  const [testingProvider, setTestingProvider] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    kind: "openai" as ProviderKind,
    name: "",
    baseUrl: "",
    apiKey: "",
    storeEnabled: true,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: () => getDataService().admin.listProviders(),
  });

  const openEditor = (p?: Provider) => {
    setEditing(p ?? null);
    setForm({
      kind: p?.kind ?? "openai",
      name: p?.name ?? "",
      baseUrl: p?.baseUrl ?? "",
      apiKey: "",
      storeEnabled: p?.storeEnabled ?? true,
    });
    setEditorOpen(true);
  };

  const save = async () => {
    await getDataService().admin.saveProvider({
      id: editing?.id,
      kind: form.kind,
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim() || undefined,
      apiKey: form.apiKey.trim() || undefined,
      storeEnabled: form.storeEnabled,
    });
    queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
    setEditorOpen(false);
    toast.success("供应商已保存");
  };

  const toggle = async (p: Provider) => {
    const enabled = !p.enabled;
    const optimistic = optimisticPatchRecords<Provider>(
      queryClient,
      [["admin-providers"]],
      p.id,
      { enabled }
    );
    try {
      const saved = await getDataService().admin.saveProvider({ ...p, enabled });
      optimistic.reconcile(saved);
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "供应商状态更新失败");
    }
  };

  // 测试连接：调拉取模型接口，成功说明 endpoint + key 都通
  const testConnection = async (p: Provider) => {
    setTestingProvider(p.id);
    try {
      const res = await fetch(`/api/admin/providers/${p.id}/models`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `请求失败（${res.status}）`);
      }
      const models = (await res.json()) as RemoteModel[];
      toast.success(`连接正常，发现 ${models.length} 个模型`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTestingProvider(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => openEditor()}>
          <PlusIcon /> 添加供应商
        </Button>
      </div>
      {providers.map((p) => (
        <Card key={p.id} className="flex items-center gap-3 p-4">
          <KeyIcon className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {p.name}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {p.kind}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {p.apiKeyMasked ?? "未配置密钥"}
              {p.baseUrl && ` · ${p.baseUrl}`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!p.apiKeyMasked || testingProvider === p.id}
            onClick={() => testConnection(p)}
          >
            {testingProvider === p.id ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <CheckCircleIcon />
            )}
            测试
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!p.apiKeyMasked}
            onClick={() => setFetchingFor(p)}
          >
            <DownloadIcon /> 获取模型
          </Button>
          <Button
            type="button"
            aria-label={`编辑供应商「${p.name}」`}
            variant="ghost"
            size="icon-sm"
            onClick={() => openEditor(p)}
          >
            <PencilIcon />
          </Button>
          <Switch checked={p.enabled} onCheckedChange={() => toggle(p)} />
        </Card>
      ))}

      <FetchModelsDialog
        provider={fetchingFor}
        onClose={() => setFetchingFor(null)}
      />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑供应商" : "添加供应商"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select
              value={form.kind}
              onValueChange={(v) => setForm({ ...form, kind: v as ProviderKind })}
              options={PROVIDER_KINDS}
            />
            <Input
              placeholder="展示名称"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="API Key（留空则不修改）"
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
            <Input
              placeholder="自定义 Base URL（可选，用于中转）"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
            {form.kind === "openai" && (
              <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                <span className="text-sm">
                  Responses API 持久化
                  <span className="ml-1 text-xs text-muted-foreground">
                    （中转网关需关闭，否则 reasoning 模型多步工具会 404）
                  </span>
                </span>
                <Switch
                  checked={form.storeEnabled}
                  onCheckedChange={(v) => setForm({ ...form, storeEnabled: v })}
                />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={!form.name.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 从供应商 API 拉取模型列表，勾选后批量添加 */
function FetchModelsDialog({
  provider,
  onClose,
}: {
  provider: Provider | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const { data: remote, isLoading, error } = useQuery({
    queryKey: ["remote-models", provider?.id],
    queryFn: () => getDataService().admin.listRemoteModels(provider!.id),
    enabled: !!provider,
    retry: false,
  });

  React.useEffect(() => {
    Promise.resolve().then(() => {
      setSelected(new Set());
      setFilter("");
    });
  }, [provider?.id]);

  if (!provider) return null;

  const list = (remote ?? []).filter((m) =>
    m.slug.toLowerCase().includes(filter.trim().toLowerCase())
  );
  const addable = list.filter((m) => !m.added);

  const toggleSlug = (m: RemoteModel) => {
    if (m.added) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m.slug)) next.delete(m.slug);
      else next.add(m.slug);
      return next;
    });
  };

  const addSelected = async () => {
    setAdding(true);
    try {
      const { added } = await getDataService().admin.addRemoteModels(
        provider.id,
        [...selected]
      );
      toast.success(
        `已添加 ${added} 个模型（默认停用），请到「模型与计价」设置价格后启用`
      );
      queryClient.invalidateQueries({ queryKey: ["admin-models"] });
      queryClient.invalidateQueries({ queryKey: ["remote-models", provider.id] });
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={!!provider} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>从 {provider.name} 获取模型</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> 正在请求供应商模型列表…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "拉取失败"}
            <p className="mt-1 text-xs text-muted-foreground">
              请检查该供应商的 API Key 与 Base URL 是否正确、网络是否可达。
            </p>
          </div>
        ) : (
          <>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="筛选模型名…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                共 {list.length} 个 · 已选 {selected.size} 个
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={() =>
                    setSelected(new Set(addable.map((m) => m.slug)))
                  }
                >
                  全选未添加
                </button>
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={() => setSelected(new Set())}
                >
                  清空
                </button>
              </div>
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border p-1.5">
              {list.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  没有匹配的模型
                </p>
              )}
              {list.map((m) => (
                <label
                  key={m.slug}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    m.added ? "cursor-default opacity-60" : "hover:bg-accent"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={m.added || selected.has(m.slug)}
                    disabled={m.added}
                    onChange={() => toggleSlug(m)}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {m.slug}
                  </span>
                  {m.displayName && m.displayName !== m.slug && (
                    <span className="truncate text-xs text-muted-foreground">
                      {m.displayName}
                    </span>
                  )}
                  {m.added && <Badge variant="secondary">已添加</Badge>}
                </label>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={addSelected} disabled={selected.size === 0 || adding}>
            {adding && <Loader2Icon className="animate-spin" />}
            添加所选（{selected.size}）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- 模型与计价 ----------

function ModelsTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Model | null>(null);
  const [testingModel, setTestingModel] = React.useState<string | null>(null);

  const { data: models = [] } = useQuery({
    queryKey: ["admin-models"],
    queryFn: () => getDataService().admin.listAllModels(),
  });

  // 测试单个模型是否可调用（发极简 ping）
  const testModel = async (m: Model) => {
    setTestingModel(m.id);
    try {
      const res = await fetch(`/api/admin/models/${m.id}/test`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; message?: string; error?: string };
      if (data.ok) toast.success(data.message ?? "测试成功");
      else toast.error(data.error ?? "测试失败");
    } catch {
      toast.error("网络错误");
    } finally {
      setTestingModel(null);
    }
  };

  const toggle = async (m: Model) => {
    const enabled = !m.enabled;
    const optimistic = optimisticPatchRecords<Model>(
      queryClient,
      [["admin-models"], ["models"]],
      m.id,
      { enabled }
    );
    try {
      const saved = await getDataService().admin.saveModel({ id: m.id, enabled });
      optimistic.reconcile(saved);
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "模型状态更新失败");
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-models"] });
    queryClient.invalidateQueries({ queryKey: ["models"] });
    // 模型增删后丢弃远端列表缓存，避免「获取模型」对话框显示过期的已添加标记
    queryClient.removeQueries({ queryKey: ["remote-models"] });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        在「供应商」页用「获取模型」拉取并添加模型；新添加的模型默认停用，设好计价后再启用。
      </p>
      <div className="space-y-2 md:hidden">
        {models.map((m) => (
          <Card key={m.id} className="space-y-3 p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{m.displayName}</p>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {m.slug}
                </p>
              </div>
              <Badge variant={m.tier === "pro" ? "default" : "secondary"}>
                {m.tier === "pro" ? "Pro" : "免费"}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{m.providerKind}</Badge>
              {m.capabilities.map((c) => (
                <Badge key={c} variant="secondary">
                  {CAPABILITY_LABELS[c] ?? c}
                </Badge>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">输入 /M</p>
                <p className="mt-0.5 font-medium tabular-nums">
                  {formatCents(m.inputPricePerM)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">输出 /M</p>
                <p className="mt-0.5 font-medium tabular-nums">
                  {m.pricePerImage
                    ? `${formatCents(m.pricePerImage)}/图`
                    : formatCents(m.outputPricePerM)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">上下文</p>
                <p className="mt-0.5 font-medium tabular-nums">
                  {formatTokens(m.contextWindow)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  aria-label={`启用模型「${m.displayName}」`}
                  checked={m.enabled}
                  onCheckedChange={() => toggle(m)}
                />
                启用
              </label>
              <ModelActions
                model={m}
                testingModel={testingModel}
                onTest={testModel}
                onEdit={setEditing}
              />
            </div>
          </Card>
        ))}
      </div>

      <Card className="hidden overflow-x-auto md:block">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">模型</th>
              <th className="px-3 py-2.5 font-medium">供应商</th>
              <th className="px-3 py-2.5 font-medium">能力</th>
              <th className="px-3 py-2.5 font-medium">分级</th>
              <th className="px-3 py-2.5 text-right font-medium">输入 /M</th>
              <th className="px-3 py-2.5 text-right font-medium">输出 /M</th>
              <th className="px-3 py-2.5 text-right font-medium">上下文</th>
              <th className="px-3 py-2.5 text-center font-medium">启用</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-b last:border-b-0 hover:bg-accent/30">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{m.displayName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{m.slug}</p>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {m.providerKind}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {m.capabilities.map((c) => (
                      <Badge key={c} variant="secondary">
                        {CAPABILITY_LABELS[c] ?? c}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={m.tier === "pro" ? "default" : "secondary"}>
                    {m.tier === "pro" ? "Pro" : "免费"}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatCents(m.inputPricePerM)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {m.pricePerImage
                    ? `${formatCents(m.pricePerImage)}/图`
                    : formatCents(m.outputPricePerM)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatTokens(m.contextWindow)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Switch
                    aria-label={`启用模型「${m.displayName}」`}
                    checked={m.enabled}
                    onCheckedChange={() => toggle(m)}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <ModelActions
                    model={m}
                    testingModel={testingModel}
                    onTest={testModel}
                    onEdit={setEditing}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ModelEditorDialog
        model={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          invalidate();
          setEditing(null);
        }}
      />
    </div>
  );
}

function ModelActions({
  model,
  testingModel,
  onTest,
  onEdit,
}: {
  model: Model;
  testingModel: string | null;
  onTest: (model: Model) => void;
  onEdit: (model: Model) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        aria-label={`测试模型「${model.displayName}」`}
        variant="ghost"
        size="icon-sm"
        disabled={testingModel === model.id}
        onClick={() => onTest(model)}
        title="测试模型可用性"
      >
        {testingModel === model.id ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <ZapIcon />
        )}
      </Button>
      <Button
        type="button"
        aria-label={`编辑模型「${model.displayName}」`}
        variant="ghost"
        size="icon-sm"
        onClick={() => onEdit(model)}
      >
        <PencilIcon />
      </Button>
    </div>
  );
}

const CAPABILITY_LABELS: Record<string, string> = {
  vision: "视觉",
  reasoning: "推理",
  tools: "工具调用",
  "image-generation": "生图",
  "web-search-native": "原生联网",
};

const ALL_CAPABILITIES = Object.keys(CAPABILITY_LABELS) as ModelCapability[];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
        {hint && <span className="ml-1 font-normal opacity-70">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/** 模型详细设置：展示、能力、上下文、计价、分级、排序 */
function ModelEditorDialog({
  model,
  onClose,
  onSaved,
}: {
  model: Model | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState({
    displayName: "",
    description: "",
    capabilities: [] as ModelCapability[],
    contextWindow: 128000,
    maxOutputTokens: "" as string,
    inputPricePerM: 0,
    outputPricePerM: 0,
    pricePerImage: "" as string,
    tier: "free" as Model["tier"],
    sortOrder: 0,
  });
  const [busy, setBusy] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  React.useEffect(() => {
    if (model) {
      Promise.resolve().then(() => {
        setDeleteOpen(false);
        setForm({
          displayName: model.displayName,
          description: model.description ?? "",
          capabilities: [...model.capabilities],
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens?.toString() ?? "",
          inputPricePerM: model.inputPricePerM,
          outputPricePerM: model.outputPricePerM,
          pricePerImage: model.pricePerImage?.toString() ?? "",
          tier: model.tier,
          sortOrder: model.sortOrder ?? 0,
        });
      });
    }
  }, [model]);

  if (!model) return null;

  const isImageModel = form.capabilities.includes("image-generation");

  const toggleCapability = (c: ModelCapability) => {
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(c)
        ? f.capabilities.filter((x) => x !== c)
        : [...f.capabilities, c],
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await getDataService().admin.saveModel({
        id: model.id,
        displayName: form.displayName.trim() || model.slug,
        description: (form.description.trim() || null) as unknown as string | undefined,
        capabilities: form.capabilities,
        contextWindow: Math.max(1000, Math.floor(form.contextWindow) || 128000),
        // 传 null 才能清除已保存的值（undefined 会被 JSON 丢弃）
        maxOutputTokens: (form.maxOutputTokens.trim()
          ? Math.max(1, Math.floor(Number(form.maxOutputTokens)))
          : null) as unknown as number | undefined,
        inputPricePerM: Math.max(0, Math.floor(form.inputPricePerM) || 0),
        outputPricePerM: Math.max(0, Math.floor(form.outputPricePerM) || 0),
        pricePerImage: (form.pricePerImage.trim()
          ? Math.max(0, Math.floor(Number(form.pricePerImage)))
          : null) as unknown as number | undefined,
        tier: form.tier,
        sortOrder: Math.floor(form.sortOrder) || 0,
      });
      toast.success("模型已更新");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await getDataService().admin.deleteModel(model.id);
      toast.success("模型已删除");
      setDeleteOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <Dialog open={!!model} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            编辑模型 <span className="font-mono text-sm">{model.slug}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="展示名">
              <Input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </Field>
            <Field label="排序" hint="（小的在前）">
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm({ ...form, sortOrder: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <Field label="描述" hint="（展示在模型选择器中）">
            <Input
              placeholder="如：旗舰模型，综合能力最强"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          {/* 能力 */}
          <Field label="能力" hint="（决定可用的工具与图片处理方式）">
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map((c) => (
                <label
                  key={c}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    form.capabilities.includes(c)
                      ? "border-primary/60 bg-primary/5 text-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={form.capabilities.includes(c)}
                    onChange={() => toggleCapability(c)}
                  />
                  {CAPABILITY_LABELS[c]}
                </label>
              ))}
            </div>
          </Field>

          {/* 上下文与输出限制 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="上下文窗口" hint="（token）">
              <Input
                type="number"
                value={form.contextWindow}
                onChange={(e) =>
                  setForm({ ...form, contextWindow: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="最大输出" hint="（token，留空=供应商默认）">
              <Input
                type="number"
                placeholder="不限制"
                value={form.maxOutputTokens}
                onChange={(e) =>
                  setForm({ ...form, maxOutputTokens: e.target.value })
                }
              />
            </Field>
          </div>

          {/* 计价 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="输入价格" hint="（分/百万 token）">
              <Input
                type="number"
                value={form.inputPricePerM}
                onChange={(e) =>
                  setForm({ ...form, inputPricePerM: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="输出价格" hint="（分/百万 token）">
              <Input
                type="number"
                value={form.outputPricePerM}
                onChange={(e) =>
                  setForm({ ...form, outputPricePerM: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          {isImageModel && (
            <Field label="每张图片价格" hint="（分/张）">
              <Input
                type="number"
                placeholder="如 30 = ¥0.30/张"
                value={form.pricePerImage}
                onChange={(e) => setForm({ ...form, pricePerImage: e.target.value })}
              />
            </Field>
          )}

          {/* 分级 */}
          <Field label="可用分级">
            <Select
              value={form.tier}
              onValueChange={(v) => setForm({ ...form, tier: v as Model["tier"] })}
              options={[
                { value: "free", label: "免费用户可用" },
                { value: "pro", label: "仅订阅用户" },
              ]}
            />
          </Field>
        </div>

        <DialogFooter className="justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
          >
            <Trash2Icon /> 删除模型
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={deleteOpen}
      onOpenChange={(open) => {
        if (!open && !busy) setDeleteOpen(false);
      }}
      title="删除模型"
      description={`确定删除模型「${model.displayName}」？删除后历史用量记录会保留。`}
      confirmLabel="删除"
      destructive
      loading={busy}
      onConfirm={remove}
    />
    </>
  );
}

// ---------- 套餐 ----------

function PlansAdminTab() {
  const queryClient = useQueryClient();
  const { data: plans = [] } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => getDataService().admin.listAllPlans(),
  });

  const toggle = async (p: Plan) => {
    const enabled = !p.enabled;
    const optimistic = optimisticPatchRecords<Plan>(
      queryClient,
      [["admin-plans"], ["plans"]],
      p.id,
      { enabled }
    );
    try {
      const saved = await getDataService().admin.savePlan({ ...p, enabled });
      optimistic.reconcile(saved);
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "套餐状态更新失败");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {plans.map((p) => (
        <Card key={p.id} className="p-5">
          <div className="flex items-start justify-between">
            <h3 className="font-medium">{p.name}</h3>
            <Switch checked={p.enabled} onCheckedChange={() => toggle(p)} />
          </div>
          <p className="mt-1 text-2xl font-semibold">
            {formatCents(p.priceCentsPerMonth)}
            <span className="text-xs font-normal text-muted-foreground">/月</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            月额度 {formatQuotaCents(p.monthlyQuotaCents)} ·{" "}
            {p.modelTier === "pro" ? "全部模型" : "基础模型"}
          </p>
        </Card>
      ))}
    </div>
  );
}

// ---------- 用户 ----------

function UsersTab() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [grantTarget, setGrantTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [grantYuan, setGrantYuan] = React.useState("10");
  const [granting, setGranting] = React.useState(false);
  const grantInFlightRef = React.useRef(false);
  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getDataService().getCurrentUser(),
  });
  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => getDataService().admin.listUsers(),
  });

  const openGrant = (user: { id: string; name: string }) => {
    setGrantTarget(user);
    setGrantYuan("10");
  };

  const grant = async () => {
    if (!grantTarget) return;
    const amount = Math.round(Number(grantYuan) * 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("请输入有效的赠送金额");
      return;
    }
    if (grantInFlightRef.current) return;
    grantInFlightRef.current = true;
    const target = grantTarget;
    setGranting(true);
    try {
      await getDataService().admin.grantBalance(target.id, amount);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user", target.id] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      toast.success("已赠送");
      setGrantTarget(null);
    } finally {
      grantInFlightRef.current = false;
      setGranting(false);
    }
  };

  return (
    <>
    {selectedUserId ? (
      <UserDetailView
        userId={selectedUserId}
        currentUserId={currentUser?.id}
        onBack={() => setSelectedUserId(null)}
        onGrant={openGrant}
      />
    ) : (
      <Card className="divide-y overflow-hidden">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40"
              onClick={() => setSelectedUserId(u.id)}
            >
              <Avatar name={u.name} src={u.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{u.name}</span>
                  {u.role === "admin" && <Badge>管理员</Badge>}
                  {u.subscription && (
                    <Badge variant="secondary">{u.subscription.planName}</Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {u.email} · 注册于 {formatRelativeTime(u.createdAt)}
                </p>
              </div>
            </button>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="text-sm tabular-nums">{formatCents(u.balance)}</span>
              <Button variant="outline" size="sm" onClick={() => openGrant(u)}>
                <CoinsIcon /> 赠送余额
              </Button>
            </div>
          </div>
        ))}
      </Card>
    )}
    <Dialog
      open={!!grantTarget}
      onOpenChange={(open) => {
        if (!open && !granting) setGrantTarget(null);
      }}
    >
      <DialogContent aria-describedby="grant-balance-description">
        <DialogHeader>
          <DialogTitle>赠送余额</DialogTitle>
          <DialogDescription id="grant-balance-description">
            {grantTarget
              ? `为用户「${grantTarget.name}」赠送余额，金额以元为单位。`
              : "为用户赠送余额，金额以元为单位。"}
          </DialogDescription>
        </DialogHeader>
        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={grantYuan}
          onChange={(event) => setGrantYuan(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void grant();
            }
          }}
          autoFocus
        />
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={granting}
            onClick={() => setGrantTarget(null)}
          >
            取消
          </Button>
          <Button type="button" disabled={granting || !grantYuan.trim()} onClick={() => void grant()}>
            {granting ? "赠送中..." : "赠送"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function UserDetailView({
  userId,
  currentUserId,
  onBack,
  onGrant,
}: {
  userId: string;
  currentUserId?: string;
  onBack: () => void;
  onGrant: (user: { id: string; name: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [planId, setPlanId] = React.useState("");
  const [expiresInDays, setExpiresInDays] = React.useState("30");
  const [savingSubscription, setSavingSubscription] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => getDataService().admin.getUserDetail(userId),
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => getDataService().admin.listAllPlans(),
  });

  React.useEffect(() => {
    if (!detail) return;
    const subscription = detail.user.subscription;
    Promise.resolve().then(() => {
      setPlanId(subscription?.planId ?? "");
      if (subscription?.expiresAt) {
        const days = Math.max(
          1,
          Math.ceil(
            (new Date(subscription.expiresAt).getTime() - Date.now()) /
              86_400_000
          )
        );
        setExpiresInDays(String(days));
      } else {
        setExpiresInDays("30");
      }
    });
  }, [detail]);

  const saveSubscription = async () => {
    const days = Math.round(Number(expiresInDays));
    if (planId && (!Number.isFinite(days) || days <= 0)) {
      toast.error("请输入有效的订阅天数");
      return;
    }
    setSavingSubscription(true);
    try {
      const updated = await getDataService().admin.updateUserSubscription(userId, {
        planId: planId || null,
        expiresInDays: planId ? days : undefined,
      });
      queryClient.setQueryData(["admin-user", userId], updated);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      toast.success(planId ? "订阅已更新" : "订阅已取消");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSavingSubscription(false);
    }
  };

  const deleteUser = async () => {
    if (userId === currentUserId) {
      toast.error("不能删除当前登录账号");
      return;
    }
    setDeleting(true);
    try {
      await getDataService().admin.deleteUser(userId);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.removeQueries({ queryKey: ["admin-user", userId] });
      toast.success("用户已删除");
      onBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (isLoading || !detail) {
    if (error) {
      return (
        <EmptyState
          icon={<AlertCircleIcon />}
          title="无法读取用户详情"
          description={error instanceof Error ? error.message : "请稍后重试。"}
          action={
            <Button variant="outline" onClick={onBack}>
              返回用户列表
            </Button>
          }
        />
      );
    }
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const user = detail.user;
  const isSelf = user.id === currentUserId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          返回用户列表
        </Button>
        <Button variant="outline" size="sm" onClick={() => onGrant(user)}>
          <CoinsIcon /> 赠送余额
        </Button>
      </div>

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <Avatar name={user.name} src={user.avatarUrl} className="size-14 text-xl" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {user.name}
            {user.role === "admin" && <Badge>管理员</Badge>}
          </p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            注册于 {formatRelativeTime(user.createdAt)}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs text-muted-foreground">余额</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatCents(user.balance)}
          </p>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <p className="text-sm font-medium">订阅</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {subscriptionSummary(user)}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_auto]">
          <Select
            value={planId}
            onValueChange={setPlanId}
            options={[
              { value: "", label: "无订阅" },
              ...plans.map((plan) => ({
                value: plan.id,
                label: `${plan.name} · ${formatQuotaCents(plan.monthlyQuotaCents)}额度`,
              })),
            ]}
          />
          <Input
            type="number"
            min="1"
            step="1"
            value={expiresInDays}
            disabled={!planId}
            onChange={(event) => setExpiresInDays(event.target.value)}
            aria-label="订阅有效天数"
          />
          <Button
            type="button"
            disabled={savingSubscription}
            onClick={() => void saveSubscription()}
          >
            {savingSubscription ? "保存中..." : "保存订阅"}
          </Button>
        </div>
      </Card>

      <Tabs defaultValue="usage">
        <TabsList className="justify-start">
          <TabsTrigger value="usage">用量记录</TabsTrigger>
          <TabsTrigger value="ledger">余额流水</TabsTrigger>
        </TabsList>
        <TabsContent value="usage">
          <UserUsageLog records={detail.usageRecords} />
        </TabsContent>
        <TabsContent value="ledger">
          <UserLedgerLog entries={detail.ledger} />
        </TabsContent>
      </Tabs>

      <Card className="space-y-3 border-destructive/30 p-5">
        <div>
          <p className="text-sm font-medium text-destructive">危险操作</p>
          <p className="mt-1 text-xs text-muted-foreground">
            删除用户会同时删除该用户的会话、文件、知识库、余额流水和登录会话。
          </p>
        </div>
        <Button
          variant="destructive"
          disabled={isSelf}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon /> 删除用户
        </Button>
        {isSelf && (
          <p className="text-xs text-muted-foreground">当前登录账号不能在这里删除。</p>
        )}
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteOpen(false);
        }}
        title="删除用户"
        description={`确定删除用户「${user.name}」？删除后无法撤销。`}
        confirmLabel="删除"
        destructive
        loading={deleting}
        onConfirm={deleteUser}
      />
    </div>
  );
}

function UserUsageLog({ records }: { records: UsageRecord[] }) {
  if (records.length === 0) {
    return <Card className="p-5 text-sm text-muted-foreground">暂无用量记录</Card>;
  }
  return (
    <Card className="divide-y overflow-hidden">
      {records.map((record) => (
        <div
          key={record.id}
          className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto_auto]"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{record.modelName}</p>
            <p className="text-xs text-muted-foreground">
              {usageCapabilityLabel(record.capability)} ·{" "}
              {formatRelativeTime(record.createdAt)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground md:text-right">
            输入 {formatTokens(record.inputTokens)} · 输出{" "}
            {formatTokens(record.outputTokens)}
            {record.imageCount ? ` · 图片 ${record.imageCount}` : ""}
          </p>
          <p className="font-medium tabular-nums md:text-right">
            {formatCents(record.costCents)}
          </p>
        </div>
      ))}
    </Card>
  );
}

function UserLedgerLog({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) {
    return <Card className="p-5 text-sm text-muted-foreground">暂无余额流水</Card>;
  }
  return (
    <Card className="divide-y overflow-hidden">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto_auto]"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">
              {entry.description || ledgerReasonLabel(entry.reason)}
            </p>
            <p className="text-xs text-muted-foreground">
              {ledgerReasonLabel(entry.reason)} · {formatRelativeTime(entry.createdAt)}
            </p>
          </div>
          <p
            className={cn(
              "font-medium tabular-nums md:text-right",
              entry.amountCents >= 0 ? "text-success" : "text-foreground"
            )}
          >
            {formatSignedCents(entry.amountCents)}
          </p>
          <p className="text-xs text-muted-foreground md:text-right">
            余额 {formatCents(entry.balanceAfterCents)}
          </p>
        </div>
      ))}
    </Card>
  );
}

function subscriptionSummary(user: User) {
  if (!user.subscription) return "当前没有有效订阅";
  const used = user.subscription.usedQuotaCents;
  const quota = user.subscription.monthlyQuotaCents;
  if (isUnlimitedQuota(quota)) {
    return `${user.subscription.planName} · 无限额度 · 本月已用 ${formatCents(
      used
    )} · ${new Date(user.subscription.expiresAt).toLocaleDateString("zh-CN")} 到期`;
  }
  return `${user.subscription.planName} · 已用 ${formatCents(used)} / ${formatCents(
    quota
  )} · ${new Date(user.subscription.expiresAt).toLocaleDateString("zh-CN")} 到期`;
}

function usageCapabilityLabel(capability?: string) {
  const labels: Record<string, string> = {
    chat: "对话",
    image: "图像生成",
    "image-edit": "图像编辑",
    embedding: "向量化",
    tts: "语音合成",
    asr: "语音识别",
    "vision-helper": "图片理解",
    "web-search": "联网搜索",
    "tool-router": "工具路由",
  };
  return labels[capability ?? "chat"] ?? capability ?? "用量";
}

function ledgerReasonLabel(reason: LedgerEntry["reason"]) {
  const labels: Record<LedgerEntry["reason"], string> = {
    recharge: "充值",
    usage: "消费",
    grant: "赠送",
    refund: "退款",
    redeem: "兑换",
  };
  return labels[reason];
}

function formatSignedCents(cents: number) {
  return `${cents >= 0 ? "+" : "-"}${formatCents(Math.abs(cents))}`;
}

// ---------- 技能审核 ----------

function SkillReviewTab() {
  const queryClient = useQueryClient();
  const { data: pending = [] } = useQuery({
    queryKey: ["admin-pending-skills"],
    queryFn: () => getDataService().admin.listPendingSkills(),
  });

  const review = async (id: string, approve: boolean) => {
    await getDataService().admin.reviewSkill(id, approve);
    queryClient.invalidateQueries({ queryKey: ["admin-pending-skills"] });
    queryClient.invalidateQueries({ queryKey: ["skills"] });
    toast.success(approve ? "已通过" : "已拒绝");
  };

  if (pending.length === 0) {
    return (
      <EmptyState
        icon={<BotIcon />}
        title="没有待审核的技能"
        description="用户申请分享到广场的技能会出现在这里。"
      />
    );
  }

  return (
    <div className="space-y-3">
      {pending.map((s) => (
        <Card key={s.id} className="flex items-center gap-3 p-4">
          <span className="text-2xl">{s.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{s.name}</p>
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {s.description}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => review(s.id, false)}>
            <XIcon /> 拒绝
          </Button>
          <Button size="sm" onClick={() => review(s.id, true)}>
            <CheckIcon /> 通过
          </Button>
        </Card>
      ))}
    </div>
  );
}

// ---------- 系统设置 ----------

type EngineDraft = {
  baseUrl: string;
  model: string;
  voice?: string;
  apiKey: string;
};

function EngineCard({
  title,
  description,
  icon,
  dirty,
  saving,
  testing,
  children,
  onSave,
  onTest,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  dirty: boolean;
  saving: boolean;
  testing: boolean;
  children: React.ReactNode;
  onSave: () => void;
  onTest: () => void;
}) {
  return (
    <Card
      className={cn(
        "space-y-4 p-4 transition-colors",
        dirty && "border-destructive/70 bg-destructive/5"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4",
              dirty && "bg-destructive/10 text-destructive"
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            {dirty && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertCircleIcon className="size-3.5" />
                有未保存更改
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={testing}>
            {testing ? <Loader2Icon className="animate-spin" /> : <CheckCircleIcon />}
            测试连接
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={!dirty || saving}>
            {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            保存
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </Card>
  );
}

function EngineField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SystemSettingsTab() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => getDataService().admin.getSettings(),
  });
  const { data: models = [] } = useQuery({
    queryKey: ["admin-models"],
    queryFn: () => getDataService().admin.listAllModels(),
  });
  const { data: globalMcp = [] } = useQuery({
    queryKey: ["mcp-servers", "global"],
    queryFn: () => getDataService().listMcpServers("global"),
  });

  const [imageDraft, setImageDraft] = React.useState<EngineDraft>({
    baseUrl: "",
    model: "",
    apiKey: "",
  });
  const [ttsDraft, setTtsDraft] = React.useState<EngineDraft>({
    baseUrl: "",
    model: "",
    voice: "",
    apiKey: "",
  });
  const [asrDraft, setAsrDraft] = React.useState<EngineDraft>({
    baseUrl: "",
    model: "",
    apiKey: "",
  });
  const [searchDraft, setSearchDraft] = React.useState<EngineDraft>({
    baseUrl: "",
    model: "",
    apiKey: "",
  });
  const [savingEngine, setSavingEngine] = React.useState<EngineId | null>(null);
  const [testingEngine, setTestingEngine] = React.useState<EngineId | null>(null);
  const [mcpDialogOpen, setMcpDialogOpen] = React.useState(false);
  const [mcpSaving, setMcpSaving] = React.useState(false);
  const [testingMcp, setTestingMcp] = React.useState<string | null>(null);
  const [deleteMcpTarget, setDeleteMcpTarget] = React.useState<McpServer | null>(null);
  const [deletingMcp, setDeletingMcp] = React.useState(false);
  const [mcpForm, setMcpForm] = React.useState({
    name: "",
    url: "",
    transport: "streamable-http" as McpServer["transport"],
  });

  React.useEffect(() => {
    if (!settings) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setImageDraft({
        baseUrl: settings.imageGenBaseUrl ?? "",
        model: settings.imageGenModel ?? "",
        apiKey: "",
      });
      setTtsDraft({
        baseUrl: settings.ttsBaseUrl ?? "",
        model: settings.ttsModel ?? "",
        voice: settings.mimoTtsVoice ?? "",
        apiKey: "",
      });
      setAsrDraft({
        baseUrl: settings.asrBaseUrl ?? "",
        model: settings.asrModel ?? "",
        apiKey: "",
      });
      setSearchDraft({
        baseUrl: settings.searchBaseUrl ?? "",
        model: "",
        apiKey: "",
      });
    });
    return () => {
      active = false;
    };
  }, [settings]);

  if (!settings) return null;

  const save = async (
    patch: Parameters<ReturnType<typeof getDataService>["admin"]["saveSettings"]>[0]
  ) => {
    const cachePatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => key in settings)
    ) as Partial<AppSettings>;
    const optimistic = optimisticPatchQuery<AppSettings>(
      queryClient,
      ["admin-settings"],
      cachePatch
    );
    try {
      const saved = await getDataService().admin.saveSettings(patch);
      optimistic.reconcile(saved);
      toast.success("设置已保存");
    } catch (error) {
      optimistic.rollback();
      toast.error(error instanceof Error ? error.message : "设置保存失败");
    }
  };

  const visionModels = models.filter((m) => m.capabilities.includes("vision"));
  const chatModels = models.filter((m) => !m.capabilities.includes("image-generation"));

  const isDirty = (draft: EngineDraft, saved: Partial<EngineDraft>) =>
    (draft.baseUrl.trim() !== (saved.baseUrl ?? "").trim()) ||
    (draft.model.trim() !== (saved.model ?? "").trim()) ||
    ((draft.voice ?? "").trim() !== (saved.voice ?? "").trim()) ||
    draft.apiKey.trim().length > 0;

  const engineDirty = {
    image: isDirty(imageDraft, {
      baseUrl: settings.imageGenBaseUrl ?? "",
      model: settings.imageGenModel ?? "",
    }),
    tts: isDirty(ttsDraft, {
      baseUrl: settings.ttsBaseUrl ?? "",
      model: settings.ttsModel ?? "",
      voice: settings.mimoTtsVoice ?? "",
    }),
    asr: isDirty(asrDraft, {
      baseUrl: settings.asrBaseUrl ?? "",
      model: settings.asrModel ?? "",
    }),
    search: isDirty(searchDraft, {
      baseUrl: settings.searchBaseUrl ?? "",
    }),
  } satisfies Record<EngineId, boolean>;

  const saveEngine = async (engine: EngineId) => {
    setSavingEngine(engine);
    try {
      let nextSettings: typeof settings;
      if (engine === "image") {
        nextSettings = await getDataService().admin.saveSettings({
          imageGenBaseUrl: imageDraft.baseUrl.trim(),
          imageGenModel: imageDraft.model.trim(),
          ...(imageDraft.apiKey.trim()
            ? { imageGenApiKey: imageDraft.apiKey.trim() }
            : {}),
        });
      } else if (engine === "tts") {
        nextSettings = await getDataService().admin.saveSettings({
          ttsBaseUrl: ttsDraft.baseUrl.trim(),
          ttsModel: ttsDraft.model.trim(),
          mimoTtsVoice: (ttsDraft.voice ?? "").trim(),
          ...(ttsDraft.apiKey.trim() ? { ttsApiKey: ttsDraft.apiKey.trim() } : {}),
        });
      } else if (engine === "asr") {
        nextSettings = await getDataService().admin.saveSettings({
          asrBaseUrl: asrDraft.baseUrl.trim(),
          asrModel: asrDraft.model.trim(),
          ...(asrDraft.apiKey.trim() ? { asrApiKey: asrDraft.apiKey.trim() } : {}),
        });
      } else {
        nextSettings = await getDataService().admin.saveSettings({
          searchBaseUrl: searchDraft.baseUrl.trim(),
          ...(searchDraft.apiKey.trim()
            ? { tavilyApiKey: searchDraft.apiKey.trim() }
            : {}),
        });
      }
      queryClient.setQueryData(["admin-settings"], nextSettings);
      await queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      toast.success("引擎设置已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingEngine(null);
    }
  };

  const testEngine = async (engine: EngineId, draft: EngineDraft) => {
    setTestingEngine(engine);
    try {
      const result = await getDataService().admin.testEngineConnection({
        engine,
        config: {
          baseUrl: draft.baseUrl.trim() || undefined,
          model: draft.model.trim() || undefined,
          voice: draft.voice?.trim() || undefined,
          apiKey: draft.apiKey.trim() || undefined,
        },
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTestingEngine(null);
    }
  };

  const invalidateMcp = () => {
    queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
  };

  const addGlobalMcp = async () => {
    if (mcpSaving) return;
    setMcpSaving(true);
    const temporary: McpServer = {
      id: `optimistic-global-mcp-${clientRandomUUID()}`,
      scope: "global",
      name: mcpForm.name.trim(),
      url: mcpForm.url.trim(),
      transport: mcpForm.transport,
      enabled: false,
      defaultEnabled: false,
      status: "unknown",
      tools: [],
      clientMutationState: "pending",
    };
    const optimistic = optimisticInsertRecord<McpServer>(
      queryClient,
      [["mcp-servers", "global"]],
      temporary
    );
    setMcpDialogOpen(false);
    setMcpForm({ name: "", url: "", transport: "streamable-http" });
    try {
      const saved = await getDataService().saveMcpServer({
        name: temporary.name,
        url: temporary.url,
        transport: temporary.transport,
        scope: "global",
        enabled: false,
      });
      optimistic.reconcile(saved);
      toast.success("全局 MCP 服务器已添加，默认停用，请测试后启用");
    } catch (e) {
      optimistic.rollback();
      toast.error(e instanceof Error ? e.message : "添加失败");
    } finally {
      setMcpSaving(false);
    }
  };

  const testGlobalMcp = async (id: string) => {
    setTestingMcp(id);
    try {
      const result = await getDataService().testMcpServer(id);
      invalidateMcp();
      if (result.ok) toast.success(`连接成功，发现 ${result.tools.length} 个工具`);
      else toast.error(result.error ?? "连接失败");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "连接失败");
    } finally {
      setTestingMcp(null);
    }
  };

  const toggleGlobalMcp = async (server: McpServer) => {
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
    } catch (e) {
      optimistic.rollback();
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const deleteGlobalMcp = async () => {
    if (!deleteMcpTarget || deletingMcp) return;
    setDeletingMcp(true);
    const target = deleteMcpTarget;
    const optimistic = optimisticRemoveRecord<McpServer>(
      queryClient,
      [["mcp-servers"]],
      target.id
    );
    setDeleteMcpTarget(null);
    try {
      await getDataService().deleteMcpServer(target.id);
      toast.success("全局 MCP 服务器已删除");
    } catch (e) {
      optimistic.rollback();
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingMcp(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <p className="text-sm font-medium">辅助模型</p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              辅助识图模型（供无视觉模型使用）
            </label>
            <Select
              value={settings.visionHelperModelId}
              onValueChange={(v) => save({ visionHelperModelId: v })}
              options={visionModels.map((m) => ({ value: m.id, label: m.displayName }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              智能工具路由模型
            </label>
            <Select
              value={settings.toolRouterModelId ?? ""}
              onValueChange={(v) => save({ toolRouterModelId: v })}
              options={[
                { value: "", label: "不使用辅助模型" },
                ...chatModels.map((m) => ({ value: m.id, label: m.displayName })),
              ]}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Embedding 模型（记忆与知识库）
            </label>
            <Select
              value={settings.embeddingModelId}
              onValueChange={(v) => save({ embeddingModelId: v })}
              options={models.map((m) => ({ value: m.id, label: m.displayName }))}
            />
          </div>
        </div>
      </Card>

      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium">引擎配置</p>
          <p className="mt-1 text-xs text-muted-foreground">
            每个能力域独立配置 baseURL / API Key / 模型，互不干扰。文本对话模型在「供应商」页配置。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <EngineCard
            title="图像生成"
            description="用于 generate_image / edit_image。测试会真实生成 1 张测试图。"
            icon={<ImageIcon />}
            dirty={engineDirty.image}
            saving={savingEngine === "image"}
            testing={testingEngine === "image"}
            onSave={() => void saveEngine("image")}
            onTest={() => void testEngine("image", imageDraft)}
          >
            <EngineField label="Base URL">
              <Input
                placeholder="如 https://api.cdn-krill-ai.com/codex/v1"
                value={imageDraft.baseUrl}
                onChange={(e) =>
                  setImageDraft({ ...imageDraft, baseUrl: e.target.value })
                }
              />
            </EngineField>
            <EngineField label="模型 slug">
              <Input
                placeholder="如 gpt-image-2"
                value={imageDraft.model}
                onChange={(e) =>
                  setImageDraft({ ...imageDraft, model: e.target.value })
                }
              />
            </EngineField>
            <EngineField label="API Key">
              <Input
                type="password"
                placeholder={`留空沿用当前 Key（${settings.imageGenApiKeyMasked ?? "未配置"}）`}
                value={imageDraft.apiKey}
                onChange={(e) =>
                  setImageDraft({ ...imageDraft, apiKey: e.target.value })
                }
              />
            </EngineField>
          </EngineCard>

          <EngineCard
            title="语音合成（TTS）"
            description="用于把文本合成为语音，兼容旧 MiMo Key 回退。"
            icon={<Volume2Icon />}
            dirty={engineDirty.tts}
            saving={savingEngine === "tts"}
            testing={testingEngine === "tts"}
            onSave={() => void saveEngine("tts")}
            onTest={() => void testEngine("tts", ttsDraft)}
          >
            <EngineField label="Base URL">
              <Input
                placeholder="如 https://token-plan-cn.xiaomimimo.com/v1"
                value={ttsDraft.baseUrl}
                onChange={(e) => setTtsDraft({ ...ttsDraft, baseUrl: e.target.value })}
              />
            </EngineField>
            <EngineField label="模型">
              <Input
                placeholder="如 mimo-v2.5-tts"
                value={ttsDraft.model}
                onChange={(e) => setTtsDraft({ ...ttsDraft, model: e.target.value })}
              />
            </EngineField>
            <EngineField label="音色">
              <Input
                placeholder="如 冰糖 / Chloe"
                value={ttsDraft.voice ?? ""}
                onChange={(e) => setTtsDraft({ ...ttsDraft, voice: e.target.value })}
              />
            </EngineField>
            <EngineField label="API Key">
              <Input
                type="password"
                placeholder={`留空沿用当前 Key（${settings.ttsApiKeyMasked ?? "未配置"}）`}
                value={ttsDraft.apiKey}
                onChange={(e) => setTtsDraft({ ...ttsDraft, apiKey: e.target.value })}
              />
            </EngineField>
          </EngineCard>

          <EngineCard
            title="语音识别（ASR）"
            description="用于录音转写，兼容旧 MiMo Key 回退。"
            icon={<MicIcon />}
            dirty={engineDirty.asr}
            saving={savingEngine === "asr"}
            testing={testingEngine === "asr"}
            onSave={() => void saveEngine("asr")}
            onTest={() => void testEngine("asr", asrDraft)}
          >
            <EngineField label="Base URL">
              <Input
                placeholder="如 https://token-plan-cn.xiaomimimo.com/v1"
                value={asrDraft.baseUrl}
                onChange={(e) => setAsrDraft({ ...asrDraft, baseUrl: e.target.value })}
              />
            </EngineField>
            <EngineField label="模型">
              <Input
                placeholder="如 mimo-v2.5-asr"
                value={asrDraft.model}
                onChange={(e) => setAsrDraft({ ...asrDraft, model: e.target.value })}
              />
            </EngineField>
            <EngineField label="API Key">
              <Input
                type="password"
                placeholder={`留空沿用当前 Key（${settings.asrApiKeyMasked ?? "未配置"}）`}
                value={asrDraft.apiKey}
                onChange={(e) => setAsrDraft({ ...asrDraft, apiKey: e.target.value })}
              />
            </EngineField>
          </EngineCard>

          <EngineCard
            title="联网搜索（Tavily）"
            description="用于 web_search / web_read / web_crawl。"
            icon={<GlobeIcon />}
            dirty={engineDirty.search}
            saving={savingEngine === "search"}
            testing={testingEngine === "search"}
            onSave={() => void saveEngine("search")}
            onTest={() => void testEngine("search", searchDraft)}
          >
            <EngineField label="Base URL">
              <Input
                placeholder="默认 https://api.tavily.com"
                value={searchDraft.baseUrl}
                onChange={(e) =>
                  setSearchDraft({ ...searchDraft, baseUrl: e.target.value })
                }
              />
            </EngineField>
            <EngineField label="API Key">
              <Input
                type="password"
                placeholder={`留空沿用当前 Key（${settings.tavilyApiKeyMasked ?? "未配置"}）`}
                value={searchDraft.apiKey}
                onChange={(e) =>
                  setSearchDraft({ ...searchDraft, apiKey: e.target.value })
                }
              />
            </EngineField>
          </EngineCard>
        </div>
      </section>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">全局 MCP 服务器</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMcpDialogOpen(true)}
          >
            <PlusIcon /> 添加
          </Button>
        </div>
        {globalMcp.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            还没有全局 MCP 服务器。
          </p>
        ) : (
          <div className="space-y-2">
            {globalMcp.map((s) => (
              <div
                key={s.id}
                className="group rounded-xl border px-3.5 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <ServerIcon className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {s.name}
                      {s.status === "connected" && (
                        <CheckCircleIcon className="size-3.5 text-success" />
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{s.url}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void testGlobalMcp(s.id)}
                      disabled={testingMcp === s.id}
                    >
                      {testingMcp === s.id ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        "测试连接"
                      )}
                    </Button>
                    <Switch
                      aria-label={`${s.enabled ? "停用" : "启用"}全局 MCP 服务器「${s.name}」`}
                      checked={s.enabled}
                      onCheckedChange={() => void toggleGlobalMcp(s)}
                    />
                    <button
                      type="button"
                      aria-label={`删除全局 MCP 服务器「${s.name}」`}
                      onClick={() => setDeleteMcpTarget(s)}
                      className="rounded-md p-1.5 text-muted-foreground opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:opacity-0 sm:group-hover:opacity-100"
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
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog
        open={mcpDialogOpen}
        onOpenChange={(open) => {
          if (!open && mcpSaving) return;
          setMcpDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加全局 MCP 服务器</DialogTitle>
            <DialogDescription>
              全局服务器会出现在所有用户的对话工具面板中。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="名称，例如：公司知识库"
              value={mcpForm.name}
              onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })}
            />
            <Input
              placeholder="服务器 URL（https://…/mcp）"
              value={mcpForm.url}
              onChange={(e) => setMcpForm({ ...mcpForm, url: e.target.value })}
            />
            <Select
              value={mcpForm.transport}
              onValueChange={(v) =>
                setMcpForm({ ...mcpForm, transport: v as McpServer["transport"] })
              }
              options={[
                { value: "streamable-http", label: "Streamable HTTP" },
                { value: "sse", label: "SSE" },
              ]}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={mcpSaving}
              onClick={() => setMcpDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void addGlobalMcp()}
              disabled={mcpSaving || !mcpForm.name.trim() || !mcpForm.url.trim()}
            >
              {mcpSaving ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleteMcpTarget}
        onOpenChange={(open) => {
          if (!open && !deletingMcp) setDeleteMcpTarget(null);
        }}
        title="删除全局 MCP 服务器"
        description={`将删除全局 MCP 服务器「${deleteMcpTarget?.name ?? ""}」。此操作不可撤销。`}
        confirmLabel="删除"
        destructive
        loading={deletingMcp}
        onConfirm={deleteGlobalMcp}
      />

      <Card className="space-y-3 p-5">
        <p className="text-sm font-medium">注册与广场</p>
        <label className="flex items-center justify-between">
          <span className="text-sm">开放注册</span>
          <Switch
            aria-label="开放注册"
            checked={settings.registrationEnabled}
            onCheckedChange={(v) => save({ registrationEnabled: v })}
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm">技能广场需要审核</span>
          <Switch
            aria-label="技能广场需要审核"
            checked={settings.skillMarketRequiresReview}
            onCheckedChange={(v) => save({ skillMarketRequiresReview: v })}
          />
        </label>
      </Card>

      <div className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
        <UsersIcon className="size-4 shrink-0" />
        第一个注册的用户自动成为管理员；普通用户注册后即开即用，看不到任何密钥配置。
      </div>
    </div>
  );
}
