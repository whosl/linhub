"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BotIcon,
  CheckIcon,
  CoinsIcon,
  DownloadIcon,
  KeyIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import type {
  Model,
  ModelCapability,
  Plan,
  Provider,
  ProviderKind,
  RemoteModel,
} from "@/lib/types";
import { formatCents, formatRelativeTime, formatTokens } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
];

export default function AdminPage() {
  return (
    <PageContainer wide>
      <PageHeader
        title="管理后台"
        description="供应商、模型计价、套餐与系统设置 — 普通用户即开即用"
      />
      <Tabs defaultValue="providers">
        <TabsList className="flex-wrap">
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
  const [form, setForm] = React.useState({
    kind: "openai" as ProviderKind,
    name: "",
    baseUrl: "",
    apiKey: "",
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
    });
    queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
    setEditorOpen(false);
    toast.success("供应商已保存");
  };

  const toggle = async (p: Provider) => {
    await getDataService().admin.saveProvider({ ...p, enabled: !p.enabled });
    queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
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
            disabled={!p.apiKeyMasked}
            onClick={() => setFetchingFor(p)}
          >
            <DownloadIcon /> 获取模型
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => openEditor(p)}>
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
    setSelected(new Set());
    setFilter("");
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
                  className="hover:text-foreground"
                  onClick={() =>
                    setSelected(new Set(addable.map((m) => m.slug)))
                  }
                >
                  全选未添加
                </button>
                <button
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

  const { data: models = [] } = useQuery({
    queryKey: ["admin-models"],
    queryFn: () => getDataService().admin.listAllModels(),
  });

  const toggle = async (m: Model) => {
    await getDataService().admin.saveModel({ id: m.id, enabled: !m.enabled });
    queryClient.invalidateQueries({ queryKey: ["admin-models"] });
    queryClient.invalidateQueries({ queryKey: ["models"] });
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
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
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
                  <Switch checked={m.enabled} onCheckedChange={() => toggle(m)} />
                </td>
                <td className="px-3 py-2.5">
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(m)}>
                    <PencilIcon />
                  </Button>
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

  React.useEffect(() => {
    if (model) {
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
    if (!window.confirm(`确定删除模型「${model.displayName}」？删除后历史用量记录保留。`))
      return;
    setBusy(true);
    try {
      await getDataService().admin.deleteModel(model.id);
      toast.success("模型已删除");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  return (
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
          <Button variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>
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
    await getDataService().admin.savePlan({ ...p, enabled: !p.enabled });
    queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
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
            月额度 {formatCents(p.monthlyQuotaCents)} ·{" "}
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
  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => getDataService().admin.listUsers(),
  });

  const grant = async (userId: string) => {
    const input = window.prompt("赠送金额（元）", "10");
    if (!input) return;
    const amount = Math.round(Number(input) * 100);
    if (!Number.isFinite(amount) || amount <= 0) return;
    await getDataService().admin.grantBalance(userId, amount);
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    toast.success("已赠送");
  };

  return (
    <Card className="divide-y overflow-hidden">
      {users.map((u) => (
        <div key={u.id} className="flex items-center gap-3 px-5 py-3">
          <Avatar name={u.name} src={u.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              {u.name}
              {u.role === "admin" && <Badge>管理员</Badge>}
            </p>
            <p className="text-xs text-muted-foreground">
              {u.email} · 注册于 {formatRelativeTime(u.createdAt)}
            </p>
          </div>
          <span className="text-sm tabular-nums">{formatCents(u.balance)}</span>
          <Button variant="outline" size="sm" onClick={() => grant(u.id)}>
            <CoinsIcon /> 赠送余额
          </Button>
        </div>
      ))}
    </Card>
  );
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

  const [tavilyKey, setTavilyKey] = React.useState("");
  const [mimoKey, setMimoKey] = React.useState("");

  if (!settings) return null;

  const save = async (
    patch: Parameters<ReturnType<typeof getDataService>["admin"]["saveSettings"]>[0]
  ) => {
    await getDataService().admin.saveSettings(patch);
    queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    toast.success("设置已保存");
  };

  const visionModels = models.filter((m) => m.capabilities.includes("vision"));

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <p className="text-sm font-medium">辅助模型</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <Card className="space-y-4 p-5">
        <p className="text-sm font-medium">外部服务密钥</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Tavily API Key（当前 {settings.tavilyApiKeyMasked ?? "未配置"}）
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="tvly-…"
                value={tavilyKey}
                onChange={(e) => setTavilyKey(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={!tavilyKey.trim()}
                onClick={() => {
                  save({ tavilyApiKey: tavilyKey.trim() });
                  setTavilyKey("");
                }}
              >
                更新
              </Button>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              MiMo API Key — ASR/TTS（当前 {settings.mimoApiKeyMasked ?? "未配置"}）
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="mm-…"
                value={mimoKey}
                onChange={(e) => setMimoKey(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={!mimoKey.trim()}
                onClick={() => {
                  save({ mimoApiKey: mimoKey.trim() });
                  setMimoKey("");
                }}
              >
                更新
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">全局 MCP 服务器</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("与个人 MCP 相同的表单，写入 scope=global（P4 接真）")}
          >
            <PlusIcon /> 添加
          </Button>
        </div>
        {globalMcp.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5">
            <ServerIcon className="size-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground">{s.url}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {s.tools.slice(0, 3).map((t) => (
                <Badge key={t.name} variant="secondary">
                  {t.name}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </Card>

      <Card className="space-y-3 p-5">
        <p className="text-sm font-medium">注册与广场</p>
        <label className="flex items-center justify-between">
          <span className="text-sm">开放注册</span>
          <Switch
            checked={settings.registrationEnabled}
            onCheckedChange={(v) => save({ registrationEnabled: v })}
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm">技能广场需要审核</span>
          <Switch
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
