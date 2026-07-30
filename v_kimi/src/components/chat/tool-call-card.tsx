"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircleIcon,
  BookOpenIcon,
  BrainCircuitIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  DownloadIcon,
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  Loader2Icon,
  PaletteIcon,
  ScanEyeIcon,
  SearchIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatToolPreviewLabel } from "@/lib/chat-text";
import type { ToolCallPart } from "@/lib/types";
import {
  SkillRunLiveCard,
  type SkillRunAttachment,
} from "./skill-run-card";
import { PptStudioBriefCard } from "./ppt-studio-brief-card";

const TOOL_META: Record<string, { icon: React.ElementType; verb: string; label: (args: Record<string, unknown>) => string }> = {
  web_search: { icon: SearchIcon, verb: "搜索", label: (a) => `搜索「${a.query ?? ""}」` },
  web_read: { icon: GlobeIcon, verb: "阅读", label: (a) => `阅读 ${shortUrl(String(a.url ?? ""))}` },
  tavily_extract: { icon: GlobeIcon, verb: "提取", label: (a) => `提取 ${shortUrl(String(a.url ?? ""))}` },
  tavily_crawl: { icon: GlobeIcon, verb: "爬取", label: (a) => `爬取 ${shortUrl(String(a.url ?? ""))}` },
  tavily_research: { icon: BrainCircuitIcon, verb: "调研", label: () => "深度调研" },
  start_deep_research: { icon: BrainCircuitIcon, verb: "调研", label: () => "启动深度调研" },
  start_data_analysis: { icon: CodeIcon, verb: "分析", label: () => "启动数据分析" },
  start_ppt_studio: { icon: FileTextIcon, verb: "制作", label: () => "打开 PPT 工作室" },
  generate_image: { icon: PaletteIcon, verb: "生成图片", label: () => "生成图片" },
  edit_image: { icon: ImageIcon, verb: "编辑图片", label: () => "编辑图片" },
  analyze_image: { icon: ScanEyeIcon, verb: "识别图片", label: () => "识别图片" },
  run_code: { icon: CodeIcon, verb: "运行代码", label: () => "运行代码" },
  save_memory: { icon: SparklesIcon, verb: "记录", label: () => "记住了这一点" },
  search_memory: { icon: SparklesIcon, verb: "回忆", label: () => "回忆相关记忆" },
  search_knowledge: { icon: BookOpenIcon, verb: "检索", label: (a) => `检索知识库「${a.query ?? ""}」` },
  create_artifact: { icon: CodeIcon, verb: "创建作品", label: (a) => `创建作品「${a.title ?? ""}」` },
  update_artifact: { icon: CodeIcon, verb: "更新作品", label: (a) => `更新作品「${a.title ?? ""}」` },
  list_skill_resources: { icon: BookOpenIcon, verb: "读取技能", label: () => "查看技能资源" },
  read_skill_resource: { icon: BookOpenIcon, verb: "读取技能", label: (a) => `读取资源「${a.resourceId ?? ""}」` },
  run_skill_script: { icon: CodeIcon, verb: "运行脚本", label: () => "运行技能脚本" },
  pptx_extract_text: { icon: FileTextIcon, verb: "读取 PPT", label: () => "提取 PPT 内容" },
  pptx_analyze_template: { icon: FileTextIcon, verb: "分析 PPT", label: () => "分析 PPT 模板" },
  pptx_create_deck: { icon: FileTextIcon, verb: "生成 PPT", label: (a) => `生成 PPT「${a.title ?? ""}」` },
  dashi_query_layouts: { icon: PaletteIcon, verb: "选择版式", label: (a) => `查询 ${a.theme ?? "Dashi"} 版式` },
  dashi_inspect_layouts: { icon: ScanEyeIcon, verb: "检查版式", label: () => "检查 Dashi 页面字段" },
  dashi_render_deck: { icon: FileTextIcon, verb: "生成 PPT", label: () => "渲染 Dashi PPT" },
};

function shortUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 40);
  }
}

/**
 * 从工具参数生成的原始 JSON 片段里提取可读预览。
 * 模型流式生成 tool input 时是 JSON 增量（如 {"query":"最新黑），
 * 这里用正则抓取第一个字符串值，给用户一个"正在搜索 XX"的实时反馈。
 */
