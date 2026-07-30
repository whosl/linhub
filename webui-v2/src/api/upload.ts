// 附件上传:POST /api/upload(multipart)

import { requestForm } from "./http";

export interface UploadedAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  mediaAssetId?: string;
  hasText?: boolean;
}

/** 上传单文件;大文件放宽超时到 120s */
export async function uploadFile(
  file: File,
  projectId?: string,
): Promise<UploadedAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  if (projectId) {
    formData.append("projectId", projectId);
  }
  return requestForm<UploadedAttachment>("/api/upload", {
    method: "POST",
    formData,
    timeoutMs: 120_000,
  });
}
