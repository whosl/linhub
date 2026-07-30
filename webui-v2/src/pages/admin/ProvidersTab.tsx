// 供应商 Tab:列表(开关即改即存)/ 新增编辑 / 删除 / 拉取远端模型批量入库

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addRemoteModels,
  adminKeys,
  deleteProvider,
  getProviders,
  getRemoteModels,
  saveProvider,
  type AdminProvider,
  type ProviderKind,
  type RemoteModel,
} from "@/api/admin";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { PageLoading, Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  ConfirmDialog,
  EmptyState,
  errorMessage,
  Field,
  Select,
  SwitchRow,
  TableWrap,
  tableClass,
  tdClass,
  thClass,
} from "./shared";

const KIND_OPTIONS: { value: ProviderKind; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "zhipu", label: "智谱" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "xiaomi", label: "小米" },
  { value: "xiaomi-token-plan", label: "小米 Token 套餐" },
];

const KIND_LABELS = Object.fromEntries(
  KIND_OPTIONS.map((k) => [k.value, k.label]),
) as Record<ProviderKind, string>;

export function ProvidersTab() {
  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<AdminProvider | "new" | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<AdminProvider | null>(null);
  const [pullTarget, setPullTarget] = useState<AdminProvider | null>(null);

  const providersQuery = useQuery({
    queryKey: adminKeys.providers,
    queryFn: getProviders,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.providers });

  /** 开关即改即存:带上完整字段(apiKey 不传 = 不修改) */
  const toggleMutation = useMutation({
    mutationFn: (input: {
      provider: AdminProvider;
      enabled?: boolean;
      storeEnabled?: boolean;
    }) =>
      saveProvider({
        id: input.provider.id,
        kind: input.provider.kind,
        name: input.provider.name,
        baseUrl: input.provider.baseUrl,
        enabled: input.enabled ?? input.provider.enabled,
        storeEnabled: input.storeEnabled ?? input.provider.storeEnabled,
      }),
    onError: (err) => toast.error(errorMessage(err, "保存失败")),
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProvider,
    onSuccess: () => {
      toast.success("已删除");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(errorMessage(err, "删除失败")),
    onSettled: invalidate,
  });

  if (providersQuery.isPending) return <PageLoading text="加载供应商…" />;
  if (providersQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <p className="text-sm text-danger">
          {errorMessage(providersQuery.error, "加载失败")}
        </p>
        <Button variant="outline" size="sm" onClick={() => providersQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const providers = providersQuery.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-2">
          共 {providers.length} 个供应商;开关修改后立即保存
        </p>
        <Button size="sm" onClick={() => setEditTarget("new")}>
          新增供应商
        </Button>
      </div>

      {providers.length === 0 ? (
        <EmptyState text="暂无供应商,点击右上角新增" />
      ) : (
        <TableWrap>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>类型</th>
                <th className={thClass}>名称</th>
                <th className={thClass}>Base URL</th>
                <th className={thClass}>API Key</th>
                <th className={thClass}>启用</th>
                <th className={thClass}>供应商市场</th>
                <th className={thClass}>操作</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id}>
                  <td className={tdClass}>{KIND_LABELS[p.kind] ?? p.kind}</td>
                  <td className={cn(tdClass, "font-medium")}>{p.name}</td>
                  <td className={cn(tdClass, "max-w-48 truncate text-text-2")}>
                    {p.baseUrl || "-"}
                  </td>
                  <td className={cn(tdClass, "font-mono text-xs text-text-2")}>
                    {p.apiKeyMasked || "-"}
                  </td>
                  <td className={tdClass}>
                    <Switch
                      checked={p.enabled}
                      disabled={toggleMutation.isPending}
                      label="启用"
                      onChange={(enabled) =>
                        toggleMutation.mutate({ provider: p, enabled })
                      }
                    />
                  </td>
                  <td className={tdClass}>
                    <Switch
                      checked={p.storeEnabled}
                      disabled={toggleMutation.isPending}
                      label="供应商市场"
                      onChange={(storeEnabled) =>
                        toggleMutation.mutate({ provider: p, storeEnabled })
                      }
                    />
                  </td>
                  <td className={cn(tdClass, "whitespace-nowrap")}>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPullTarget(p)}
                      >
                        拉取模型
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditTarget(p)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => setDeleteTarget(p)}
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
      )}

      {editTarget && (
        <ProviderEditDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除供应商"
          description={`确定删除供应商「${deleteTarget.name}」吗?其下模型可能受影响,此操作不可撤销。`}
          pending={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}

      {pullTarget && (
        <PullModelsDialog
          provider={pullTarget}
          onClose={() => setPullTarget(null)}
        />
      )}
    </div>
  );
}


/** 新增 / 编辑供应商 */
function ProviderEditDialog({
  target,
  onClose,
}: {
  target: AdminProvider | "new";
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = target !== "new" ? target : null;

  const [kind, setKind] = useState<ProviderKind>(editing?.kind ?? "openai");
  const [name, setName] = useState(editing?.name ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl ?? "");
  const [enabled, setEnabled] = useState(editing?.enabled ?? true);
  const [storeEnabled, setStoreEnabled] = useState(
    editing?.storeEnabled ?? false,
  );

  const saveMutation = useMutation({
    mutationFn: saveProvider,
    onSuccess: () => {
      toast.success(editing ? "已保存" : "已创建");
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "保存失败")),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.providers }),
  });

  const submit = () => {
    if (!name.trim()) {
      toast.error("请填写名称");
      return;
    }
    saveMutation.mutate({
      id: editing?.id,
      kind,
      name: name.trim(),
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      enabled,
      storeEnabled,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "编辑供应商" : "新增供应商"}
      widthClassName="max-w-md"
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
      <div className="flex flex-col gap-3">
        <Field label="类型">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as ProviderKind)}
            disabled={!!editing}
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="名称">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如:OpenAI 官方"
          />
        </Field>
        <Field
          label="API Key"
          hint={editing ? `当前:${editing.apiKeyMasked || "未设置"}` : undefined}
        >
          <Input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={editing ? "留空则不修改" : "sk-..."}
            type="password"
            autoComplete="off"
          />
        </Field>
        <Field label="Base URL(可选)">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="留空使用默认地址"
          />
        </Field>
        <SwitchRow label="启用" checked={enabled} onChange={setEnabled} />
        <SwitchRow
          label="在供应商市场展示"
          checked={storeEnabled}
          onChange={setStoreEnabled}
        />
      </div>
    </Dialog>
  );
}

