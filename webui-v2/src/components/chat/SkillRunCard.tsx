// Skill Run 实时卡片:挂载即拉快照并订阅 SSE(snapshot 直接更新 / run-event 重新拉快照)
// 终态(completed/failed/cancelled)且回执完成后主动断开;组件卸载中断订阅

import { useEffect, useState } from "react";
import {
  getSkillRun,
  retrySkillRun,
  stopSkillRun,
  streamSkillRunEvents,
  submitSkillRunInput,
  type SkillRunSnapshot,
  type SkillRunStep,
} from "@/api/skill-runs";
import type { SkillRunPart } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useChatStore } from "@/stores/chat-store";
import { PptBriefCard } from "./PptBriefCard";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/** 终态且回执已落定(无回执概念的老数据视为已落定) */
function isSettled(s: SkillRunSnapshot): boolean {
  if (!TERMINAL.has(s.status)) return false;
  return (
    s.completionReceiptStatus == null ||
    s.completionReceiptStatus === "completed" ||
    s.completionReceiptStatus === "failed"
  );
}

/** input 是否像 PPT 简报需求(结构不确定,按关键词启发式判断) */
function looksLikePptBrief(snapshot: SkillRunSnapshot): boolean {
  const pattern = /ppt|slide|简报|幻灯|演示/i;
  const head = `${snapshot.skillId ?? ""} ${snapshot.kind} ${snapshot.skillName}`;
  if (pattern.test(head)) return true;
  const { input } = snapshot;
  if (input == null) return true; // 等待输入但没有结构:给通用表单
  if (typeof input === "string") return pattern.test(input);
  try {
    return pattern.test(JSON.stringify(input));
  } catch {
    return false;
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function SkillRunCard({ part }: { part: SkillRunPart }) {
  const [snapshot, setSnapshot] = useState<SkillRunSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  // 拉快照 + SSE 订阅(终态落定后不再订阅 / 主动断开)
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const apply = (s: SkillRunSnapshot) => {
      if (!cancelled) setSnapshot(s);
    };

    (async () => {
      try {
        const first = await getSkillRun(part.runId);
        apply(first);
        if (cancelled || isSettled(first)) return;

        const events = await streamSkillRunEvents(part.runId, controller.signal);
        for await (const ev of events) {
          if (cancelled) return;
          if (ev.event === "snapshot") {
            try {
              const s = JSON.parse(ev.data) as SkillRunSnapshot;
              apply(s);
              if (isSettled(s)) return;
            } catch {
              // 快照 JSON 解析失败:忽略该帧,等下一帧
            }
          } else if (ev.event === "run-event") {
            const s = await getSkillRun(part.runId);
            apply(s);
            if (isSettled(s)) return;
          }
          // ping:忽略
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : "加载失败");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [part.runId, reloadKey]);

  // 回执消息合入会话(仅当 messages 中不存在该 id;由 store 保证幂等)
  const completionMessage = snapshot?.completionMessage;
  useEffect(() => {
    if (completionMessage && snapshot?.conversationId) {
      useChatStore
        .getState()
        .upsertBackgroundMessage(snapshot.conversationId, completionMessage);
    }
    // snapshot 仅需 conversationId,随 completionMessage 一起到达
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionMessage]);

  const refresh = () => setReloadKey((k) => k + 1);

  const onStop = async () => {
    setBusy(true);
    try {
      await stopSkillRun(part.runId);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "停止失败");
    } finally {
      setBusy(false);
    }
  };

  const onRetry = async () => {
    setBusy(true);
    try {
      await retrySkillRun(part.runId);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重试失败");
    } finally {
      setBusy(false);
    }
  };

  const onSubmitInput = async (payload: unknown) => {
    setBusy(true);
    try {
      await submitSkillRunInput(part.runId, payload);
      toast.success("已提交");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "提交失败");
    } finally {
      setBusy(false);
    }
  };

  if (loadError && !snapshot) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
        <span className="min-w-0 flex-1">
          技能运行「{part.skillName}」加载失败:{loadError}
        </span>
        <button
          type="button"
          onClick={refresh}
          className="shrink-0 rounded-md border border-danger/40 px-2 py-0.5 text-xs hover:bg-danger/10"
        >
          重试
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-2">
        <Spinner className="size-3.5" />
        技能运行:{part.skillName}
      </div>
    );
  }

  const running = snapshot.status === "running" || snapshot.status === "queued";
  const progress = Math.round(Math.min(1, Math.max(0, snapshot.progress ?? 0)) * 100);

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-surface">
      {/* 头部:技能名 + 状态 + 阶段 + 操作 */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span aria-hidden>🧩</span>
        <span className="min-w-0 truncate text-sm font-medium text-text">
          {snapshot.skillName}
        </span>
        <StatusBadge status={snapshot.status} />
        {snapshot.stageLabel && (
          <span className="min-w-0 truncate text-xs text-text-3">
            {snapshot.stageLabel}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {running && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onStop()}
              className="rounded-md border border-border px-2 py-0.5 text-xs text-text-2 hover:bg-surface-2 disabled:opacity-40"
            >
              停止
            </button>
          )}
          {(snapshot.status === "failed" || snapshot.status === "cancelled") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRetry()}
              className="rounded-md border border-border px-2 py-0.5 text-xs text-text-2 hover:bg-surface-2 disabled:opacity-40"
            >
              重试
            </button>
          )}
        </span>
      </div>

      {/* 进度条 */}
      {running && (
        <div className="mx-3 mb-2 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {snapshot.error && (
        <p className="mx-3 mb-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {snapshot.error}
        </p>
      )}

      {/* 步骤树 */}
      {snapshot.steps.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <StepTree steps={snapshot.steps} />
        </div>
      )}

      {/* 结果附件 */}
      {snapshot.resultAttachments && snapshot.resultAttachments.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <p className="mb-1.5 text-xs font-medium text-text-3">
            产出文件({snapshot.resultAttachments.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {snapshot.resultAttachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5 hover:bg-surface-2"
                >
                  <span aria-hidden>📎</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text">
                    {a.name}
                  </span>
                  {a.sizeBytes != null && (
                    <span className="shrink-0 text-xs text-text-3">
                      {formatBytes(a.sizeBytes)}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 等待输入:PPT 简报需求表单 */}
      {snapshot.status === "waiting_input" && looksLikePptBrief(snapshot) && (
        <div className="border-t border-border px-3 py-2">
          <PptBriefCard
            input={snapshot.input}
            submitting={busy}
            onSubmit={(payload) => void onSubmitInput(payload)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 状态徽章
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: SkillRunSnapshot["status"] }) {
  switch (status) {
    case "queued":
      return <Badge>排队中</Badge>;
    case "running":
      return (
        <Badge tone="primary">
          <Spinner className="mr-1 size-3" />
          运行中
        </Badge>
      );
    case "waiting_input":
      return <Badge tone="primary">等待输入</Badge>;
    case "completed":
      return <Badge tone="success">✓ 已完成</Badge>;
    case "failed":
      return <Badge tone="danger">✕ 失败</Badge>;
    case "cancelled":
      return <Badge>已取消</Badge>;
  }
}

// ---------------------------------------------------------------------------
// 步骤树:按 parentStepId 分层缩进
// ---------------------------------------------------------------------------

const STEP_ICON: Record<SkillRunStep["kind"], string> = {
  coordinator: "🎯",
  subagent: "🤖",
  tool: "🔧",
  approval: "✋",
  artifact: "📄",
};

function StepTree({ steps }: { steps: SkillRunStep[] }) {
  const byParent = new Map<string | undefined, SkillRunStep[]>();
  const ids = new Set(steps.map((s) => s.id));
  for (const step of steps) {
    // parentStepId 指向不存在的步骤时按根处理
    const parent =
      step.parentStepId && ids.has(step.parentStepId) ? step.parentStepId : undefined;
    const list = byParent.get(parent);
    if (list) list.push(step);
    else byParent.set(parent, [step]);
  }

  const renderLevel = (parent: string | undefined, depth: number): React.ReactNode =>
    (byParent.get(parent) ?? []).map((step) => (
      <li key={step.id}>
        <StepRow step={step} depth={depth} />
        {byParent.has(step.id) && <ul>{renderLevel(step.id, depth + 1)}</ul>}
      </li>
    ));

  return <ul className="flex flex-col gap-1">{renderLevel(undefined, 0)}</ul>;
}

function StepRow({ step, depth }: { step: SkillRunStep; depth: number }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs",
        step.status === "running" && "bg-primary-soft/60",
      )}
      style={{ marginLeft: depth * 16 }}
    >
      <span aria-hidden>{STEP_ICON[step.kind] ?? "▫️"}</span>
      <span
        className={cn(
          "min-w-0 truncate",
          step.status === "running" && "font-medium text-primary",
          step.status === "completed" && "text-text-2",
          step.status === "failed" && "text-danger",
          (step.status === "queued" || step.status === "cancelled") && "text-text-3",
        )}
      >
        {step.label}
      </span>
      {step.status === "running" && <Spinner className="size-3 shrink-0 text-primary" />}
      {step.status === "completed" && (
        <span className="shrink-0 text-success">✓</span>
      )}
      {step.status === "failed" && <span className="shrink-0 text-danger">✕</span>}
      {step.sourceCount != null && step.sourceCount > 0 && (
        <span className="shrink-0 text-text-3">{step.sourceCount} 个来源</span>
      )}
      {step.error && (
        <span className="min-w-0 truncate text-danger" title={step.error}>
          {step.error}
        </span>
      )}
    </div>
  );
}
