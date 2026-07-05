"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BotIcon,
  CheckIcon,
  CoinsIcon,
  KeyIcon,
  PencilIcon,
  PlusIcon,
  ServerIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { getDataService } from "@/lib/data";
import type { Model, Plan, Provider, ProviderKind } from "@/lib/types";
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
          <Button variant="ghost" size="icon-sm" onClick={() => openEditor(p)}>
            <PencilIcon />
          </Button>
          <Switch checked={p.enabled} onCheckedChange={() => toggle(p)} />
        </Card>
      ))}

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

  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">模型</th>
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
                  <p className="text-xs text-muted-foreground">{m.slug}</p>
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

      <ModelPricingDialog
        model={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-models"] });
          queryClient.invalidateQueries({ queryKey: ["models"] });
          setEditing(null);
        }}
      />
    </div>
  );
}

function ModelPricingDialog({
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
    inputPricePerM: 0,
    outputPricePerM: 0,
    tier: "free" as Model["tier"],
  });

  React.useEffect(() => {
    if (model) {
      setForm({
        displayName: model.displayName,
        inputPricePerM: model.inputPricePerM,
        outputPricePerM: model.outputPricePerM,
        tier: model.tier,
      });
    }
  }, [model]);

  if (!model) return null;

  const save = async () => {
    await getDataService().admin.saveModel({ id: model.id, ...form });
    toast.success("模型已更新");
    onSaved();
  };

  return (
    <Dialog open={!!model} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑 {model.slug}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              展示名
            </label>
            <Input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                输入价格（分/百万 token）
              </label>
              <Input
                type="number"
                value={form.inputPricePerM}
                onChange={(e) =>
                  setForm({ ...form, inputPricePerM: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                输出价格（分/百万 token）
              </label>
              <Input
                type="number"
                value={form.outputPricePerM}
                onChange={(e) =>
                  setForm({ ...form, outputPricePerM: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              可用分级
            </label>
            <Select
              value={form.tier}
              onValueChange={(v) => setForm({ ...form, tier: v as Model["tier"] })}
              options={[
                { value: "free", label: "免费用户可用" },
                { value: "pro", label: "仅订阅用户" },
              ]}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={save}>保存</Button>
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
