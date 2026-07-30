// 模型与计价 Tab:按供应商类型分组 / CRUD / 启用开关 / 连接测试

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminKeys,
  deleteModel,
  getAdminModels,
  getProviders,
  saveModel,
  testModel,
  type AdminModel,
  type AdminProvider,
  type ModelCapability,
  type ModelTier,
} from "@/api/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { PageLoading } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  ConfirmDialog,
  EmptyState,
  errorMessage,
  Field,
  formatCents,
  parseIntOr,
  Select,
  SwitchRow,
  TableWrap,
  tableClass,
  tdClass,
  Textarea,
  thClass,
} from "./shared";

const CAPABILITY_OPTIONS: { value: ModelCapability; label: string }[] = [
  { value: "vision", label: "识图" },
  { value: "reasoning", label: "推理" },
  { value: "tools", label: "工具" },
  { value: "image-generation", label: "生图" },
  { value: "web-search-native", label: "联网搜索" },
];

const CAPABILITY_LABELS = Object.fromEntries(
  CAPABILITY_OPTIONS.map((c) => [c.value, c.label]),
) as Record<string, string>;

const KIND_ORDER = [
  "openai",
  "anthropic",
  "google",
  "zhipu",
  "deepseek",
  "xiaomi",
  "xiaomi-token-plan",
];

