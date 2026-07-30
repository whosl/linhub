// 知识库:GET/POST /api/knowledge、文档上传(multipart)、轮询解析状态

import {
  ApiError,
  UNAUTHORIZED_EVENT,
  getToken,
  request,
  requestForm,
  setToken,
} from "./http";

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  totalChunks: number;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeDocumentStatus = "processing" | "ready" | "error";

export interface KnowledgeDocument {
  id: string;
  knowledgeBaseId: string;
  name: string;
  mimeType: string;
  size: number;
  status: KnowledgeDocumentStatus;
  chunkCount: number;
  extractMethod?: string;
  errorMessage?: string;
  createdAt: string;
}

/** React Query key 统一出口,便于跨组件 invalidate */
export const knowledgeKeys = {
  bases: ["knowledge", "bases"] as const,
  documents: (kbId: string) => ["knowledge", "documents", kbId] as const,
};

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const data = await request<KnowledgeBase[] | { knowledgeBases: KnowledgeBase[] }>(
    "/api/knowledge",
  );
  // 兼容数组或包裹结构
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.knowledgeBases)) return data.knowledgeBases;
  return [];
}

export async function createKnowledgeBase(input: {
  name: string;
  description?: string;
}): Promise<KnowledgeBase> {
  return request<KnowledgeBase>("/api/knowledge", {
    method: "POST",
    body: input,
  });
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  await request(`/api/knowledge/${id}`, { method: "DELETE" });
}

export async function listDocuments(kbId: string): Promise<KnowledgeDocument[]> {
  const data = await request<
    KnowledgeDocument[] | { documents: KnowledgeDocument[] }
  >(`/api/knowledge/${kbId}/documents`);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.documents)) return data.documents;
  return [];
}

/**
 * 上传文档(multipart,字段名 file)。
 * 注意:后端可能返回 HTTP 200 但 body 带 error 字段,这种情况同样视为失败。
 */
export async function uploadDocument(
  kbId: string,
  file: File,
): Promise<KnowledgeDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const data = await requestForm<KnowledgeDocument & { error?: string }>(
    `/api/knowledge/${kbId}/documents`,
    { method: "POST", formData, timeoutMs: 120_000 },
  );
  if (data && typeof data.error === "string" && data.error) {
    throw new ApiError(200, data.error);
  }
  return data;
}

/**
 * 带真实百分比进度的上传(fetch 拿不到 upload progress,用 XHR)。
 * onProgress 回调 0-100;同样处理 HTTP 200 但 body 带 error 的情况与 401。
 */
export function uploadDocumentWithProgress(
  kbId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<KnowledgeDocument> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/knowledge/${kbId}/documents`);
    xhr.timeout = 120_000;
    xhr.withCredentials = true;
    const token = getToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      let data: (KnowledgeDocument & { error?: string; message?: string }) | null =
        null;
      try {
        data = xhr.responseText
          ? (JSON.parse(xhr.responseText) as KnowledgeDocument & {
              error?: string;
              message?: string;
            })
          : null;
      } catch {
        // 响应体非 JSON
      }
      const bodyError =
        data && typeof data.error === "string" && data.error ? data.error : null;
      if (xhr.status >= 200 && xhr.status < 300 && !bodyError) {
        onProgress(100);
        resolve(data as KnowledgeDocument);
        return;
      }
      if (xhr.status === 401) {
        setToken(null);
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
      reject(
        new ApiError(
          xhr.status,
          bodyError ??
            (typeof data?.message === "string" && data.message
              ? data.message
              : `「${file.name}」上传失败(${xhr.status})`),
        ),
      );
    };
    xhr.onerror = () => reject(new ApiError(0, "网络错误,请检查连接后重试"));
    xhr.ontimeout = () => reject(new ApiError(0, "上传超时,请稍后重试"));
    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

export async function deleteDocument(
  kbId: string,
  docId: string,
): Promise<void> {
  await request(`/api/knowledge/${kbId}/documents/${docId}`, {
    method: "DELETE",
  });
}
