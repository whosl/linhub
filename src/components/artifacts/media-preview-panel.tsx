"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  MessageSquareIcon,
  XIcon,
} from "lucide-react";
import { CodeBlock } from "@/components/chat/markdown/code-block";
import { MarkdownRenderer } from "@/components/chat/markdown/markdown-renderer";
import { Tooltip } from "@/components/ui/tooltip";
import {
  extOf,
  isCodeExt,
  isImageExt,
} from "@/lib/file-types";
import type { MediaAsset } from "@/lib/types";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

type MediaPreviewPanelProps = {
  asset: MediaAsset;
  onClose: () => void;
};

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "jsx",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".css": "css",
  ".sql": "sql",
  ".sh": "bash",
  ".rb": "ruby",
  ".php": "php",
  ".vue": "vue",
  ".svelte": "svelte",
  ".json": "json",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".csv": "csv",
  ".tsv": "tsv",
  ".txt": "text",
  ".log": "text",
};

function useDesktopPreviewLayout() {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 1024px)").matches
  );

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

function isPdf(asset: MediaAsset) {
  return asset.mimeType === "application/pdf" || extOf(asset.name) === ".pdf";
}

function isMarkdown(asset: MediaAsset) {
  const ext = extOf(asset.name);
  return ext === ".md" || ext === ".markdown";
}

function isHtml(asset: MediaAsset) {
  return asset.mimeType === "text/html" || extOf(asset.name) === ".html";
}

function isRawText(asset: MediaAsset) {
  const ext = extOf(asset.name);
  return (
    asset.mimeType.startsWith("text/") ||
    isCodeExt(ext) ||
    [".txt", ".md", ".json", ".xml", ".yaml", ".yml", ".log", ".csv", ".tsv"].includes(ext)
  );
}

function isOfficeLike(asset: MediaAsset) {
  return [".docx", ".pptx", ".xlsx", ".xls"].includes(extOf(asset.name));
}

function previewLanguage(asset: MediaAsset) {
  return LANGUAGE_BY_EXT[extOf(asset.name)] ?? "text";
}

async function downloadAsset(asset: MediaAsset) {
  try {
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error("下载失败");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = asset.name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "下载失败");
  }
}

function FileSummary({ asset }: { asset: MediaAsset }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h2 className="truncate text-sm font-medium">{asset.name}</h2>
      <p className="truncate text-xs text-muted-foreground">
        {asset.kind === "upload" ? "上传" : asset.kind === "edited" ? "编辑" : "生成"}
        {" · "}
        {formatBytes(asset.size)}
        {" · "}
        {formatRelativeTime(asset.createdAt)}
      </p>
    </div>
  );
}

function TextPreview({
  asset,
  text,
  loading,
  error,
}: {
  asset: MediaAsset;
  text: string;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!text.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        当前文件没有可显示的文本预览，可下载原文件查看。
      </div>
    );
  }

  if (isMarkdown(asset) || isOfficeLike(asset) || [".csv", ".tsv"].includes(extOf(asset.name))) {
    return (
      <div className="p-6">
        <MarkdownRenderer content={text} />
      </div>
    );
  }

  return (
    <div className="p-3 [&>div]:my-0">
      <CodeBlock
        language={previewLanguage(asset)}
        code={text}
        showRunButton={false}
      />
    </div>
  );
}

function HtmlPreview({
  asset,
  html,
  loading,
  error,
}: {
  asset: MediaAsset;
  html: string;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }
  if (error || !html.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {error || "当前 HTML 没有可显示的内容，可下载原文件查看。"}
      </div>
    );
  }
  return (
    <iframe
      title={asset.name}
      srcDoc={html}
      sandbox=""
      className="size-full border-0 bg-white"
    />
  );
}

