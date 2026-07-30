// Shiki 代码高亮块:懒加载 shiki、语言标签栏 + 复制按钮、超 24 行折叠

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { useIsDark } from "@/hooks/use-is-dark";
import { cn } from "@/lib/cn";

const COLLAPSE_LINES = 24;

let shikiPromise: Promise<typeof import("shiki")> | null = null;

/** 懒加载 shiki(整个高亮库不进首包);shiki 的 codeToHtml 内部缓存高亮器单例 */
function loadShiki(): Promise<typeof import("shiki")> {
  shikiPromise ??= import("shiki");
  return shikiPromise;
}

export function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const dark = useIsDark();
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const text = code.replace(/\n$/, "");
  const lineCount = text.split("\n").length;
  const collapsible = lineCount > COLLAPSE_LINES;

  useEffect(() => {
    let cancelled = false;
    loadShiki()
      .then((shiki) =>
        shiki.codeToHtml(text, {
          lang: language || "text",
          theme: dark ? "github-dark" : "github-light",
        }),
      )
      .catch(() =>
        // 未知语言回退纯文本高亮
        loadShiki().then((shiki) =>
          shiki.codeToHtml(text, {
            lang: "text",
            theme: dark ? "github-dark" : "github-light",
          }),
        ),
      )
      .then((h) => {
        if (!cancelled) setHtml(h);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [text, language, dark]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border border-border">
      {/* 语言标签栏 + 复制 */}
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-1.5">
        <span className="text-xs font-medium text-text-3">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md px-1.5 py-0.5 text-xs text-text-3 transition-colors hover:bg-surface hover:text-text"
        >
          {copied ? "✓ 已复制" : "复制"}
        </button>
      </div>
      <div
        className={cn(
          "relative overflow-x-auto text-sm",
          collapsible && !expanded && "max-h-[32rem] overflow-y-hidden",
        )}
      >
        {html ? (
          <div
            className="[&_pre]:m-0 [&_pre]:overflow-visible [&_pre]:p-3 [&_code]:font-mono"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="m-0 bg-surface-2 p-3 font-mono whitespace-pre text-text">
            {text}
          </pre>
        )}
        {collapsible && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-2 to-transparent" />
        )}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-border bg-surface-2 py-1.5 text-xs text-text-3 hover:text-text"
        >
          {expanded ? "收起" : `展开全部 ${lineCount} 行`}
        </button>
      )}
    </div>
  );
}
