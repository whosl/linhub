// 文件中心 API:媒体资产列表(游标分页)、详情、删除,以及带鉴权的图片 URL hook
//
// 注意:<img> 标签无法携带 Authorization 头,而 GET /api/media/{id} 需要 Bearer,
// 因此图片需 fetch 成 blob 再 URL.createObjectURL —— 见 useMediaUrl。

import { useEffect, useState } from "react";
import { request, requestBlob } from "./http";

export interface MediaAsset {
  id: string;
  kind: "upload" | "generated" | "edited";
  name: string;
  mimeType: string;
  /** 字节数 */
  size: number;
  /** 可公开访问的直链(存在时优先于 blob 方案) */
  url?: string;
  /** 来源会话 id(metadata 接口可能才返回) */
  conversationId?: string;
  /** 文档提取文本(仅 metadata 接口返回) */
  extractedText?: string;
  createdAt: string;
}

export type MediaKindFilter = "all" | "upload" | "generated" | "edited";

export interface MediaListResponse {
  items: MediaAsset[];
  nextCursor?: string | null;
}

export interface ListMediaParams {
  kind?: MediaKindFilter;
  q?: string;
  cursor?: string;
  limit?: number;
}

/** 媒体资产列表(游标分页) */
export async function listMedia(params: ListMediaParams = {}): Promise<MediaListResponse> {
  const search = new URLSearchParams();
  if (params.kind && params.kind !== "all") search.set("kind", params.kind);
  if (params.q) search.set("q", params.q);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return request<MediaListResponse>(`/api/media${qs ? `?${qs}` : ""}`);
}

/** 单个资产详情(含 extractedText / conversationId) */
export async function getMediaMetadata(id: string): Promise<MediaAsset> {
  return request<MediaAsset>(`/api/media/${id}/metadata`);
}

export async function deleteMedia(id: string): Promise<void> {
  await request(`/api/media/${id}`, { method: "DELETE" });
}

/**
 * 获取可用于 <img src> 的 URL:
 * - asset 自带公开 url 时直接返回;
 * - 否则带 Bearer fetch 成 blob,生成 object URL(组件卸载时自动 revoke)。
 */
export function useMediaUrl(id: string | null, directUrl?: string): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id || directUrl) return;
    let cancelled = false;
    let created: string | null = null;
    requestBlob(`/api/media/${id}`, { method: "GET" })
      .then((blob) => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        // 加载失败保持 null,由调用方渲染占位
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id, directUrl]);

  return directUrl ?? objectUrl;
}