export function MediaPreviewPanel({
  asset,
  onClose,
}: MediaPreviewPanelProps) {
  const isDesktop = useDesktopPreviewLayout();
  const ext = extOf(asset.name);
  const image = asset.mimeType.startsWith("image/") || isImageExt(ext);
  const pdf = isPdf(asset);
  const html = isHtml(asset);
  const textLike = isRawText(asset);
  const officeLike = isOfficeLike(asset);
  const [loadedText, setLoadedText] = React.useState<{
    assetId: string;
    text: string;
    loading: boolean;
    error: string | null;
  }>({
    assetId: "",
    text: "",
    loading: false,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    const shouldLoadMetadata =
      (textLike || officeLike) &&
      !asset.extractedText &&
      asset.extractedTextAvailable === true;
    const shouldLoadRawText =
      textLike && !asset.extractedText && !asset.extractedTextAvailable;
    if (!shouldLoadMetadata && !shouldLoadRawText) return;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadedText({
        assetId: asset.id,
        text: "",
        loading: true,
        error: null,
      });
      try {
        const res = await fetch(
          shouldLoadMetadata
            ? `/api/media/${encodeURIComponent(asset.id)}/metadata`
            : asset.url
        );
        if (!res.ok) throw new Error("无法读取文件内容");
        const nextText = shouldLoadMetadata
          ? ((await res.json()) as MediaAsset).extractedText ?? ""
          : await res.text();
        if (!cancelled) {
          setLoadedText({
            assetId: asset.id,
            text: nextText,
            loading: false,
            error: null,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setLoadedText({
            assetId: asset.id,
            text: "",
            loading: false,
            error: e instanceof Error ? e.message : "无法读取文件内容",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset, officeLike, textLike]);

  const needsFetchText =
    (textLike || officeLike) &&
    !asset.extractedText &&
    (asset.extractedTextAvailable === true || textLike);
  const loadedTextIsCurrent = loadedText.assetId === asset.id;
  const previewText = asset.extractedText ?? (loadedTextIsCurrent ? loadedText.text : "");
  const loadingText = needsFetchText && (!loadedTextIsCurrent || loadedText.loading);
  const textError = loadedTextIsCurrent ? loadedText.error : null;

  return (
    <motion.aside
      role="dialog"
      aria-modal="true"
      aria-label={`预览文件「${asset.name}」`}
      initial={isDesktop ? { opacity: 0, x: 48 } : { opacity: 0, y: 56 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={isDesktop ? { opacity: 0, x: 48 } : { opacity: 0, y: 56 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="fixed inset-x-0 bottom-0 top-20 z-50 flex min-w-0 flex-col overflow-hidden rounded-t-2xl border-t bg-card shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:w-[min(720px,54vw)] lg:rounded-none lg:border-l lg:border-t-0"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {image ? <ImageIcon className="size-4" /> : <FileTextIcon className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <FileSummary asset={asset} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {asset.conversationId && (
            <Tooltip label="打开关联对话">
              <Link
                href={`/chat/${asset.conversationId}`}
                aria-label="打开关联对话"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <MessageSquareIcon className="size-4" />
              </Link>
            </Tooltip>
          )}
          <Tooltip label="在新标签查看">
            <a
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              aria-label="在新标签查看"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ExternalLinkIcon className="size-4" />
            </a>
          </Tooltip>
          <Tooltip label="下载">
            <button
              type="button"
              aria-label="下载"
              onClick={() => void downloadAsset(asset)}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <DownloadIcon className="size-4" />
            </button>
          </Tooltip>
          <Tooltip label="关闭">
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-auto", image && "bg-black/90")}>
        {image ? (
          <div className="flex min-h-full items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.url}
              alt={asset.name}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        ) : pdf ? (
          <iframe
            title={asset.name}
            src={asset.url}
            className="size-full border-0 bg-white"
          />
        ) : html ? (
          <HtmlPreview
            asset={asset}
            html={previewText}
            loading={loadingText}
            error={textError}
          />
        ) : textLike || officeLike ? (
          <TextPreview
            asset={asset}
            text={previewText}
            loading={loadingText}
            error={textError}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            当前格式无法直接预览，可下载原文件查看。
          </div>
        )}
      </div>
    </motion.aside>
  );
}
