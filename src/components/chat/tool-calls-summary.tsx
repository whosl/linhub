"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCallPart, WebSource } from "@/lib/types";

/** web 类工具：结果以 sources 形式呈现，适合折叠 + 来源区 */
export function isWebTool(toolName: string): boolean {
  return (
    toolName === "web_search" ||
    toolName === "web_read" ||
    toolName === "web_crawl" ||
    toolName.startsWith("tavily_")
  );
}

const WEB_VERB: Record<string, string> = {
  web_search: "搜索",
  web_read: "阅读",
  web_crawl: "爬取",
  tavily_extract: "提取",
  tavily_crawl: "爬取",
  tavily_research: "调研",
};

/** 从原始 JSON 片段里提取第一个字符串值，供参数生成中的实时预览 */
function extractPreviewValue(raw: string): string | null {
  const m = raw.match(/"([^"]+)"\s*:\s*"([^"]*)/);
  if (m) return m[2] || null;
  const m2 = raw.match(/:\s*"([^"]*)/);
  return m2 ? m2[1] || null : null;
}

/** 把多条 web 工具调用的 sources 摊平 + 按 url 去重 */
function collectSources(parts: ToolCallPart[]): WebSource[] {
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const p of parts) {
    const sources = p.result?.sources;
    if (!sources) continue;
    for (const s of sources) {
      const key = s.url;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(s);
      }
    }
  }
  return out;
}

function faviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  } catch {
    return "";
  }
}

/**
 * web 类工具调用的折叠行组（含来源列表，全部默认折叠）。
 * 替代原来垂直堆叠的大卡片，参考 ChatGPT / Claude.ai 的紧凑设计——
 * 默认只占一行，点开才看到详情和来源。
 */
export function ToolCallsSummary({ parts }: { parts: ToolCallPart[] }) {
  const [expanded, setExpanded] = React.useState(false);
  const webParts = parts.filter((p) => isWebTool(p.toolName));
  const sources = React.useMemo(() => collectSources(webParts), [webParts]);

  if (webParts.length === 0) return null;

  const running = webParts.filter((p) => p.state === "running");
  const done = webParts.filter((p) => p.state === "success");

  // 摘要文案：正在搜索 2 项… / 已搜索 3 次
  let summary: string;
  if (running.length > 0) {
    summary = `正在${verbFor(running[0])}…`;
  } else if (done.length > 0) {
    summary = `已${verbFor(done[0])} ${webParts.length} 次`;
  } else {
    summary = `${webParts.length} 次工具调用`;
  }

  return (
    <>
      {/* 折叠行：替代原来堆叠的大卡片 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="my-1.5 flex items-center gap-2 rounded-lg text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <SearchIcon className="size-3.5" />
        <span className={cn(running.length > 0 && "animate-thinking")}>
          {summary}
        </span>
        {sources.length > 0 && (
          <span className="text-xs text-muted-foreground/70">
            · {sources.length} 个来源
          </span>
        )}
        <ChevronDownIcon
          className={cn(
            "size-3.5 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* 展开后：每次调用的单行摘要 + 来源列表（默认折叠，不占空间） */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mb-1 space-y-0.5 pl-5">
              {webParts.map((p, i) => (
                <ToolCallRow key={p.toolCallId ?? i} part={p} />
              ))}
            </div>
            {sources.length > 0 && (
              <div className="ml-5 border-l border-border pl-3">
                <SourcesList sources={sources} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function verbFor(part: ToolCallPart): string {
  return WEB_VERB[part.toolName] ?? "调用";
}

/** 展开后的单行工具调用摘要 */
function ToolCallRow({ part }: { part: ToolCallPart }) {
  const isGenerating = part.state === "running" && part.inputPreview != null;
  const preview = isGenerating ? extractPreviewValue(part.inputPreview!) : null;
  const query = (part.args.query as string) ?? (part.args.url as string) ?? "";
  const label = preview ?? query;

  return (
    <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
      <span className="flex size-4 shrink-0 items-center justify-center">
        {part.state === "running" ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : part.state === "error" ? (
          <AlertCircleIcon className="size-3 text-destructive" />
        ) : (
          <CheckIcon className="size-3 text-success" />
        )}
      </span>
      <span className="truncate">
        {verbFor(part)}
        {label ? `「${label}」` : "…"}
      </span>
      {part.state === "success" && part.result?.sources?.length ? (
        <span className="shrink-0 text-muted-foreground/60">
          {part.result.sources.length} 条
        </span>
      ) : null}
    </div>
  );
}

/** 来源列表：单行横向 chip，参考 ChatGPT 收起态（无 snippet、无边框） */
function SourcesList({ sources }: { sources: WebSource[] }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
      {sources.map((s, i) => (
        <a
          key={s.url + i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          title={s.snippet ? `${s.title} — ${s.snippet}` : s.title}
          className="group/source inline-flex max-w-[220px] items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {faviconUrl(s.url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl(s.url)}
              alt=""
              className="size-3.5 shrink-0 rounded-sm"
            />
          ) : (
            <GlobeIcon className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{s.title}</span>
        </a>
      ))}
    </div>
  );
}
