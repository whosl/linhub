// 工具调用卡片:图标 + 中文名 + 状态,可展开查看结果(来源/图片/引用/文本/Artifact)

import { useState } from "react";
import type { ToolCallPart } from "@/api/types";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { toolDisplayName, toolIcon } from "@/lib/tool-names";
import { useArtifactPanelStore } from "@/stores/artifact-panel-store";
import { Lightbox } from "./Lightbox";

const TEXT_PREVIEW_LEN = 500;

export function ToolCallCard({ part }: { part: ToolCallPart }) {
  const [open, setOpen] = useState(false);
  const result = part.result;
  const hasDetail =
    part.state === "running"
      ? Boolean(part.inputPreview)
      : Boolean(
          result &&
            (result.sources?.length ||
              result.images?.length ||
              result.chunks?.length ||
              result.text ||
              result.artifactId),
        ) || Boolean(part.errorMessage);

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        disabled={!hasDetail}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
          hasDetail ? "cursor-pointer hover:bg-surface-2/60" : "cursor-default",
        )}
      >
        <span aria-hidden>{toolIcon(part.toolName)}</span>
        <span className="font-medium text-text">
          {toolDisplayName(part.toolName)}
        </span>
        <StateBadge state={part.state} />
        {hasDetail && (
          <span
            className={cn(
              "ml-auto text-xs text-text-3 transition-transform",
              open && "rotate-90",
            )}
            aria-hidden
          >
            ▸
          </span>
        )}
      </button>

      {open && hasDetail && (
        <div className="border-t border-border px-3 py-2.5 text-sm">
          {part.state === "running" && part.inputPreview && (
            <pre className="overflow-x-auto rounded-lg bg-surface-2 p-2.5 font-mono text-xs whitespace-pre-wrap break-all text-text-2">
              {part.inputPreview}
            </pre>
          )}
          {part.errorMessage && (
            <p className="text-xs text-danger">调用失败:{part.errorMessage}</p>
          )}
          {result && <ResultDetail part={part} />}
        </div>
      )}
    </div>
  );
}

function StateBadge({ state }: { state: ToolCallPart["state"] }) {
  if (state === "running") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-text-3">
        <Spinner className="size-3" /> 运行中
      </span>
    );
  }
  if (state === "success") {
    return <span className="text-xs text-success">✓ 完成</span>;
  }
  return <span className="text-xs text-danger">✕ 失败</span>;
}

function ResultDetail({ part }: { part: ToolCallPart }) {
  const result = part.result!;
  return (
    <div className="flex flex-col gap-3">
      {result.artifactId && (
        <p className="flex items-center gap-2 text-text-2">
          <span>
            {part.toolName === "update_artifact" ? "已更新" : "已创建"} Artifact:
            <span className="font-medium text-text">
              {result.artifactTitle ?? result.artifactId}
            </span>
          </span>
          <button
            type="button"
            onClick={() => useArtifactPanelStore.getState().open(result.artifactId!)}
            className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-primary hover:bg-surface-2"
          >
            查看
          </button>
        </p>
      )}
      {result.sources && result.sources.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-3">
            来源({result.sources.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {result.sources.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                {s.favicon ? (
                  <img
                    src={s.favicon}
                    alt=""
                    className="mt-0.5 size-4 shrink-0 rounded-sm"
                    loading="lazy"
                  />
                ) : (
                  <span className="mt-0.5 size-4 shrink-0 rounded-sm bg-surface-2" />
                )}
                <span className="min-w-0">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-primary hover:underline"
                  >
                    {s.title || s.url}
                  </a>
                  {s.snippet && (
                    <span className="line-clamp-2 block text-xs text-text-3">
                      {s.snippet}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.images && result.images.length > 0 && (
        <ImageGrid images={result.images} />
      )}
      {result.chunks && result.chunks.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-3">
            知识库引用({result.chunks.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {result.chunks.map((c, i) => (
              <li
                key={i}
                className="rounded-lg bg-surface-2 px-2.5 py-2 text-xs"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text">
                    📚 {c.documentName}
                  </span>
                  <span className="text-text-3">
                    相关度 {(c.score * 100).toFixed(0)}%
                  </span>
                </span>
                <span className="mt-1 line-clamp-3 block text-text-2">
                  {c.snippet}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.text && <TruncatedText text={result.text} />}
    </div>
  );
}

function ImageGrid({ images }: { images: string[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`生成的图片 ${i + 1}`}
            loading="lazy"
            onClick={() => setLightbox(url)}
            className="aspect-square w-full cursor-zoom-in rounded-lg border border-border object-cover"
          />
        ))}
      </div>
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

function TruncatedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > TEXT_PREVIEW_LEN;
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-2 text-xs text-text-2">
      <p className="whitespace-pre-wrap break-words">
        {expanded || !long ? text : `${text.slice(0, TEXT_PREVIEW_LEN)}…`}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-primary hover:underline"
        >
          {expanded ? "收起" : "展开全部"}
        </button>
      )}
    </div>
  );
}
