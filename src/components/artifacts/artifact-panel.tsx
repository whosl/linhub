"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  Link2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

export function ArtifactPanel({
  artifact,
  onClose,
}: {
  artifact: Artifact;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<"preview" | "code">("preview");
  const [version, setVersion] = React.useState(artifact.currentVersion);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setVersion(artifact.currentVersion);
  }, [artifact.id, artifact.currentVersion]);

  const current =
    artifact.versions.find((v) => v.version === version) ??
    artifact.versions[artifact.versions.length - 1];

  const previewable = ["html", "react", "svg", "markdown", "mermaid"].includes(
    artifact.kind
  );

  const copy = async () => {
    await navigator.clipboard.writeText(current.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
              : artifact.language ?? "txt";
    const blob = new Blob([current.content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${artifact.title}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const share = async () => {
    const { shareToken } = await getDataService().shareArtifact(artifact.id);
    await navigator.clipboard.writeText(
      `${location.origin}/share/artifact/${shareToken}`
    );
    toast.success("分享链接已复制");
  };

  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="flex h-full min-w-0 flex-1 flex-col border-l bg-card"
    >
      {/* 头部 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {artifact.title}
        </span>

        {/* 版本切换 */}
        {artifact.versions.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent">
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

        {/* 预览/代码切换 */}
        {previewable && (
          <div className="flex items-center rounded-lg bg-muted p-0.5">
            <button
              onClick={() => setTab("preview")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                tab === "preview" ? "bg-card shadow-sm" : "text-muted-foreground"
              )}
            >
              <EyeIcon className="size-3" /> 预览
            </button>
            <button
              onClick={() => setTab("code")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                tab === "code" ? "bg-card shadow-sm" : "text-muted-foreground"
              )}
            >
              <CodeIcon className="size-3" /> 代码
            </button>
          </div>
        )}

        <Tooltip label="复制代码">
          <button onClick={copy} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            {copied ? <CheckIcon className="size-4 text-success" /> : <CopyIcon className="size-4" />}
          </button>
        </Tooltip>
        <Tooltip label="下载">
          <button onClick={download} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <DownloadIcon className="size-4" />
          </button>
        </Tooltip>
        <Tooltip label="分享链接">
          <button onClick={share} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Link2Icon className="size-4" />
          </button>
        </Tooltip>
        <Tooltip label="关闭">
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <XIcon className="size-4" />
          </button>
        </Tooltip>
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "preview" && previewable ? (
          <ArtifactPreview artifact={artifact} content={current.content} />
        ) : (
          <div className="p-3 [&>div]:my-0">
            <CodeBlock
              language={artifact.language ?? KIND_LANGUAGE[artifact.kind]}
              code={current.content}
            />
          </div>
        )}
      </div>
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
