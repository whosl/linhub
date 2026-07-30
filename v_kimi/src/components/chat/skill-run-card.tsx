"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircleIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  DownloadIcon,
  FileIcon,
  GlobeIcon,
  Loader2Icon,
  RotateCcwIcon,
  SquareIcon,
  WorkflowIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";

export type SkillRunStatus =
  | "pending"
  | "queued"
  | "running"
  | "waiting_input"
  | "success"
  | "completed"
  | "failed"
  | "error"
  | "stopped"
  | "cancelled";

export type SkillRunStepStatus = SkillRunStatus | "skipped";

export interface SkillRunStep {
  id: string;
  label: string;
  status: SkillRunStepStatus;
  kind?: "coordinator" | "subagent" | "tool" | "approval" | "artifact";
  /** subagent 步骤可提供执行者名称；只展示任务信息，不展示模型推理。 */
  subagentName?: string;
  sourceCount?: number;
  durationMs?: number;
  retryCount?: number;
  error?: string;
}

export interface SkillRunAttachment {
  id: string;
  name: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface SkillRun {
  id: string;
  conversationId?: string;
  skillName: string;
  status: SkillRunStatus;
  stageLabel?: string;
  /** 支持 0–100；为兼容流式状态，也接受 0–1 的小数。 */
  progress?: number;
  steps?: SkillRunStep[];
  resultAttachments?: SkillRunAttachment[];
  error?: string;
  sourceCount?: number;
  durationMs?: number;
  completionReceiptStatus?: "pending" | "generating" | "completed" | "failed";
  completionMessage?: Message;
}

export interface SkillRunCardProps {
  run: SkillRun;
  /** 紧凑模式减少留白，仍可展开完整信息流。 */
  compact?: boolean;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onStop?: (runId: string) => void;
  onRetry?: (runId: string, stepId?: string) => void;
  onOpenAttachment?: (
    attachment: SkillRunAttachment,
    runId: string
  ) => void;
  stopDisabled?: boolean;
  retryDisabled?: boolean;
  className?: string;
}

const TERMINAL_SKILL_RUN_STATUSES = new Set<SkillRunStatus>([
  "success",
  "completed",
  "failed",
  "error",
  "stopped",
  "cancelled",
]);

function isTerminalSkillRunStatus(status: SkillRunStatus) {
  return TERMINAL_SKILL_RUN_STATUSES.has(status);
}

/** 通过可恢复 SSE 订阅持久 Skill Run；事件只携带结构化进度，不含模型思维过程。 */
export function SkillRunLiveCard({
  runId,
  skillName,
  compact,
  onOpenAttachment,
}: {
  runId: string;
  skillName: string;
  compact?: boolean;
  onOpenAttachment?: (attachment: SkillRunAttachment, runId: string) => void;
}) {
  const [run, setRun] = React.useState<SkillRun>({
    id: runId,
    skillName,
    status: "queued",
    stageLabel: "正在连接任务…",
    progress: 0,
  });
  const [streamRevision, restartStream] = React.useReducer(
    (revision: number) => revision + 1,
    0
  );
  const upsertBackgroundMessage = useChatStore(
    (state) => state.upsertBackgroundMessage
  );
  const applySnapshot = React.useCallback(
    (nextRun: SkillRun) => {
      setRun(nextRun);
      if (nextRun.conversationId && nextRun.completionMessage) {
        upsertBackgroundMessage(nextRun.conversationId, nextRun.completionMessage);
      }
    },
    [upsertBackgroundMessage]
  );
  const refresh = React.useCallback(async () => {
    const response = await fetch(`/api/skill-runs/${encodeURIComponent(runId)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("无法读取 Skill 任务");
    applySnapshot((await response.json()) as SkillRun);
  }, [applySnapshot, runId]);

  React.useEffect(() => {
    let disposed = false;
    const source = new EventSource(
      `/api/skill-runs/${encodeURIComponent(runId)}/events`
    );
    source.addEventListener("snapshot", (event) => {
      if (disposed) return;
      try {
        const nextRun = JSON.parse(
          (event as MessageEvent<string>).data
        ) as SkillRun;
        applySnapshot(nextRun);
        // EventSource 会在服务端正常关闭后自动重连。终态任务无需继续订阅，
        // 否则每张历史任务卡都会永久产生 SSE + 快照请求。
        if (
          isTerminalSkillRunStatus(nextRun.status) &&
          (nextRun.completionReceiptStatus === "completed" ||
            nextRun.completionReceiptStatus === "failed")
        ) {
          disposed = true;
          source.close();
        }
      } catch {
        // 单个损坏事件不影响后续快照恢复。
      }
    });
    source.addEventListener("run-event", () => void refresh().catch(() => undefined));
    source.onerror = () => {
      if (!disposed) void refresh().catch(() => undefined);
    };
    return () => {
      disposed = true;
      source.close();
    };
  }, [applySnapshot, refresh, runId, streamRevision]);

  return (
    <SkillRunCard
      run={run}
      compact={compact}
      onStop={async () => {
        await fetch(`/api/skill-runs/${encodeURIComponent(runId)}`, {
          method: "DELETE",
        });
        await refresh();
      }}
      onRetry={async () => {
        await fetch(`/api/skill-runs/${encodeURIComponent(runId)}`, {
          method: "POST",
        });
        await refresh();
        // 终态快照会主动关闭 EventSource；重试后必须创建一条新订阅，
        // 否则卡片只停留在首次 refresh 的 queued/running 快照。
        restartStream();
      }}
      onOpenAttachment={
        onOpenAttachment ??
        ((attachment) => {
          if (attachment.url) window.open(attachment.url, "_blank", "noopener,noreferrer");
        })
      }
    />
  );
}

type VisualStatus = "pending" | "running" | "success" | "failed" | "stopped";

const STATUS_META: Record<
  VisualStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending: {
    label: "等待执行",
    icon: CircleIcon,
    className: "bg-muted text-muted-foreground",
  },
  running: {
    label: "执行中",
    icon: Loader2Icon,
    className:
      "bg-brand text-white shadow-[0_2px_8px_rgb(108_92_231/0.4)]",
  },
  success: {
    label: "已完成",
    icon: CheckIcon,
    className: "bg-success/10 text-success",
  },
  failed: {
    label: "执行失败",
    icon: AlertCircleIcon,
    className: "bg-destructive/10 text-destructive",
  },
  stopped: {
    label: "已停止",
    icon: XCircleIcon,
    className: "bg-muted text-muted-foreground",
  },
};

export function SkillRunCard({
  run,
  compact = false,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
  onStop,
  onRetry,
  onOpenAttachment,
  stopDisabled = false,
  retryDisabled = false,
  className,
}: SkillRunCardProps) {
  const [internalExpanded, setInternalExpanded] =
    React.useState(defaultExpanded);
  const expanded = controlledExpanded ?? internalExpanded;
  const steps = run.steps ?? [];
  const attachments = run.resultAttachments ?? [];
  const visualStatus = normalizeStatus(run.status);
  const statusMeta = STATUS_META[visualStatus];
  const StatusIcon = statusMeta.icon;
  const progress = normalizeProgress(run.progress, visualStatus);
  const sourceCount =
    run.sourceCount ??
    steps.reduce((total, step) => total + (step.sourceCount ?? 0), 0);
  const durationMs =
    run.durationMs ??
    steps.reduce((total, step) => total + (step.durationMs ?? 0), 0);
  const failedSteps = steps.filter(
    (step) => normalizeStatus(step.status) === "failed"
  );
  const canStop = visualStatus === "pending" || visualStatus === "running";
  const canRetry = visualStatus === "failed" || visualStatus === "stopped";
  const hasDetail =
    steps.length > 0 ||
    attachments.length > 0 ||
    Boolean(run.error) ||
    sourceCount > 0 ||
    durationMs > 0;

  const setExpanded = (next: boolean) => {
    if (controlledExpanded === undefined) setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  return (
    <section
      className={cn(
        "my-2 w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-card)]",
        visualStatus === "failed" && "border-destructive/35",
        className
      )}
      aria-label={`${run.skillName} Skill 运行信息`}
    >
      <div className={cn("flex min-w-0 items-start gap-3", compact ? "p-3" : "p-3.5 sm:p-4")}>
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl",
            statusMeta.className
          )}
        >
          <StatusIcon
            className={cn(
              "size-4",
              visualStatus === "running" && "animate-spin"
            )}
          />
        </span>

        <button
          type="button"
          onClick={() => hasDetail && setExpanded(!expanded)}
          className={cn(
            "min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            hasDetail ? "cursor-pointer" : "cursor-default"
          )}
          aria-expanded={hasDetail ? expanded : undefined}
          aria-controls={hasDetail ? `skill-run-${run.id}-details` : undefined}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{run.skillName}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                statusMeta.className
              )}
            >
              {statusMeta.label}
            </span>
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "min-w-0 truncate",
                visualStatus === "running" && "animate-thinking"
              )}
            >
              {run.stageLabel || fallbackStageLabel(visualStatus)}
            </span>
            {steps.length > 0 && <span>{steps.length} 个步骤</span>}
            {sourceCount > 0 && <span>{sourceCount} 个来源</span>}
            {durationMs > 0 && <span>{formatDuration(durationMs)}</span>}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {canStop && onStop && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onStop(run.id)}
              disabled={stopDisabled}
              aria-label={`停止 ${run.skillName}`}
              title="停止运行"
              className="text-muted-foreground hover:text-destructive"
            >
              <SquareIcon className="size-3" fill="currentColor" />
            </Button>
          )}
          {canRetry && onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onRetry(run.id)}
              disabled={retryDisabled}
              aria-label={`重试 ${run.skillName}`}
              title="重新运行"
            >
              <RotateCcwIcon />
            </Button>
          )}
          {hasDetail && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "收起运行详情" : "展开运行详情"}
              aria-expanded={expanded}
              aria-controls={`skill-run-${run.id}-details`}
            >
              <ChevronDownIcon
                className={cn(
                  "transition-transform duration-200",
                  expanded && "rotate-180"
                )}
              />
            </Button>
          )}
        </div>
      </div>

      {(visualStatus === "running" || progress > 0) && (
        <div
          className="h-1 w-full bg-muted"
          role="progressbar"
          aria-label={`${run.skillName} 执行进度`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <motion.div
            className={cn(
              "h-full rounded-r-full",
              visualStatus === "failed"
                ? "bg-destructive"
                : "bg-brand shadow-[0_0_8px_rgb(108_92_231/0.45)]"
            )}
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          />
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && hasDetail && (
          <motion.div
            id={`skill-run-${run.id}-details`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className={cn("border-t", compact ? "p-3" : "p-3.5 sm:p-4")}>
              {(sourceCount > 0 || durationMs > 0 || progress > 0) && (
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  {progress > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <WorkflowIcon className="size-3.5" />
                      {Math.round(progress)}%
                    </span>
                  )}
                  {sourceCount > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <GlobeIcon className="size-3.5" />
                      {sourceCount} 个来源
                    </span>
                  )}
                  {durationMs > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <ClockIcon className="size-3.5" />
                      耗时 {formatDuration(durationMs)}
                    </span>
                  )}
                </div>
              )}

              {steps.length > 0 && (
                <div className="space-y-1.5" aria-label="执行步骤">
                  {steps.map((step, index) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      index={index}
                      runId={run.id}
                      onRetry={onRetry}
                      retryDisabled={retryDisabled}
                    />
                  ))}
                </div>
              )}

              {(run.error || failedSteps.length > 0) && (
                <div className="mt-3 rounded-xl bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                  <div className="flex items-start gap-2">
                    <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                    <p className="min-w-0 flex-1 break-words">
                      {run.error || `${failedSteps.length} 个步骤执行失败`}
                    </p>
                    {canRetry && onRetry && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRetry(run.id)}
                        disabled={retryDisabled}
                        className="-my-1 h-7 shrink-0 px-2 text-destructive hover:text-destructive"
                      >
                        <RotateCcwIcon />
                        重试
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    最终附件
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {attachments.map((attachment) => (
                      <AttachmentEntry
                        key={attachment.id}
                        attachment={attachment}
                        runId={run.id}
                        onOpen={onOpenAttachment}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function StepRow({
  step,
  index,
  runId,
  onRetry,
  retryDisabled,
}: {
  step: SkillRunStep;
  index: number;
  runId: string;
  onRetry?: (runId: string, stepId?: string) => void;
  retryDisabled: boolean;
}) {
  const visualStatus = normalizeStatus(step.status);
  const meta = STATUS_META[visualStatus];
  const Icon = meta.icon;
  const isSubagent = step.kind === "subagent" || Boolean(step.subagentName);

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2.5 rounded-xl px-2.5 py-2 text-xs",
        visualStatus === "running" ? "bg-primary/5" : "bg-muted/35"
      )}
    >
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        <Icon
          className={cn(
            "size-3.5",
            visualStatus === "running" && "animate-spin text-primary",
            visualStatus === "success" && "text-success",
            visualStatus === "failed" && "text-destructive",
            (visualStatus === "pending" || visualStatus === "stopped") &&
              "text-muted-foreground"
          )}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="min-w-0 truncate font-medium">
            {index + 1}. {step.label}
          </span>
          {isSubagent && (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
              <BotIcon className="size-3" />
              <span className="truncate">子任务 · {step.subagentName}</span>
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
          <span>{meta.label}</span>
          {step.sourceCount ? <span>{step.sourceCount} 个来源</span> : null}
          {step.durationMs ? <span>{formatDuration(step.durationMs)}</span> : null}
          {step.retryCount ? <span>已重试 {step.retryCount} 次</span> : null}
        </div>
        {step.error && (
          <p className="mt-1 break-words text-[11px] text-destructive">
            {step.error}
          </p>
        )}
      </div>
      {visualStatus === "failed" && onRetry && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onRetry(runId, step.id)}
          disabled={retryDisabled}
          aria-label={`重试步骤：${step.label}`}
          title="重试此步骤"
          className="-mr-1 -mt-1 text-muted-foreground hover:text-destructive"
        >
          <RotateCcwIcon />
        </Button>
      )}
    </div>
  );
}

function AttachmentEntry({
  attachment,
  runId,
  onOpen,
}: {
  attachment: SkillRunAttachment;
  runId: string;
  onOpen?: (attachment: SkillRunAttachment, runId: string) => void;
}) {
  const content = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FileIcon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">
          {attachment.name}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {attachment.mimeType || "生成文件"}
          {attachment.sizeBytes
            ? ` · ${formatFileSize(attachment.sizeBytes)}`
            : ""}
        </span>
      </span>
      <DownloadIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </>
  );
  const entryClassName =
    "flex min-w-0 items-center gap-2 rounded-xl border bg-background px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(attachment, runId)}
        className={entryClassName}
      >
        {content}
      </button>
    );
  }

  if (attachment.url) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className={entryClassName}
      >
        {content}
      </a>
    );
  }

  return <div className={cn(entryClassName, "opacity-70")}>{content}</div>;
}

function normalizeStatus(status: SkillRunStepStatus): VisualStatus {
  if (status === "running") return "running";
  if (status === "success" || status === "completed") return "success";
  if (status === "failed" || status === "error") return "failed";
  if (status === "stopped" || status === "cancelled" || status === "skipped") {
    return "stopped";
  }
  return "pending";
}

function normalizeProgress(
  progress: number | undefined,
  status: VisualStatus
): number {
  if (progress === undefined || !Number.isFinite(progress)) {
    return status === "success" ? 100 : 0;
  }
  const normalized = progress > 0 && progress <= 1 ? progress * 100 : progress;
  return Math.min(100, Math.max(0, normalized));
}

function fallbackStageLabel(status: VisualStatus): string {
  if (status === "success") return "Skill 已完成";
  if (status === "failed") return "Skill 执行失败";
  if (status === "stopped") return "Skill 已停止";
  if (status === "running") return "正在执行 Skill";
  return "等待开始";
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
