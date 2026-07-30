"use client";

import * as React from "react";
import { FileTextIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SkillRunLiveCard,
  type SkillRunAttachment,
} from "./skill-run-card";

const THEMES = [
  ["theme01", "轻拟态 · 产品汇报"],
  ["theme02", "紫绿炫光 · 科技发布"],
  ["theme03", "深浅代码 · 技术方案"],
  ["theme04", "玻璃糖果 · 创意品牌"],
  ["theme05", "色谱图表 · 数据报告"],
  ["theme06", "深色图谱 · 战略分析"],
  ["theme07", "冷白调研 · 白皮书"],
  ["theme08", "黑金实验 · 高端发布"],
  ["theme09", "深蓝杂志 · 品牌故事"],
  ["theme10", "金色指数 · 金融投资"],
  ["theme11", "高能增长 · 商业路演"],
  ["theme12", "声波霓虹 · 娱乐潮流"],
] as const;

interface BriefDraft {
  topic: string;
  audience: string;
  pageCount: number;
  theme: (typeof THEMES)[number][0];
  mediaPreference: "auto" | "image-heavy" | "text-first" | "no-media";
  language: "zh" | "en";
  outputFormat: "pptx" | "html";
  additionalInstructions: string;
}

interface RunSnapshot {
  kind: string;
  status: string;
  input?: Record<string, unknown>;
}

