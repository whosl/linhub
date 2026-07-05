"use client";

import * as React from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  Loader2Icon,
  PlayIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { codeToHtml } from "shiki";
import { useTheme } from "next-themes";

const COLLAPSE_THRESHOLD = 24; // 行数超过则可折叠

export function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const { resolvedTheme } = useTheme();
  const [html, setHtml] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const lines = code.split("\n").length;
  const collapsible = lines > COLLAPSE_THRESHOLD;
  const [collapsed, setCollapsed] = React.useState(collapsible);

  React.useEffect(() => {
    let cancelled = false;
    codeToHtml(code, {
      lang: language || "text",
      theme: resolvedTheme === "dark" ? "vesper" : "github-light",
    })
      .then((out) => {
        if (!cancelled) setHtml(out);
      })
      .catch(() => {
        // 未知语言回退为纯文本
        codeToHtml(code, {
          lang: "text",
          theme: resolvedTheme === "dark" ? "vesper" : "github-light",
        }).then((out) => {
          if (!cancelled) setHtml(out);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [code, language, resolvedTheme]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const lang = language.toLowerCase();
  const runnable = ["python", "py", "javascript", "js", "html"].includes(lang);
  const [running, setRunning] = React.useState(false);
  const [output, setOutput] = React.useState<string | null>(null);
  const [showHtmlPreview, setShowHtmlPreview] = React.useState(false);

  const run = async () => {
    if (running) return;
    if (lang === "html") {
      setShowHtmlPreview((v) => !v);
      return;
    }
    setRunning(true);
    setOutput(null);
    try {
      const runner = await import("@/lib/code-runner");
      const result =
        lang === "python" || lang === "py"
          ? await runner.runPython(code)
          : await runner.runJavaScript(code);
      setOutput(result);
    } catch (e) {
      setOutput(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border bg-card">
      <div className="flex h-9 items-center justify-between border-b bg-muted/60 pl-3.5 pr-1.5">
        <span className="font-mono text-xs text-muted-foreground">
          {language || "text"}
        </span>
        <div className="flex items-center gap-0.5">
          {runnable && (
            <button
              onClick={run}
              disabled={running}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
              title={lang === "html" ? "预览 HTML" : "在浏览器沙箱中运行"}
            >
              {running ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <PlayIcon className="size-3" />
              )}
              {lang === "html" ? (showHtmlPreview ? "收起预览" : "预览") : "运行"}
            </button>
          )}
          <button
            onClick={copy}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? (
              <>
                <CheckIcon className="size-3 text-success" /> 已复制
              </>
            ) : (
              <>
                <CopyIcon className="size-3" /> 复制
              </>
            )}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "relative overflow-x-auto text-[13px] leading-relaxed transition-all [&_pre]:!bg-transparent [&_pre]:p-3.5 [&_pre]:!outline-none",
          collapsed && "max-h-[430px] overflow-y-hidden"
        )}
      >
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="p-3.5 font-mono">{code}</pre>
        )}
        {collapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />
        )}
      </div>

      {/* HTML 预览 */}
      {showHtmlPreview && (
        <iframe
          srcDoc={code}
          sandbox="allow-scripts"
          className="h-72 w-full border-t bg-white"
          title="HTML 预览"
        />
      )}

      {/* 运行输出 */}
      {output !== null && (
        <div className="border-t">
          <div className="flex items-center justify-between bg-muted/40 px-3.5 py-1">
            <span className="text-[11px] font-medium text-muted-foreground">输出</span>
            <button
              onClick={() => setOutput(null)}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent"
            >
              <XIcon className="size-3" />
            </button>
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-3.5 py-2.5 font-mono text-xs text-foreground/90">
            {output}
          </pre>
        </div>
      )}

      {collapsible && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center gap-1 border-t py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
        >
          <ChevronDownIcon
            className={cn("size-3.5 transition-transform", !collapsed && "rotate-180")}
          />
          {collapsed ? `展开全部 ${lines} 行` : "收起"}
        </button>
      )}
    </div>
  );
}
