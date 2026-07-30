// 系统设置 Tab:站点设置 / 默认模型 / 引擎配置(生图·TTS·ASR·搜索,带测试连接)/ 全局 MCP

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminKeys,
  deleteMcp,
  getGlobalMcpServers,
  getSettings,
  saveGlobalMcp,
  saveSettings,
  testEngine,
  testMcp,
  type AppSettings,
  type AppSettingsPatch,
  type EngineKind,
  type GlobalMcpServer,
} from "@/api/admin";
import { getModels } from "@/api/models";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { PageLoading, Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/toast";
import {
  ConfirmDialog,
  EmptyState,
  errorMessage,
  Field,
  Section,
  Select,
  SwitchRow,
} from "./shared";

/** 表单状态:掩码字段不回填,明文 key 输入框留空 = 不修改 */
interface SettingsForm {
  siteName: string;
  registrationEnabled: boolean;
  skillMarketRequiresReview: boolean;
  defaultChatModelId: string;
  visionHelperModelId: string;
  toolRouterModelId: string;
  embeddingModelId: string;
  imageGenBaseUrl: string;
  imageGenModel: string;
  imageGenApiKey: string;
  ttsBaseUrl: string;
  ttsModel: string;
  ttsApiKey: string;
  mimoTtsVoice: string;
  asrBaseUrl: string;
  asrModel: string;
  asrApiKey: string;
  searchBaseUrl: string;
  tavilyApiKey: string;
  mimoApiKey: string;
}

function formFromSettings(s: AppSettings): SettingsForm {
  return {
    siteName: s.siteName ?? "",
    registrationEnabled: s.registrationEnabled,
    skillMarketRequiresReview: s.skillMarketRequiresReview,
    defaultChatModelId: s.defaultChatModelId ?? "",
    visionHelperModelId: s.visionHelperModelId ?? "",
    toolRouterModelId: s.toolRouterModelId ?? "",
    embeddingModelId: s.embeddingModelId ?? "",
    imageGenBaseUrl: s.imageGenBaseUrl ?? "",
    imageGenModel: s.imageGenModel ?? "",
    imageGenApiKey: "",
    ttsBaseUrl: s.ttsBaseUrl ?? "",
    ttsModel: s.ttsModel ?? "",
    ttsApiKey: "",
    mimoTtsVoice: s.mimoTtsVoice ?? "",
    asrBaseUrl: s.asrBaseUrl ?? "",
    asrModel: s.asrModel ?? "",
    asrApiKey: "",
    searchBaseUrl: s.searchBaseUrl ?? "",
    tavilyApiKey: "",
    mimoApiKey: "",
  };
}

const ENGINE_LABELS: Record<EngineKind, string> = {
  image: "生图",
  tts: "TTS",
  asr: "ASR",
  search: "搜索",
};

export function SettingsTab() {
  const queryClient = useQueryClient();
  // 本地编辑覆盖;为空时表单直接由服务端数据派生(避免在 effect 里 setState)
  const [edited, setEdited] = useState<SettingsForm | null>(null);

  const settingsQuery = useQuery({
    queryKey: adminKeys.settings,
    queryFn: getSettings,
  });
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: getModels,
    staleTime: 60_000,
  });

  // 表单 = 本地编辑覆盖 ?? 服务端数据派生
  const form =
    edited ??
    (settingsQuery.data ? formFromSettings(settingsQuery.data) : null);

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      setEdited(null); // 采用服务端最新数据重新派生
      toast.success("设置已保存");
    },
    onError: (err) => toast.error(errorMessage(err, "保存失败")),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.settings }),
  });

  const engineTestMutation = useMutation({
    mutationFn: (input: { engine: EngineKind }) => {
      const f = form!;
      if (input.engine === "image") {
        return testEngine("image", {
          baseUrl: f.imageGenBaseUrl || undefined,
          model: f.imageGenModel || undefined,
          apiKey: f.imageGenApiKey || undefined,
        });
      }
      if (input.engine === "tts") {
        return testEngine("tts", {
          baseUrl: f.ttsBaseUrl || undefined,
          model: f.ttsModel || undefined,
          voice: f.mimoTtsVoice || undefined,
          apiKey: f.ttsApiKey || undefined,
        });
      }
      if (input.engine === "asr") {
        return testEngine("asr", {
          baseUrl: f.asrBaseUrl || undefined,
          model: f.asrModel || undefined,
          apiKey: f.asrApiKey || undefined,
        });
      }
      return testEngine("search", {
        baseUrl: f.searchBaseUrl || undefined,
        apiKey: f.tavilyApiKey || undefined,
      });
    },
    onSuccess: (res, input) => {
      if (res.ok) {
        toast.success(`${ENGINE_LABELS[input.engine]}引擎连接正常`);
      } else {
        toast.error(
          `${ENGINE_LABELS[input.engine]}引擎测试失败:${res.error || "未知错误"}`,
        );
      }
    },
    onError: (err, input) =>
      toast.error(
        `${ENGINE_LABELS[input.engine]}引擎测试失败:${errorMessage(err, "网络错误")}`,
      ),
  });

  if (settingsQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <p className="text-sm text-danger">
          {errorMessage(settingsQuery.error, "加载失败")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => settingsQuery.refetch()}
        >
          重试
        </Button>
      </div>
    );
  }
  if (settingsQuery.isPending || form === null) {
    return <PageLoading text="加载设置…" />;
  }

  const settings = settingsQuery.data!;
  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setEdited({ ...form!, [key]: value });

  const modelOptions = (modelsQuery.data?.models ?? []).filter(
    (m) => m.enabled !== false,
  );

  const modelSelect = (
    value: string,
    onChange: (v: string) => void,
  ) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">未设置</option>
      {modelOptions.map((m) => (
        <option key={m.id} value={m.id}>
          {m.displayName}
        </option>
      ))}
    </Select>
  );

  const testButton = (engine: EngineKind) => {
    const testing =
      engineTestMutation.isPending &&
      engineTestMutation.variables?.engine === engine;
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={engineTestMutation.isPending}
        onClick={() => engineTestMutation.mutate({ engine })}
      >
        {testing ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner /> 测试中…
          </span>
        ) : (
          "测试连接"
        )}
      </Button>
    );
  };

  const submit = () => {
    const patch: AppSettingsPatch = {
      siteName: form.siteName.trim(),
      registrationEnabled: form.registrationEnabled,
      skillMarketRequiresReview: form.skillMarketRequiresReview,
      defaultChatModelId: form.defaultChatModelId || undefined,
      visionHelperModelId: form.visionHelperModelId || undefined,
      toolRouterModelId: form.toolRouterModelId || undefined,
      embeddingModelId: form.embeddingModelId || undefined,
      imageGenBaseUrl: form.imageGenBaseUrl.trim() || undefined,
      imageGenModel: form.imageGenModel.trim() || undefined,
      ttsBaseUrl: form.ttsBaseUrl.trim() || undefined,
      ttsModel: form.ttsModel.trim() || undefined,
      mimoTtsVoice: form.mimoTtsVoice.trim() || undefined,
      asrBaseUrl: form.asrBaseUrl.trim() || undefined,
      asrModel: form.asrModel.trim() || undefined,
      searchBaseUrl: form.searchBaseUrl.trim() || undefined,
    };
    // 明文 key:仅在填写时提交
    if (form.imageGenApiKey.trim()) patch.imageGenApiKey = form.imageGenApiKey.trim();
    if (form.ttsApiKey.trim()) patch.ttsApiKey = form.ttsApiKey.trim();
    if (form.asrApiKey.trim()) patch.asrApiKey = form.asrApiKey.trim();
    if (form.tavilyApiKey.trim()) patch.tavilyApiKey = form.tavilyApiKey.trim();
    if (form.mimoApiKey.trim()) patch.mimoApiKey = form.mimoApiKey.trim();
    saveMutation.mutate(patch);
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="站点设置">
        <Field label="站点名称">
          <Input
            value={form.siteName}
            onChange={(e) => set("siteName", e.target.value)}
          />
        </Field>
        <SwitchRow
          label="开放注册"
          checked={form.registrationEnabled}
          onChange={(v) => set("registrationEnabled", v)}
        />
        <SwitchRow
          label="技能市场上架需要审核"
          checked={form.skillMarketRequiresReview}
          onChange={(v) => set("skillMarketRequiresReview", v)}
        />
      </Section>

      <Section title="默认模型" description="留空则由系统自动选择">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="默认对话模型">
            {modelSelect(form.defaultChatModelId, (v) =>
              set("defaultChatModelId", v),
            )}
          </Field>
          <Field label="辅助识图模型">
            {modelSelect(form.visionHelperModelId, (v) =>
              set("visionHelperModelId", v),
            )}
          </Field>
          <Field label="工具路由模型">
            {modelSelect(form.toolRouterModelId, (v) =>
              set("toolRouterModelId", v),
            )}
          </Field>
          <Field label="Embedding 模型">
            {modelSelect(form.embeddingModelId, (v) =>
              set("embeddingModelId", v),
            )}
          </Field>
        </div>
      </Section>

      <Section title="生图引擎" action={testButton("image")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Base URL">
            <Input
              value={form.imageGenBaseUrl}
              onChange={(e) => set("imageGenBaseUrl", e.target.value)}
              placeholder="https://..."
            />
          </Field>
          <Field label="模型">
            <Input
              value={form.imageGenModel}
              onChange={(e) => set("imageGenModel", e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="API Key"
          hint={`当前:${settings.imageGenApiKeyMasked || "未设置"}`}
        >
          <Input
            type="password"
            autoComplete="off"
            value={form.imageGenApiKey}
            onChange={(e) => set("imageGenApiKey", e.target.value)}
            placeholder="留空则不修改"
          />
        </Field>
      </Section>

      <Section title="TTS 引擎" action={testButton("tts")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Base URL">
            <Input
              value={form.ttsBaseUrl}
              onChange={(e) => set("ttsBaseUrl", e.target.value)}
              placeholder="https://..."
            />
          </Field>
          <Field label="模型">
            <Input
              value={form.ttsModel}
              onChange={(e) => set("ttsModel", e.target.value)}
            />
          </Field>
          <Field label="音色(voice)">
            <Input
              value={form.mimoTtsVoice}
              onChange={(e) => set("mimoTtsVoice", e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="API Key"
          hint={`当前:${settings.ttsApiKeyMasked || "未设置"}`}
        >
          <Input
            type="password"
            autoComplete="off"
            value={form.ttsApiKey}
            onChange={(e) => set("ttsApiKey", e.target.value)}
            placeholder="留空则不修改"
          />
        </Field>
      </Section>

      <Section title="ASR 引擎" action={testButton("asr")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Base URL">
            <Input
              value={form.asrBaseUrl}
              onChange={(e) => set("asrBaseUrl", e.target.value)}
              placeholder="https://..."
            />
          </Field>
          <Field label="模型">
            <Input
              value={form.asrModel}
              onChange={(e) => set("asrModel", e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="API Key"
          hint={`当前:${settings.asrApiKeyMasked || "未设置"}`}
        >
          <Input
            type="password"
            autoComplete="off"
            value={form.asrApiKey}
            onChange={(e) => set("asrApiKey", e.target.value)}
            placeholder="留空则不修改"
          />
        </Field>
      </Section>

      <Section title="搜索" action={testButton("search")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Base URL">
            <Input
              value={form.searchBaseUrl}
              onChange={(e) => set("searchBaseUrl", e.target.value)}
              placeholder="https://api.tavily.com"
            />
          </Field>
          <Field
            label="Tavily API Key"
            hint={`当前:${settings.tavilyApiKeyMasked || "未设置"}`}
          >
            <Input
              type="password"
              autoComplete="off"
              value={form.tavilyApiKey}
              onChange={(e) => set("tavilyApiKey", e.target.value)}
              placeholder="留空则不修改"
            />
          </Field>
        </div>
        <Field
          label="MiMo API Key"
          hint={`当前:${settings.mimoApiKeyMasked || "未设置"}`}
        >
          <Input
            type="password"
            autoComplete="off"
            value={form.mimoApiKey}
            onChange={(e) => set("mimoApiKey", e.target.value)}
            placeholder="留空则不修改"
          />
        </Field>
      </Section>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "保存中…" : "保存设置"}
        </Button>
      </div>

      <GlobalMcpSection />
    </div>
  );
}

/** 全局 MCP 管理:列表 / 添加 / 启停 / 默认启用 / 测试 / 删除 */
function GlobalMcpSection() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GlobalMcpServer | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const mcpQuery = useQuery({
    queryKey: adminKeys.mcpGlobal,
    queryFn: getGlobalMcpServers,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.mcpGlobal });

  const toggleMutation = useMutation({
    mutationFn: (input: {
      id: string;
      enabled?: boolean;
      defaultEnabled?: boolean;
    }) => saveGlobalMcp(input),
    onError: (err) => toast.error(errorMessage(err, "保存失败")),
    onSettled: invalidate,
  });

  const testMutation = useMutation({
    mutationFn: testMcp,
    onMutate: (id) => setTestingId(id),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("MCP 连接正常");
      } else {
        toast.error(res.error || "MCP 连接失败");
      }
    },
    onError: (err) => toast.error(errorMessage(err, "MCP 连接失败")),
    onSettled: () => setTestingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMcp,
    onSuccess: () => {
      toast.success("已删除");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(errorMessage(err, "删除失败")),
    onSettled: invalidate,
  });

  const servers = mcpQuery.data ?? [];

  return (
    <Section
      title="全局 MCP 服务器"
      description="对所有用户生效;defaultEnabled 控制是否默认开启"
      action={
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          添加 MCP
        </Button>
      }
    >
      {mcpQuery.isPending && <PageLoading text="加载 MCP…" />}
      {mcpQuery.isError && (
        <p className="text-sm text-danger">
          {errorMessage(mcpQuery.error, "加载失败")}
        </p>
      )}
      {mcpQuery.isSuccess && servers.length === 0 && (
        <EmptyState text="暂无全局 MCP 服务器" />
      )}
      {servers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {servers.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">
                  {s.name}
                  {s.status && (
                    <Badge
                      tone={s.status === "connected" ? "success" : "default"}
                    >
                      <span className="ml-2">{s.status}</span>
                    </Badge>
                  )}
                </p>
                <p className="truncate font-mono text-xs text-text-2">{s.url}</p>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-text-2">
                启用
                <Switch
                  checked={s.enabled}
                  disabled={toggleMutation.isPending}
                  label="启用"
                  onChange={(enabled) =>
                    toggleMutation.mutate({ id: s.id, enabled })
                  }
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-text-2">
                默认开启
                <Switch
                  checked={s.defaultEnabled}
                  disabled={toggleMutation.isPending}
                  label="默认开启"
                  onChange={(defaultEnabled) =>
                    toggleMutation.mutate({ id: s.id, defaultEnabled })
                  }
                />
              </label>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testingId === s.id}
                  onClick={() => testMutation.mutate(s.id)}
                >
                  {testingId === s.id ? "测试中…" : "测试"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={() => setDeleteTarget(s)}
                >
                  删除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {addOpen && <McpAddDialog onClose={() => setAddOpen(false)} />}

      {deleteTarget && (
        <ConfirmDialog
          title="删除 MCP 服务器"
          description={`确定删除「${deleteTarget.name}」吗?所有用户将立即无法使用该服务器。`}
          pending={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </Section>
  );
}

/** 添加全局 MCP */
function McpAddDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [defaultEnabled, setDefaultEnabled] = useState(false);

  const mutation = useMutation({
    mutationFn: saveGlobalMcp,
    onSuccess: () => {
      toast.success("已添加");
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "添加失败")),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.mcpGlobal }),
  });

  const submit = () => {
    if (!name.trim() || !url.trim()) {
      toast.error("请填写名称和 URL");
      return;
    }
    mutation.mutate({
      name: name.trim(),
      url: url.trim(),
      enabled,
      defaultEnabled,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="添加全局 MCP 服务器"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            取消
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "添加中…" : "添加"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="名称">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="URL">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
          />
        </Field>
        <SwitchRow label="启用" checked={enabled} onChange={setEnabled} />
        <SwitchRow
          label="默认开启"
          hint="开启后所有用户的对话默认挂载该 MCP"
          checked={defaultEnabled}
          onChange={setDefaultEnabled}
        />
      </div>
    </Dialog>
  );
}
