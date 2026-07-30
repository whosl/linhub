// 图片编辑(局部重绘):POST /api/edit-image,耗时较长(超时 190s),带幂等键

import { request } from "./http";

export interface EditImageInput {
  /** 底图 dataURL */
  image: string;
  /** 遮罩 dataURL(黑白图,涂抹处为白);不传则整图按提示词重绘 */
  mask?: string;
  prompt: string;
}

export interface EditImageResult {
  url: string;
}

export async function editImage(input: EditImageInput): Promise<EditImageResult> {
  return request<EditImageResult>("/api/edit-image", {
    method: "POST",
    body: input,
    timeoutMs: 190_000,
    headers: { "Idempotency-Key": `web-${crypto.randomUUID()}` },
  });
}