export function PptStudioBriefCard({
  runId,
  skillName,
  initialTopic,
  onOpenAttachment,
}: {
  runId: string;
  skillName: string;
  initialTopic: string;
  onOpenAttachment?: (attachment: SkillRunAttachment, runId: string) => void;
}) {
  const [snapshot, setSnapshot] = React.useState<RunSnapshot | null>(null);
  const [draft, setDraft] = React.useState<BriefDraft>(() => defaultDraft(initialTopic));
  const [submitting, setSubmitting] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let disposed = false;
    void fetch(`/api/skill-runs/${encodeURIComponent(runId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取 PPT 工作室任务");
        return response.json() as Promise<RunSnapshot>;
      })
      .then((run) => {
        if (disposed) return;
        setSnapshot(run);
        if (run.status === "waiting_input") {
          setDraft((current) => draftFromInput(run.input, current));
        }
      })
      .catch((reason) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : "无法读取任务");
      });
    return () => {
      disposed = true;
    };
  }, [runId]);

  if (snapshot && snapshot.status !== "waiting_input") {
    return (
      <SkillRunLiveCard
        runId={runId}
        skillName={skillName}
        onOpenAttachment={onOpenAttachment}
      />
    );
  }

  const update = <Key extends keyof BriefDraft>(key: Key, value: BriefDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const submit = async () => {
    if (draft.topic.trim().length < 2 || !draft.audience.trim()) {
      setError("请填写演示主题和目标受众");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/skill-runs/${encodeURIComponent(runId)}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, topic: draft.topic.trim(), audience: draft.audience.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as RunSnapshot & { error?: string };
      if (!response.ok) throw new Error(payload.error || "提交 PPT 需求失败");
      setSnapshot(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交 PPT 需求失败");
    } finally {
      setSubmitting(false);
    }
  };
  const cancel = async () => {
    setCancelling(true);
    setError("");
    try {
      const response = await fetch(`/api/skill-runs/${encodeURIComponent(runId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "取消 PPT 任务失败");
      setSnapshot((current) =>
        current ? { ...current, status: "cancelled" } : current
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "取消 PPT 任务失败");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <section className="my-2 w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-xs">
      <header className="flex items-start gap-3 border-b bg-muted/25 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileTextIcon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">PPT 工作室</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">填写后开始规划和渲染，刷新页面不会丢失任务</p>
        </div>
      </header>

      <div className="space-y-3.5 p-4">
        {!snapshot && !error ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> 正在载入需求卡…
          </div>
        ) : (
          <>
            <Field label="演示主题">
              <Input value={draft.topic} onChange={(event) => update("topic", event.target.value)} maxLength={200} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="目标受众">
                <Input value={draft.audience} onChange={(event) => update("audience", event.target.value)} placeholder="例如：公司管理层" maxLength={200} />
              </Field>
              <Field label="页数">
                <Input type="number" min={3} max={30} value={draft.pageCount} onChange={(event) => update("pageCount", Math.min(30, Math.max(3, Number(event.target.value) || 3)))} />
              </Field>
            </div>
            <Field label="视觉主题">
              <select className={selectClassName} value={draft.theme} onChange={(event) => update("theme", event.target.value as BriefDraft["theme"])}>
                {THEMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="媒体偏好">
                <select className={selectClassName} value={draft.mediaPreference} onChange={(event) => update("mediaPreference", event.target.value as BriefDraft["mediaPreference"])}>
                  <option value="auto">自动平衡</option><option value="image-heavy">图片优先</option><option value="text-first">文字优先</option><option value="no-media">不使用媒体</option>
                </select>
              </Field>
              <Field label="语言">
                <select className={selectClassName} value={draft.language} onChange={(event) => update("language", event.target.value as BriefDraft["language"])}>
                  <option value="zh">中文</option><option value="en">English</option>
                </select>
              </Field>
              <Field label="输出格式">
                <select className={selectClassName} value={draft.outputFormat} onChange={(event) => update("outputFormat", event.target.value as BriefDraft["outputFormat"])}>
                  <option value="pptx">可编辑 PPTX</option><option value="html">可编辑 HTML 包</option>
                </select>
              </Field>
            </div>
            <Field label="补充要求（可选）">
              <Textarea value={draft.additionalInstructions} onChange={(event) => update("additionalInstructions", event.target.value)} placeholder="例如：突出第三季度增长、减少大段文字、结尾给出行动计划" maxLength={1000} />
            </Field>
            {error && <p className="rounded-lg bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={cancel}
                disabled={submitting || cancelling || !snapshot}
              >
                {cancelling ? <Loader2Icon className="animate-spin" /> : null}
                {cancelling ? "正在取消…" : "取消任务"}
              </Button>
              <Button type="button" className="flex-1" onClick={submit} disabled={submitting || cancelling || !snapshot}>
                {submitting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                {submitting ? "正在提交…" : "提交并开始生成"}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-xs font-medium"><span>{label}</span>{children}</label>;
}

function defaultDraft(topic: string): BriefDraft {
  return { topic, audience: "", pageCount: 10, theme: "theme01", mediaPreference: "auto", language: "zh", outputFormat: "pptx", additionalInstructions: "" };
}

function draftFromInput(input: Record<string, unknown> | undefined, fallback: BriefDraft): BriefDraft {
  if (!input) return fallback;
  const theme = THEMES.some(([value]) => value === input.theme)
    ? (input.theme as BriefDraft["theme"])
    : fallback.theme;
  const mediaPreference = ["auto", "image-heavy", "text-first", "no-media"].includes(
    String(input.mediaPreference)
  )
    ? (input.mediaPreference as BriefDraft["mediaPreference"])
    : fallback.mediaPreference;
  return {
    ...fallback,
    topic: typeof input.topic === "string" ? input.topic : fallback.topic,
    audience: typeof input.audience === "string" ? input.audience : fallback.audience,
    pageCount:
      typeof input.pageCount === "number"
        ? Math.min(30, Math.max(3, input.pageCount))
        : fallback.pageCount,
    theme,
    mediaPreference,
    language: input.language === "en" || input.language === "zh"
      ? input.language
      : fallback.language,
    outputFormat: input.outputFormat === "html" || input.outputFormat === "pptx"
      ? input.outputFormat
      : fallback.outputFormat,
    additionalInstructions: typeof input.additionalInstructions === "string" ? input.additionalInstructions : fallback.additionalInstructions,
  };
}

const selectClassName = cn("flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40");
