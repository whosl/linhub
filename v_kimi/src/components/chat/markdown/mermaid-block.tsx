"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Loader2Icon } from "lucide-react";

let mermaidIdCounter = 0;

export function MermaidBlock({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // 流式期间 code 每个字都在变，此时跑 mermaid.render 会被反复取消重建，
    // 既慢又卡。等流式结束、code 稳定后再渲染。
    if (isStreaming) return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "neutral",
          fontFamily: "inherit",
          // I15: 显式指定最高安全级别，禁止 mermaid 图中的 click 回调与 HTML 标签，
          // 防止 AI 生成的恶意图表经 dangerouslySetInnerHTML 触发 XSS
          securityLevel: "strict",
        });
        const id = `mermaid-${++mermaidIdCounter}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "渲染失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, resolvedTheme, isStreaming]);

  if (error) {
    return (
      <pre className="my-3 overflow-x-auto rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-xs text-destructive">
        Mermaid 渲染失败：{error}
      </pre>
    );
  }

  // 流式期间不渲染图表，只显示占位（code 还在变，render 了也会被反复取消）
  if (isStreaming || !svg) {
    return (
      <div className="my-3 flex items-center justify-center gap-2 rounded-xl border bg-muted/40 py-10 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        {isStreaming ? "等待生成完成…" : "图表渲染中…"}
      </div>
    );
  }

  return (
    <div
      className="my-3 flex justify-center overflow-x-auto rounded-xl border bg-card p-4 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
