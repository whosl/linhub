// Artifact 面板:桌面端(lg)为聊天页右侧分栏,移动端为全屏覆盖层
// 头部:标题 / 版本切换 / 预览·代码 Tab / 分享(生成链接 + 复制)/ 关闭
// 列表入口:ChatHeader 的「N 个 Artifact」按钮打开 ArtifactListDialog 选中

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getArtifact,
  listArtifacts,
  shareArtifact,
  type Artifact,
} from "@/api/artifacts";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useArtifactPanelStore } from "@/stores/artifact-panel-store";
import {
  ArtifactPreview,
  artifactCodeLanguage,
  artifactKindLabel,
} from "./artifact-renderers";
import { CodeBlock } from "./markdown/CodeBlock";

export function ArtifactPanel({ conversationId }: { conversationId: string }) {
  const selectedId = useArtifactPanelStore((s) => s.selectedId);

  const { data: artifact, isLoading, isError } = useQuery({
    queryKey: ["artifact", selectedId],
    queryFn: () => getArtifact(selectedId!),
    enabled: !!selectedId,
  });

  return (
    <>
      {selectedId && (
        <>
          {/* 桌面端:右侧分栏(占据剩余 ~54%) */}
          <div className="hidden min-w-0 flex-1 flex-col border-l border-border bg-bg lg:flex">
            <PanelBody artifact={artifact} isLoading={isLoading} isError={isError} />
          </div>
          {/* 移动端:全屏覆盖层 */}
          <div className="fixed inset-0 z-40 flex flex-col bg-bg lg:hidden">
            <PanelBody artifact={artifact} isLoading={isLoading} isError={isError} />
          </div>
        </>
      )}
      <ArtifactListDialog conversationId={conversationId} />
    </>
  );
}

// ---------------------------------------------------------------------------
// 面板主体(桌面分栏与移动全屏共用)
// ---------------------------------------------------------------------------

function PanelBody({
  artifact,
  isLoading,
  isError,
}: {
  artifact: Artifact | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const close = useArtifactPanelStore((s) => s.close);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-2">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (isError || !artifact) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-text-2">Artifact 加载失败</p>
        <button
          type="button"
          onClick={close}
          className="rounded-lg border border-border px-4 py-1.5 text-sm text-text hover:bg-surface-2"
        >
          关闭
        </button>
      </div>
    );
  }
  // key 按 artifact.id 重置版本 / Tab 等本地状态
  return <PanelContent key={artifact.id} artifact={artifact} />;
}

function PanelContent({ artifact }: { artifact: Artifact }) {
  const close = useArtifactPanelStore((s) => s.close);
  const [version, setVersion] = useState(artifact.currentVersion);
  const [tab, setTab] = useState("preview");

  const versions = [...artifact.versions].sort((a, b) => a.version - b.version);
  const current =
    versions.find((v) => v.version === version) ??
    versions[versions.length - 1];
  const index = current ? versions.indexOf(current) : -1;

  const versionBtn =
    "rounded px-1.5 text-sm text-text-3 transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-30";

  return (
    <>
      {/* 头部 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="min-w-0 truncate text-sm font-medium text-text" title={artifact.title}>
          {artifact.title}
        </span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-3">
          {artifactKindLabel(artifact.kind)}
        </span>
        {versions.length > 1 && current && (
          <span className="flex shrink-0 items-center gap-0.5 text-xs text-text-3">
            <button
              type="button"
              className={versionBtn}
              disabled={index <= 0}
              onClick={() => setVersion(versions[index - 1]!.version)}
              aria-label="上一个版本"
            >
              ‹
            </button>
            v{current.version}/{versions.length}
            <button
              type="button"
              className={versionBtn}
              disabled={index >= versions.length - 1}
              onClick={() => setVersion(versions[index + 1]!.version)}
              aria-label="下一个版本"
            >
              ›
            </button>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <ShareButton artifact={artifact} />
          <button
            type="button"
            onClick={close}
            aria-label="关闭面板"
            className="rounded-md px-2 py-1 text-sm text-text-3 hover:bg-surface-2 hover:text-text"
          >
            ✕
          </button>
        </span>
      </div>

      {/* 预览 / 代码 Tab */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <Tabs
          tabs={[
            { value: "preview", label: "预览" },
            { value: "code", label: "代码" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1">
        {tab === "preview" ? (
          current ? (
            <ArtifactPreview artifact={artifact} content={current.content} />
          ) : (
            <p className="p-4 text-sm text-text-3">该版本内容不可用</p>
          )
        ) : (
          <div className="h-full overflow-y-auto p-3">
            <CodeBlock
              language={artifactCodeLanguage(artifact)}
              code={current?.content ?? ""}
            />
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 分享:生成 /share/artifact/{token} 链接并复制
// ---------------------------------------------------------------------------

function ShareButton({ artifact }: { artifact: Artifact }) {
  const [shareToken, setShareToken] = useState(artifact.shareToken);
  const [expanded, setExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);

  const shareUrl = shareToken
    ? `${window.location.origin}/share/artifact/${shareToken}`
    : null;

  const onShare = async () => {
    if (shareToken) {
      setExpanded((v) => !v);
      return;
    }
    setSharing(true);
    try {
      const res = await shareArtifact(artifact.id);
      setShareToken(res.shareToken);
      setExpanded(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "分享失败,请稍后重试");
    } finally {
      setSharing(false);
    }
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("分享链接已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <span className="relative flex items-center">
      <button
        type="button"
        onClick={() => void onShare()}
        disabled={sharing}
        className={cn(
          "rounded-md px-2 py-1 text-sm transition-colors hover:bg-surface-2",
          shareToken ? "text-primary" : "text-text-2",
        )}
      >
        {sharing ? "分享中…" : "分享"}
      </button>
      {expanded && shareUrl && (
        <span className="absolute right-0 top-full z-10 mt-1 flex w-72 items-center gap-1.5 rounded-lg border border-border bg-surface p-2 shadow-lg">
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-xs text-text outline-none"
          />
          <button
            type="button"
            onClick={() => void copy()}
            className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-medium text-on-primary hover:bg-primary-hover"
          >
            复制
          </button>
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 列表弹层:ChatHeader「N 个 Artifact」按钮触发,点击条目选中并打开面板
// ---------------------------------------------------------------------------

function ArtifactListDialog({ conversationId }: { conversationId: string }) {
  const listOpen = useArtifactPanelStore((s) => s.listOpen);
  const closeList = useArtifactPanelStore((s) => s.closeList);
  const open = useArtifactPanelStore((s) => s.open);

  const { data: artifacts, isLoading } = useQuery({
    queryKey: ["artifacts", conversationId],
    queryFn: () => listArtifacts(conversationId),
    enabled: listOpen,
  });

  return (
    <Dialog open={listOpen} onClose={closeList} title="会话中的 Artifact">
      {isLoading ? (
        <div className="flex justify-center py-6 text-text-2">
          <Spinner className="size-5" />
        </div>
      ) : !artifacts || artifacts.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-3">暂无 Artifact</p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {artifacts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => open(a.id)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-left hover:bg-surface-2"
              >
                <span aria-hidden>📄</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">{a.title}</span>
                  <span className="block text-xs text-text-3">
                    {artifactKindLabel(a.kind)} · v{a.currentVersion} ·{" "}
                    {new Date(a.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                  </span>
                </span>
                <span aria-hidden className="text-text-3">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