/** 拉取远端模型:勾选未添加的批量入库 */
function PullModelsDialog({
  provider,
  onClose,
}: {
  provider: AdminProvider;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const remoteQuery = useQuery({
    queryKey: adminKeys.remoteModels(provider.id),
    queryFn: () => getRemoteModels(provider.id),
  });

  const addMutation = useMutation({
    mutationFn: (slugs: string[]) => addRemoteModels(provider.id, slugs),
    onSuccess: (res) => {
      toast.success(`已添加 ${res.added} 个模型`);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "添加失败")),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.models });
      void queryClient.invalidateQueries({
        queryKey: adminKeys.remoteModels(provider.id),
      });
    },
  });

  const toggle = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const models: RemoteModel[] = remoteQuery.data ?? [];
  const pending = models.filter((m) => !m.added);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`拉取模型 — ${provider.name}`}
      widthClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={addMutation.isPending}>
            取消
          </Button>
          <Button
            disabled={selected.size === 0 || addMutation.isPending}
            onClick={() => addMutation.mutate([...selected])}
          >
            {addMutation.isPending ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner /> 添加中…
              </span>
            ) : (
              `添加 ${selected.size} 个模型`
            )}
          </Button>
        </>
      }
    >
      {remoteQuery.isPending && <PageLoading text="拉取远端模型…" />}
      {remoteQuery.isError && (
        <p className="py-6 text-center text-sm text-danger">
          {errorMessage(remoteQuery.error, "拉取失败")}
        </p>
      )}
      {remoteQuery.isSuccess && models.length === 0 && (
        <p className="py-6 text-center text-sm text-text-2">远端没有可用模型</p>
      )}
      {models.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-text-2">
            <span>
              共 {models.length} 个,未添加 {pending.length} 个
            </span>
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() =>
                setSelected(
                  selected.size === pending.length
                    ? new Set()
                    : new Set(pending.map((m) => m.slug)),
                )
              }
            >
              {selected.size === pending.length ? "取消全选" : "全选未添加"}
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto rounded-md border border-border">
            {models.map((m) => (
              <li
                key={m.slug}
                className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-b-0"
              >
                {m.added ? (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-3">
                      {m.displayName || m.slug}
                      <span className="ml-2 font-mono text-xs">{m.slug}</span>
                    </span>
                    <span className="shrink-0 text-xs text-text-3">已添加</span>
                  </>
                ) : (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(m.slug)}
                      onChange={() => toggle(m.slug)}
                      className="size-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-text">
                      {m.displayName || m.slug}
                      <span className="ml-2 font-mono text-xs text-text-2">
                        {m.slug}
                      </span>
                    </span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
