"use client";

import * as React from "react";
import { CodeIcon, EyeIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/lib/types";
import {
  ArtifactPreview,
  getArtifactCodeLanguage,
} from "@/components/artifacts/artifact-panel";
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
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl">
        <div className="bg-brand flex size-7 items-center justify-center rounded-lg text-sm font-bold text-white shadow-md">
          L
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium">{artifact.title}</h1>
          <p className="text-xs text-muted-foreground">由 LinHub 生成 · 只读分享</p>
        </div>
        {previewable && (
          <div className="flex items-center rounded-full bg-muted p-1">
            <button
              onClick={() => setTab("preview")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-all",
                tab === "preview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <EyeIcon className="size-3" /> 预览
            </button>
            <button
              onClick={() => setTab("code")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-all",
                tab === "code" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
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
              language={getArtifactCodeLanguage(artifact)}
              code={current.content}
              showRunButton={artifact.kind !== "html"}
            />
          </div>
        )}
      </main>
    </div>
  );
}