export function ModelsTab() {
  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<AdminModel | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminModel | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const modelsQuery = useQuery({
    queryKey: adminKeys.models,
    queryFn: getAdminModels,
  });
  const providersQuery = useQuery({
    queryKey: adminKeys.providers,
    queryFn: getProviders,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.models });

  /** 启用开关:契约要求 POST 全字段 */
  const toggleMutation = useMutation({
    mutationFn: (input: { model: AdminModel; enabled: boolean }) =>
      saveModel({
        id: input.model.id,
        providerId: input.model.providerId,
        slug: input.model.slug,
        displayName: input.model.displayName,
        description: input.model.description,
        capabilities: input.model.capabilities,
        enabled: input.enabled,
        inputPricePerM: input.model.inputPricePerM,
        outputPricePerM: input.model.outputPricePerM,
        pricePerImage: input.model.pricePerImage,
        contextWindow: input.model.contextWindow,
        maxOutputTokens: input.model.maxOutputTokens,
        tier: input.model.tier,
        sortOrder: input.model.sortOrder,
      }),
    onError: (err) => toast.error(errorMessage(err, "保存失败")),
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteModel,
    onSuccess: () => {
      toast.success("已删除");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(errorMessage(err, "删除失败")),
    onSettled: invalidate,
  });

  const testMutation = useMutation({
    mutationFn: testModel,
    onMutate: (id) => setTestingId(id),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("测试通过,模型可用");
      } else {
        toast.error(res.error || "测试失败");
      }
    },
    onError: (err) => toast.error(errorMessage(err, "测试失败")),
    onSettled: () => setTestingId(null),
  });

  if (modelsQuery.isPending || providersQuery.isPending) {
    return <PageLoading text="加载模型…" />;
  }
  if (modelsQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <p className="text-sm text-danger">
          {errorMessage(modelsQuery.error, "加载失败")}
        </p>
        <Button variant="outline" size="sm" onClick={() => modelsQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const models = modelsQuery.data;
  const providers = providersQuery.data ?? [];

  // 按 providerKind 分组,保持固定顺序
  const groups = new Map<string, AdminModel[]>();
  for (const m of models) {
    const list = groups.get(m.providerKind) ?? [];
    list.push(m);
    groups.set(m.providerKind, list);
  }
  const groupKeys = [...groups.keys()].sort(
    (a, b) =>
      (KIND_ORDER.indexOf(a) === -1 ? 99 : KIND_ORDER.indexOf(a)) -
      (KIND_ORDER.indexOf(b) === -1 ? 99 : KIND_ORDER.indexOf(b)),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-2">
          共 {models.length} 个模型;价格单位为「分 / 百万 token」
        </p>
        <Button
          size="sm"
          onClick={() => setEditTarget("new")}
          disabled={providers.length === 0}
        >
          新增模型
        </Button>
      </div>

      {models.length === 0 ? (
        <EmptyState text="暂无模型,可在供应商页拉取或手动新增" />
      ) : (
        groupKeys.map((kind) => (
          <div key={kind} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-text-2 uppercase">
              {kind}
            </h3>
            <TableWrap>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>名称</th>
                    <th className={thClass}>Slug</th>
                    <th className={thClass}>档位</th>
                    <th className={thClass}>能力</th>
                    <th className={thClass}>输入价</th>
                    <th className={thClass}>输出价</th>
                    <th className={thClass}>生图价</th>
                    <th className={thClass}>启用</th>
                    <th className={thClass}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(groups.get(kind) ?? []).map((m) => (
                    <tr key={m.id}>
                      <td className={cn(tdClass, "font-medium whitespace-nowrap")}>
                        {m.displayName}
                      </td>
                      <td className={cn(tdClass, "font-mono text-xs text-text-2")}>
                        {m.slug}
                      </td>
                      <td className={tdClass}>
                        <Badge tone={m.tier === "pro" ? "primary" : "default"}>
                          {m.tier === "pro" ? "Pro" : "免费"}
                        </Badge>
                      </td>
                      <td className={tdClass}>
                        <div className="flex max-w-56 flex-wrap gap-1">
                          {m.capabilities.length === 0 ? (
                            <span className="text-xs text-text-3">-</span>
                          ) : (
                            m.capabilities.map((c) => (
                              <Badge key={c}>{CAPABILITY_LABELS[c] ?? c}</Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        {formatCents(m.inputPricePerM)}
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        {formatCents(m.outputPricePerM)}
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        {m.pricePerImage != null
                          ? `${formatCents(m.pricePerImage)}/张`
                          : "-"}
                      </td>
                      <td className={tdClass}>
                        <Switch
                          checked={m.enabled}
                          disabled={toggleMutation.isPending}
                          label="启用"
                          onChange={(enabled) =>
                            toggleMutation.mutate({ model: m, enabled })
                          }
                        />
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={testingId === m.id}
                            onClick={() => testMutation.mutate(m.id)}
                          >
                            {testingId === m.id ? "测试中…" : "测试"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditTarget(m)}
                          >
                            编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger"
                            onClick={() => setDeleteTarget(m)}
                          >
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        ))
      )}

      {editTarget && (
        <ModelEditDialog
          target={editTarget}
          providers={providers}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除模型"
          description={`确定删除模型「${deleteTarget.displayName}」吗?此操作不可撤销。`}
          pending={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </div>
  );
}

/** 新增 / 编辑模型(全字段;价格单位:分) */
function ModelEditDialog({
  target,
  providers,
  onClose,
}: {
  target: AdminModel | "new";
  providers: AdminProvider[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = target !== "new" ? target : null;

  const [displayName, setDisplayName] = useState(editing?.displayName ?? "");
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [providerId, setProviderId] = useState(
    editing?.providerId ?? providers[0]?.id ?? "",
  );
  const [capabilities, setCapabilities] = useState<Set<string>>(
    new Set(editing?.capabilities ?? []),
  );
  const [tier, setTier] = useState<ModelTier>(editing?.tier ?? "free");
  const [inputPrice, setInputPrice] = useState(
    String(editing?.inputPricePerM ?? 0),
  );
  const [outputPrice, setOutputPrice] = useState(
    String(editing?.outputPricePerM ?? 0),
  );
  const [imagePrice, setImagePrice] = useState(
    editing?.pricePerImage != null ? String(editing.pricePerImage) : "",
  );
  const [contextWindow, setContextWindow] = useState(
    String(editing?.contextWindow ?? 128000),
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    editing?.maxOutputTokens != null ? String(editing.maxOutputTokens) : "",
  );
  const [sortOrder, setSortOrder] = useState(
    editing?.sortOrder != null ? String(editing.sortOrder) : "",
  );
  const [enabled, setEnabled] = useState(editing?.enabled ?? true);

  const saveMutation = useMutation({
    mutationFn: saveModel,
    onSuccess: () => {
      toast.success(editing ? "已保存" : "已创建");
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "保存失败")),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.models }),
  });

  const toggleCapability = (cap: string) => {
    setCapabilities((prev) => {
      const next = new Set(prev);
      if (next.has(cap)) {
        next.delete(cap);
      } else {
        next.add(cap);
      }
      return next;
    });
  };

  const submit = () => {
    if (!displayName.trim() || !slug.trim()) {
      toast.error("请填写名称和 Slug");
      return;
    }
    if (!providerId) {
      toast.error("请选择供应商");
      return;
    }
    saveMutation.mutate({
      id: editing?.id,
      providerId,
      slug: slug.trim(),
      displayName: displayName.trim(),
      description: description.trim() || undefined,
      capabilities: [...capabilities],
      enabled,
      inputPricePerM: parseIntOr(inputPrice, 0),
      outputPricePerM: parseIntOr(outputPrice, 0),
      pricePerImage:
        imagePrice.trim() === "" ? undefined : parseIntOr(imagePrice, 0),
      contextWindow: parseIntOr(contextWindow, 0),
      maxOutputTokens:
        maxOutputTokens.trim() === ""
          ? undefined
          : parseIntOr(maxOutputTokens, 0),
      tier,
      sortOrder: sortOrder.trim() === "" ? undefined : parseIntOr(sortOrder, 0),
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "编辑模型" : "新增模型"}
      widthClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saveMutation.isPending}>
            取消
          </Button>
          <Button onClick={submit} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label="显示名称">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="GPT-5"
            />
          </Field>
          <Field label="Slug">
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="gpt-5"
            />
          </Field>
        </div>
        <Field label="供应商">
          <Select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}({p.kind})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="描述(可选)">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="能力">
          <div className="flex flex-wrap gap-3 rounded-md border border-border px-3 py-2">
            {CAPABILITY_OPTIONS.map((c) => (
              <label
                key={c.value}
                className="flex cursor-pointer items-center gap-1.5 text-sm text-text"
              >
                <input
                  type="checkbox"
                  checked={capabilities.has(c.value)}
                  onChange={() => toggleCapability(c.value)}
                  className="size-4 accent-primary"
                />
                {c.label}
              </label>
            ))}
          </div>
        </Field>
        <Field label="档位">
          <Select value={tier} onChange={(e) => setTier(e.target.value as ModelTier)}>
            <option value="free">免费</option>
            <option value="pro">Pro</option>
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="输入价(分/百万)">
            <Input
              type="number"
              min={0}
              value={inputPrice}
              onChange={(e) => setInputPrice(e.target.value)}
            />
          </Field>
          <Field label="输出价(分/百万)">
            <Input
              type="number"
              min={0}
              value={outputPrice}
              onChange={(e) => setOutputPrice(e.target.value)}
            />
          </Field>
          <Field label="生图价(分/张,可空)">
            <Input
              type="number"
              min={0}
              value={imagePrice}
              onChange={(e) => setImagePrice(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="上下文窗口">
            <Input
              type="number"
              min={0}
              value={contextWindow}
              onChange={(e) => setContextWindow(e.target.value)}
            />
          </Field>
          <Field label="最大输出 token(可空)">
            <Input
              type="number"
              min={0}
              value={maxOutputTokens}
              onChange={(e) => setMaxOutputTokens(e.target.value)}
            />
          </Field>
          <Field label="排序(可空)">
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
        </div>
        <SwitchRow label="启用" checked={enabled} onChange={setEnabled} />
      </div>
    </Dialog>
  );
}