function extractPreviewValue(raw: string): string | null {
  // 匹配 "key":"value 片段，取 value 部分（可能未闭合）
  const m = raw.match(/"([^"]+)"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (m?.[2]) return formatToolPreviewLabel(m[2]) || null;
  // 兜底：匹配裸字符串值
  const m2 = raw.match(/:\s*"((?:\\.|[^"\\])*)/);
  return m2?.[1] ? formatToolPreviewLabel(m2[1]) || null : null;
}

export function ToolCallCard({
  part,
  onOpenArtifact,
  showDeliverables = true,
}: {
  part: ToolCallPart;
  onOpenArtifact?: (artifactId: string) => void;
  showDeliverables?: boolean;
}) {
  const [manualOpen, setManualOpen] = React.useState<boolean | null>(null);
  const meta = TOOL_META[part.toolName] ?? {
    icon: WrenchIcon,
    verb: "调用",
    label: () => part.toolName,
  };
  const Icon = meta.icon;
  const artifactId = part.result?.artifactId;
  const skillRunId = part.result?.skillRunId;
  const artifactTitle = part.result?.artifactTitle ?? part.args.title ?? "作品";
  const hasDetail =
    !!part.result?.sources?.length ||
    !!part.result?.chunks?.length ||
    !!(showDeliverables && part.result?.attachments?.length) ||
    !!part.result?.text ||
    !!part.errorMessage;
  const detailOpen = hasDetail && (manualOpen ?? part.state === "error");

  // 工具参数生成中（tool-input-delta 阶段）：args 还没结构化，
  // 从原始 JSON 片段里提取引号内的字符串作为可读预览。
  const isGenerating = part.state === "running" && part.inputPreview != null;
  const previewText = isGenerating ? extractPreviewValue(part.inputPreview!) : null;

  // Artifact 卡片：点击打开右侧面板
  if (showDeliverables && skillRunId && part.state === "success") {
    if (part.toolName === "start_ppt_studio") {
      return (
        <PptStudioBriefCard
          runId={skillRunId}
          skillName={part.result?.skillName ?? "PPT 工作室"}
          initialTopic={typeof part.args.topic === "string" ? part.args.topic : ""}
        />
      );
    }
    return (
      <SkillRunLiveCard
        runId={skillRunId}
        skillName={part.result?.skillName ?? "Skill"}
      />
    );
  }
  if (showDeliverables && artifactId && part.state === "success") {
    return <ArtifactDeliverable id={artifactId} title={String(artifactTitle)} onOpen={onOpenArtifact} />;
  }

  return (
    <div className="my-2 first:mt-0">
      <button
        onClick={() => hasDetail && setManualOpen(!detailOpen)}
        className={cn(
          "flex w-full max-w-md items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left text-[13px] shadow-[var(--shadow-card)] transition-all duration-200",
          hasDetail && "cursor-pointer hover:-translate-y-px hover:border-primary/30 hover:shadow-[var(--shadow-lift)]",
          part.state === "error" && "border-destructive/40"
        )}
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-lg",
            part.state === "running" && "bg-primary/10 text-primary",
            part.state === "success" && "bg-success/10 text-success",
            part.state === "error" && "bg-destructive/10 text-destructive"
          )}
        >
          {part.state === "running" ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : part.state === "error" ? (
            <AlertCircleIcon className="size-3.5" />
          ) : (
            <Icon className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", part.state === "running" && "animate-thinking")}>
            {formatToolPreviewLabel(
              isGenerating && previewText
                ? // 参数生成中且有预览：显示实时关键词（搜索/阅读/检索等）
                  meta.label({ query: previewText, url: previewText, title: previewText })
                : isGenerating
                  ? `${meta.verb}…`
                  : meta.label(part.args)
            )}
          </span>
          {part.state === "success" && part.result?.sources && (
            <span className="block text-xs text-muted-foreground">
              找到 {part.result.sources.length} 个来源
            </span>
          )}
          {part.state === "success" && part.result?.chunks && (
            <span className="block text-xs text-muted-foreground">
              命中 {part.result.chunks.length} 个片段
            </span>
          )}
          {part.state === "success" && part.result?.attachments && (
            <span className="block text-xs text-muted-foreground">
              生成 {part.result.attachments.length} 个文件
            </span>
          )}
        </span>
        {part.state === "success" && !hasDetail && (
          <CheckIcon className="size-3.5 shrink-0 text-success" />
        )}
        {hasDetail && (
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              detailOpen && "rotate-180"
            )}
          />
        )}
      </button>

      <AnimatePresence initial={false}>
        {detailOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 max-w-md space-y-1.5 pl-1">
              {part.errorMessage && (
                <p className="rounded-lg bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {part.errorMessage}
                </p>
              )}
              {part.result?.sources?.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/50"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <GlobeIcon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{s.title}</span>
                  </span>
                  {s.snippet && (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                      {s.snippet}
                    </span>
                  )}
                </a>
              ))}
              {part.result?.chunks?.map((c, i) => (
                <div key={i} className="rounded-lg border bg-card px-3 py-2">
                  <span className="flex items-center justify-between text-xs font-medium">
                    <span className="truncate">{c.documentName}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {(c.score * 100).toFixed(0)}% 相关
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                    {c.snippet}
                  </span>
                </div>
              ))}
              {showDeliverables && part.result?.attachments?.map((file) => (
                <a
                  key={file.id}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs transition-colors hover:bg-accent/50"
                >
                  <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                  <DownloadIcon className="size-3.5 shrink-0 text-muted-foreground" />
                </a>
              ))}
              {part.result?.text && (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 px-3 py-2 text-xs text-foreground">
                  {part.result.text}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ToolResultDeliverables({
  part,
  onOpenArtifact,
  onOpenAttachment,
}: {
  part: ToolCallPart;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenAttachment?: (attachment: SkillRunAttachment, runId: string) => void;
}) {
  if (part.state !== "success") return null;
  const skillRunId = part.result?.skillRunId;
  if (skillRunId) {
    if (part.toolName === "start_ppt_studio") {
      return (
        <PptStudioBriefCard
          runId={skillRunId}
          skillName={part.result?.skillName ?? "PPT 工作室"}
          initialTopic={typeof part.args.topic === "string" ? part.args.topic : ""}
          onOpenAttachment={onOpenAttachment}
        />
      );
    }
    return (
      <SkillRunLiveCard
        runId={skillRunId}
        skillName={part.result?.skillName ?? "Skill"}
        onOpenAttachment={onOpenAttachment}
      />
    );
  }
  const artifactId = part.result?.artifactId;
  const artifactTitle = part.result?.artifactTitle ?? part.args.title ?? "作品";
  const attachments = part.result?.attachments ?? [];
  if (!artifactId && attachments.length === 0) return null;

  return (
    <div className="my-2 max-w-md space-y-2 first:mt-0">
      {artifactId && (
        <ArtifactDeliverable
          id={artifactId}
          title={String(artifactTitle)}
          onOpen={onOpenArtifact}
        />
      )}
      {attachments.map((file) => {
        const content = (
          <>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileTextIcon className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{file.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {file.mimeType || "生成文件"} · 点击下载
            </span>
          </span>
          <DownloadIcon className="size-4 shrink-0 text-muted-foreground" />
          </>
        );
        const className =
          "flex w-full items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-[var(--shadow-lift)]";
        return onOpenAttachment ? (
          <button
            key={file.id}
            type="button"
            onClick={() =>
              onOpenAttachment(
                {
                  id: file.id,
                  name: file.name,
                  mimeType: file.mimeType,
                  sizeBytes: file.size,
                  url: file.url,
                },
                "tool-result"
              )
            }
            className={className}
          >
            {content}
          </button>
        ) : (
          <a
            key={file.id}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}

function ArtifactDeliverable({
  id,
  title,
  onOpen,
}: {
  id: string;
  title: string;
  onOpen?: (artifactId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(id)}
      className="group/artifact flex w-full items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-[var(--shadow-lift)]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-[0_2px_8px_rgb(108_92_231/0.35)]">
        <CodeIcon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">点击打开 · 可预览、运行与下载</span>
      </span>
      <ChevronDownIcon className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-hover/artifact:translate-x-0.5" />
    </button>
  );
}
