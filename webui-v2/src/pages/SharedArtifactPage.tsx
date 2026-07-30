// Artifact 公开分享页:/share/artifact/:token(无需登录)
// 居中卡片:标题 + 只读渲染器(currentVersion 内容)+ 页脚「由 LinHub 生成」

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getSharedArtifact } from "@/api/artifacts";
import { PageLoading } from "@/components/ui/Spinner";
import {
  ArtifactPreview,
  artifactKindLabel,
} from "@/components/chat/artifact-renderers";

export default function SharedArtifactPage() {
  const { token } = useParams<{ token: string }>();

  const { data: artifact, isLoading, isError } = useQuery({
    queryKey: ["shared-artifact", token],
    queryFn: () => getSharedArtifact(token!),
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <PageLoading text="加载分享内容…" />
      </div>
    );
  }

  if (isError || !artifact) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-bg px-4">
        <p className="text-base font-medium text-text">分享不存在或已失效</p>
        <p className="text-sm text-text-3">请向分享者确认链接是否正确。</p>
      </div>
    );
  }

  const current =
    artifact.versions.find((v) => v.version === artifact.currentVersion) ??
    artifact.versions[artifact.versions.length - 1];

  return (
    <div className="flex min-h-dvh flex-col items-center bg-bg px-4 py-8">
      <div className="flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {/* 头部 */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <span className="min-w-0 truncate text-sm font-medium text-text">
            {artifact.title}
          </span>
          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-3">
            {artifactKindLabel(artifact.kind)}
          </span>
        </div>
        {/* 只读内容 */}
        <div className="min-h-0 flex-1">
          {current ? (
            <ArtifactPreview artifact={artifact} content={current.content} />
          ) : (
            <p className="p-4 text-sm text-text-3">内容不可用</p>
          )}
        </div>
        {/* 页脚 */}
        <div className="shrink-0 border-t border-border px-4 py-2.5 text-center text-xs text-text-3">
          由 LinHub 生成
        </div>
      </div>
    </div>
  );
}
