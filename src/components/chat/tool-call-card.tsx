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
import type { ToolCallPart } from "@/lib/types";

const TOOL_META: Record<string, { icon: React.ElementType; label: (args: Record<string, unknown>) => string }> = {
  web_search: { icon: SearchIcon, label: (a) => `搜索「${a.query ?? ""}」` },
  web_read: { icon: GlobeIcon, label: (a) => `阅读 ${shortUrl(String(a.url ?? ""))}` },
  tavily_extract: { icon: GlobeIcon, label: (a) => `提取 ${shortUrl(String(a.url ?? ""))}` },
  tavily_crawl: { icon: GlobeIcon, label: (a) => `爬取 ${shortUrl(String(a.url ?? ""))}` },
  tavily_research: { icon: BrainCircuitIcon, label: () => "深度调研" },
  generate_image: { icon: PaletteIcon, label: () => "生成图片" },
  edit_image: { icon: ImageIcon, label: () => "编辑图片" },
  analyze_image: { icon: ScanEyeIcon, label: () => "识别图片" },
  run_code: { icon: CodeIcon, label: () => "运行代码" },
  save_memory: { icon: SparklesIcon, label: () => "记住了这一点" },
  search_memory: { icon: SparklesIcon, label: () => "回忆相关记忆" },
  search_knowledge: { icon: BookOpenIcon, label: (a) => `检索知识库「${a.query ?? ""}」` },
  create_artifact: { icon: CodeIcon, label: (a) => `创建作品「${a.title ?? ""}」` },
  update_artifact: { icon: CodeIcon, label: (a) => `更新作品「${a.title ?? ""}」` },
};

function shortUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 40);
  }
}

export function ToolCallCard({
  part,
  onOpenArtifact,
}: {
  part: ToolCallPart;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const meta = TOOL_META[part.toolName] ?? {
    icon: WrenchIcon,
    label: () => part.toolName,
  };
  const Icon = meta.icon;
  const artifactId = part.result?.artifactId;
  const hasDetail =
    !!part.result?.sources?.length ||
    !!part.result?.chunks?.length ||
    !!part.errorMessage;

  // Artifact 卡片：点击打开右侧面板
  if (artifactId && part.state === "success") {
    return (
      <button
        onClick={() => onOpenArtifact?.(artifactId)}
        className="group/artifact my-2 flex w-full max-w-md items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-all first:mt-0 hover:-translate-y-px hover:border-primary/40 hover:shadow-sm"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CodeIcon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {String(part.args.title ?? "作品")}
          </span>
          <span className="block text-xs text-muted-foreground">
            点击打开 · 可预览与运行
          </span>
        </span>
        <ChevronDownIcon className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-hover/artifact:translate-x-0.5" />
      </button>
    );
  }

  return (
    <div className="my-2 first:mt-0">
      <button
        onClick={() => hasDetail && setOpen(!open)}
        className={cn(
          "flex w-full max-w-md items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left text-[13px] transition-colors",
          hasDetail && "cursor-pointer hover:bg-accent/50",
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
            {meta.label(part.args)}
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
        </span>
        {part.state === "success" && !hasDetail && (
          <CheckIcon className="size-3.5 shrink-0 text-success" />
        )}
        {hasDetail && (
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && hasDetail && (
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
