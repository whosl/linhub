"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  DownloadIcon,
  EyeIcon,
  Link2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/clipboard";
import { CopyFallbackDialog } from "@/components/ui/copy-fallback-dialog";
import type { Artifact } from "@/lib/types";
import { getDataService } from "@/lib/data";
import { CodeBlock } from "@/components/chat/markdown/code-block";
import { MarkdownRenderer } from "@/components/chat/markdown/markdown-renderer";
import { MermaidBlock } from "@/components/chat/markdown/mermaid-block";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "sonner";

/** React artifact：iframe 内用 Babel standalone 即时编译 JSX/TSX */
function buildReactPreviewDoc(source: string): string {
  const escaped = source
    // UMD 环境没有模块系统：剥离 import/export，React hooks 通过全局解构提供
    .replace(/^import\s+[^;]+;?\s*$/gm, "")
    .replace(/export\s+default\s+/g, "const __default = ")
    .replace(/^export\s+/gm, "")
    .replace(/<\/script>/gi, "<\\/script>");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>
<style>body{margin:0;font-family:system-ui,sans-serif}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
const { useState, useEffect, useMemo, useCallback, useRef, useReducer, useContext } = React;
${escaped}

const __candidates = [typeof App !== "undefined" && App, typeof Component !== "undefined" && Component].filter(Boolean);
const __Comp = (typeof __default !== "undefined" && __default) || __candidates[0];
if (__Comp) {
  ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(__Comp));
} else {
  document.getElementById("root").innerHTML = '<p style="padding:16px;color:#888">未找到可渲染的组件（请导出 App）</p>';
}
<\/script>
</body>
</html>`;
}

const KIND_LANGUAGE: Record<Artifact["kind"], string> = {
  html: "html",
  react: "tsx",
  svg: "xml",
  markdown: "markdown",
  code: "text",
  mermaid: "mermaid",
};

const LANGUAGE_EXTENSION_ALIASES: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  markdown: "md",
  python: "py",
  "c++": "cpp",
  "c#": "cs",
};

export function getArtifactCodeLanguage(
  artifact: Pick<Artifact, "kind" | "language">
) {
  return artifact.kind === "code"
    ? artifact.language ?? KIND_LANGUAGE.code
    : KIND_LANGUAGE[artifact.kind];
}

function safeFileExtension(raw: string | null | undefined, fallback = "txt") {
  const normalized = raw?.trim().toLowerCase() ?? "";
  const mimeTail = normalized.includes("/") ? normalized.split("/").pop() : normalized;
  const aliased =
    LANGUAGE_EXTENSION_ALIASES[normalized] ??
    LANGUAGE_EXTENSION_ALIASES[mimeTail ?? ""] ??
    mimeTail ??
    "";
  const cleaned = aliased.replace(/^\.+/, "").replace(/[^a-z0-9]+/g, "");
  return cleaned.slice(0, 16) || fallback;
}

function useDesktopArtifactLayout() {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 1024px)").matches
  );

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

export function ArtifactPanel({
  artifact,
  onClose,
}: {
  artifact: Artifact;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<"preview" | "code">("preview");
  const [version, setVersion] = React.useState(artifact.currentVersion);
  const [manualCopyText, setManualCopyText] = React.useState<string | null>(null);
  const isDesktop = useDesktopArtifactLayout();

  React.useEffect(() => {
    Promise.resolve().then(() => setVersion(artifact.currentVersion));
  }, [artifact.id, artifact.currentVersion]);

  const current =
    artifact.versions.find((v) => v.version === version) ??
    artifact.versions[artifact.versions.length - 1];

  const previewable = ["html", "react", "svg", "markdown", "mermaid"].includes(
    artifact.kind
  );
  const codeLanguage = getArtifactCodeLanguage(artifact);

  const download = () => {
    const ext =
      artifact.kind === "html"
        ? "html"
        : artifact.kind === "react"
          ? "tsx"
          : artifact.kind === "svg"
            ? "svg"
            : artifact.kind === "markdown"
              ? "md"
              : artifact.kind === "mermaid"
                ? "mmd"
                : safeFileExtension(artifact.language);
    const blob = new Blob([current.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle =
      artifact.title.trim().replace(/[\\/:*?"<>|]+/g, "_") || "artifact";
    a.href = url;
    a.download = `${safeTitle}.${ext}`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  };

  const share = async () => {
    try {
      const { shareToken } = await getDataService().shareArtifact(artifact.id);
      const url = `${location.origin}/share/artifact/${shareToken}`;
      try {
        await copyTextToClipboard(url);
        toast.success("分享链接已复制");
      } catch {
        setManualCopyText(url);
        toast.info("已打开手动复制窗口");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成分享链接失败");
    }
  };

  return (
    <motion.div
      initial={isDesktop ? { opacity: 0, x: 48 } : { opacity: 0, y: 56 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={isDesktop ? { opacity: 0, x: 48 } : { opacity: 0, y: 56 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="fixed inset-x-0 bottom-0 top-20 z-30 flex min-w-0 flex-col overflow-hidden rounded-t-2xl border-t bg-card/95 shadow-2xl backdrop-blur-xl lg:relative lg:inset-auto lg:z-auto lg:h-full lg:w-[54%] lg:flex-none lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none lg:backdrop-blur-none"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-[var(--glass-bg)] px-3 backdrop-blur-[16px] sm:h-12">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {artifact.title}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {artifact.versions.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-full border bg-muted/70 px-2.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground">
                  v{version}
                  <ChevronDownIcon className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {[...artifact.versions].reverse().map((v) => (
                  <DropdownMenuItem key={v.version} onClick={() => setVersion(v.version)}>
                    版本 {v.version}
                    {v.version === version && <CheckIcon className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {previewable && (
            <div className="flex h-8 shrink-0 items-center rounded-lg bg-muted p-0.5">
              <button
                onClick={() => setTab("preview")}
                className={cn(
                  "flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors",
                  tab === "preview" ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                <EyeIcon className="size-3" />
                <span className="max-[420px]:hidden">预览</span>
              </button>
              <button
                onClick={() => setTab("code")}
                className={cn(
                  "flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors",
                  tab === "code" ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                <CodeIcon className="size-3" />
                <span className="max-[420px]:hidden">代码</span>
              </button>
            </div>
          )}

          <Tooltip label="下载">
            <button
              onClick={download}
              aria-label="下载"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <DownloadIcon className="size-4" />
            </button>
          </Tooltip>
          <Tooltip label="分享链接">
            <button
              onClick={share}
              aria-label="分享链接"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Link2Icon className="size-4" />
            </button>
          </Tooltip>
          <Tooltip label="关闭">
            <button
              onClick={onClose}
              aria-label="关闭"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "preview" && previewable ? (
          <ArtifactPreview artifact={artifact} content={current.content} />
        ) : (
          <div className="p-3 [&>div]:my-0">
            <CodeBlock
              language={codeLanguage}
              code={current.content}
              showRunButton={artifact.kind !== "html"}
            />
          </div>
        )}
      </div>
      <CopyFallbackDialog
        text={manualCopyText}
        onClose={() => setManualCopyText(null)}
      />
    </motion.div>
  );
}

export function ArtifactPreview({
  artifact,
  content,
}: {
  artifact: Artifact;
  content: string;
}) {
  if (artifact.kind === "html") {
    return (
      <iframe
        srcDoc={content}
        sandbox="allow-scripts"
        className="size-full border-0 bg-white"
        title={artifact.title}
      />
    );
  }
  if (artifact.kind === "react") {
    return (
      <iframe
        srcDoc={buildReactPreviewDoc(content)}
        sandbox="allow-scripts"
        className="size-full border-0 bg-white"
        title={artifact.title}
      />
    );
  }
  if (artifact.kind === "svg") {
    // SVG 可含脚本/事件属性，与 html 一样放进 sandbox iframe 渲染（防主页面 XSS）
    const svgDoc = `<!doctype html><html><head><style>
      html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fff}
      svg{max-width:100%;max-height:100%}
    </style></head><body>${content}</body></html>`;
    return (
      <iframe
        srcDoc={svgDoc}
        sandbox="allow-scripts"
        className="size-full border-0 bg-white"
        title={artifact.title}
      />
    );
  }
  if (artifact.kind === "markdown") {
    return (
      <div className="p-6">
        <MarkdownRenderer content={content} />
      </div>
    );
  }
  if (artifact.kind === "mermaid") {
    return (
      <div className="p-6">
        <MermaidBlock code={content} />
      </div>
    );
  }
  return null;
}
