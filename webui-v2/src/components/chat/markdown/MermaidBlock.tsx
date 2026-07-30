// Mermaid 图表块:懒加载 mermaid,失败显示源码 + 错误;暗色切换时重渲染

import { useEffect, useState } from "react";
import { useIsDark } from "@/hooks/use-is-dark";

let mermaidPromise: Promise<typeof import("mermaid")> | null = null;

/** 懒加载 mermaid(体积大,不进首包) */
function loadMermaid(): Promise<typeof import("mermaid")> {
  mermaidPromise ??= import("mermaid");
  return mermaidPromise;
}

let renderSeq = 0;

export function MermaidBlock({ code }: { code: string }) {
  const dark = useIsDark();
  /** 渲染结果与输入(代码+主题)绑定,输入变化时旧结果自然失效,无需在 effect 里同步重置 */
  const key = `${dark ? "dark" : "light"}:${code}`;
  const [done, setDone] = useState<{
    key: string;
    svg?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mmd-${Date.now()}-${renderSeq++}`;
    loadMermaid()
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "default",
          securityLevel: "loose",
        });
        return mermaid.render(id, code);
      })
      .then(({ svg: out }) => {
        if (!cancelled) setDone({ key, svg: out });
      })
      .catch((err: unknown) => {
        // mermaid 渲染失败时会把错误图挂到 DOM 上,清掉
        document.getElementById(`d${id}`)?.remove();
        document.getElementById(id)?.remove();
        if (!cancelled) {
          setDone({
            key,
            error: err instanceof Error ? err.message : "图表渲染失败",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key, code, dark]);

  const current = done && done.key === key ? done : null;
  const error = current?.error ?? null;
  const svg = current?.svg ?? null;

  if (error) {
    return (
      <div className="my-3 overflow-hidden rounded-xl border border-danger/40">
        <p className="border-b border-danger/40 bg-danger-soft px-3 py-1.5 text-xs text-danger">
          Mermaid 渲染失败:{error}
        </p>
        <pre className="m-0 overflow-x-auto bg-surface-2 p-3 font-mono text-xs whitespace-pre text-text-2">
          {code}
        </pre>
      </div>
    );
  }
  if (!svg) {
    return (
      <div className="my-3 flex h-24 items-center justify-center rounded-xl border border-border bg-surface-2 text-xs text-text-3">
        图表渲染中…
      </div>
    );
  }
  return (
    <div
      className="my-3 overflow-x-auto rounded-xl border border-border bg-surface p-3 [&_svg]:mx-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
