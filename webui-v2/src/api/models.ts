import { request } from "./http";
import type { Model } from "./types";

export interface ModelsResponse {
  models: Model[];
  defaultModelId?: string;
}

/** 模型目录(聊天页模型选择器用) */
export async function getModels(): Promise<ModelsResponse> {
  return request<ModelsResponse>("/api/models");
}
