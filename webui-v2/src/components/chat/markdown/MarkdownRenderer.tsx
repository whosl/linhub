// Markdown 渲染器:react-markdown + GFM + KaTeX,自定义表格/链接/图片/代码块
// 以 React.memo 包裹:流式 delta 高频更新时,非末尾 text part 的 props 不变即可跳过重渲染

import { isValidElement, memo, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { CodeBlock } from "./CodeBlock";
import { MermaidBlock } from "./MermaidBlock";

/** 从 <pre> 的 code 子元素中提取语言与源码 */
function extractCode(children: ReactNode): {
  language: string;
  code: string;
} | null {
  if (!isValidElement(children)) return null;
  const el = children as ReactElement<{
    className?: string;
    children?: ReactNode;
  }>;
  const className = el.props.className ?? "";
  const match = /language-([\w-]+)/.exec(className);
  const raw = el.props.children;
  const code = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join("") : "";
  return { language: match?.[1] ?? "", code };
}

const components: Components = {
  pre: ({ children }) => {
    const extracted = extractCode(children);
    if (!extracted) return <pre>{children}</pre>;
    if (extracted.language === "mermaid") {
      return <MermaidBlock code={extracted.code.trim()} />;
    }
    return <CodeBlock language={extracted.language} code={extracted.code} />;
  },
  // 块级代码已被 pre 拦截,这里只剩行内代码
  code: ({ children }) => (
    <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-text">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary-hover"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt ?? "图片"}
      loading="lazy"
      className="my-2 max-w-full rounded-xl border border-border"
    />
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border bg-surface-2 px-3 py-2 text-left font-medium text-text">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border px-3 py-2 align-top text-text last:border-b-0">
      {children}
    </td>
  ),
  p: ({ children }) => <p className="my-2.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2.5 list-disc space-y-1 pl-6">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2.5 list-decimal space-y-1 pl-6">{children}</ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/50 pl-4 text-text-2">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2.5 text-xl font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2.5 text-lg font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-2 text-sm font-semibold first:mt-0">{children}</h4>
  ),
  hr: () => <hr className="my-4 border-border" />,
};

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: {
  content: string;
}) {
  return (
    <div className="text-[15px] leading-7 break-words text-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
