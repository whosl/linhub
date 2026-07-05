"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Loader2Icon } from "lucide-react";

let mermaidIdCounter = 0;

export function MermaidBlock({ code }: { code: string }) {
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "neutral",
          fontFamily: "inherit",
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
  }, [code, resolvedTheme]);

  if (error) {
    return (
      <pre className="my-3 overflow-x-auto rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-xs text-destructive">
        Mermaid 渲染失败：{error}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="my-3 flex items-center justify-center gap-2 rounded-xl border bg-muted/40 py-10 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        图表渲染中…
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
