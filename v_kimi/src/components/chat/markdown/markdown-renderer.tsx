"use client";

import * as React from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import {
  normalizeMarkdownBlockBoundaries,
  normalizeTrustedLinHubUrl,
} from "@/lib/markdown-normalization";
import { CodeBlock } from "./code-block";
import { MermaidBlock } from "./mermaid-block";

const AUTOLINK_BOUNDARIES = [
  "%EF%BC%89", // ）
  "%EF%BC%8C", // ，
  "%E3%80%82", // 。
  "%EF%BC%9B", // ；
  "%EF%BC%9A", // ：
  "）",
  "，",
  "。",
  "；",
  "：",
];

function normalizeAutolinkHref(href?: string): string | undefined {
  if (!href) return href;
  const boundary = AUTOLINK_BOUNDARIES.map((mark) => href.indexOf(mark))
    .filter((i) => i > -1)
    .sort((a, b) => a - b)[0];
  const trimmed = boundary === undefined ? href : href.slice(0, boundary);
  return trimmed.replace(/[),.;!?]+$/g, "");
}

function plainText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join("");
}

/**
 * 完整 Markdown 渲染：GFM 表格/任务列表/脚注、KaTeX 公式、
 * Shiki 代码高亮、Mermaid 图表。
 * 用 memo 防止流式输出时整棵树重渲染。
 */
export const MarkdownRenderer = React.memo(function MarkdownRenderer({
  content,
  className,
  isStreaming,
}: {
  content: string;
  className?: string;
  isStreaming?: boolean;
}) {
  const normalizedContent = React.useMemo(
    () => normalizeMarkdownBlockBoundaries(content),
    [content]
  );

  return (
    <div
      className={cn(
        "prose-chat max-w-none text-[15px] leading-[1.75] [overflow-wrap:anywhere]",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={(url) => defaultUrlTransform(normalizeTrustedLinHubUrl(url))}
        components={{
          h1: (p) => <h1 className="mb-3 mt-6 text-2xl font-semibold tracking-tight first:mt-0" {...p} />,
          h2: (p) => <h2 className="mb-2.5 mt-5 text-xl font-semibold tracking-tight first:mt-0" {...p} />,
          h3: (p) => <h3 className="mb-2 mt-4 text-lg font-semibold first:mt-0" {...p} />,
          h4: (p) => <h4 className="mb-2 mt-3 text-base font-semibold first:mt-0" {...p} />,
          p: (p) => <p className="my-2.5 first:mt-0 last:mb-0" {...p} />,
          ul: (p) => <ul className="my-2.5 list-disc space-y-1 pl-6 marker:text-primary/60" {...p} />,
          ol: (p) => <ol className="my-2.5 list-decimal space-y-1 pl-6 marker:text-primary/60" {...p} />,
          li: (p) => <li className="[&>p]:my-1" {...p} />,
          blockquote: (p) => (
            <blockquote
              className="my-3 rounded-r-xl border-l-[3px] border-primary/50 bg-primary/[0.05] py-1.5 pl-4 pr-3 text-foreground/75"
              {...p}
            />
          ),
          hr: () => <hr className="my-6 h-px border-0 bg-gradient-to-r from-transparent via-border to-transparent" />,
          a: ({ href, children, ...props }) => {
            const safeHref = normalizeAutolinkHref(href);
            const childText = plainText(children);
            if (safeHref && childText.startsWith(safeHref) && childText !== safeHref) {
              return (
                <>
                  <a
                    className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
                    href={safeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {safeHref}
                  </a>
                  {childText.slice(safeHref.length)}
                </>
              );
            }
            return (
              <a
                className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </a>
            );
          },
          table: (p) => (
            <div className="my-3 overflow-x-auto rounded-xl border shadow-[var(--shadow-card)]">
              <table className="w-full border-collapse text-sm" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-muted/70" {...p} />,
          th: (p) => (
            <th className="border-b px-3.5 py-2 text-left font-semibold text-foreground/90" {...p} />
          ),
          td: (p) => (
            <td className="border-b px-3.5 py-2 last:border-b-0 [tr:last-child_&]:border-b-0" {...p} />
          ),
          img: (p) => (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img className="my-3 max-h-96 rounded-xl border shadow-[var(--shadow-card)]" loading="lazy" {...p} />
          ),
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className ?? "");
            const code = String(children).replace(/\n$/, "");
            const isBlock = className?.includes("language-") || code.includes("\n");
            if (!isBlock) {
              return (
                <code
                  className="rounded-md bg-primary/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] text-primary"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            const lang = match?.[1] ?? "";
            if (lang === "mermaid") return <MermaidBlock code={code} isStreaming={isStreaming} />;
            return <CodeBlock language={lang} code={code} />;
          },
          pre: (p) => <>{p.children}</>,
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
});
