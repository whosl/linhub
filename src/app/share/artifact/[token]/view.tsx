"use client";

import * as React from "react";
import { CodeIcon, EyeIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/lib/types";
import { ArtifactPreview } from "@/components/artifacts/artifact-panel";
import { CodeBlock } from "@/components/chat/markdown/code-block";

/** 只读分享页 */
export function SharedArtifactView({ artifact }: { artifact: Artifact }) {
  const [tab, setTab] = React.useState<"preview" | "code">("preview");
  const current =
    artifact.versions.find((v) => v.version === artifact.currentVersion) ??
    artifact.versions[artifact.versions.length - 1];
  const previewable = ["html", "react", "svg", "markdown", "mermaid"].includes(
    artifact.kind
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          L
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium">{artifact.title}</h1>
          <p className="text-xs text-muted-foreground">由 LinHub 生成 · 只读分享</p>
        </div>
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
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        {tab === "preview" && previewable ? (
          <ArtifactPreview artifact={artifact} content={current.content} />
        ) : (
          <div className="p-4 [&>div]:my-0">
            <CodeBlock
              language={artifact.language ?? "text"}
              code={current.content}
            />
          </div>
        )}
      </main>
    </div>
  );
}
