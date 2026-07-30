import type { DataService } from "./service";
import { getMockDataService } from "./mock/mock-service";
import { getApiDataService } from "./api/api-service";

/**
 * 数据服务入口。
 * NEXT_PUBLIC_DATA_SOURCE=mock 时用纯 Mock（离线演示），
 * 否则用 ApiDataService（已接真模块走 API，其余暂委托 Mock）。
 */
export function getDataService(): DataService {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "mock") {
    return getMockDataService();
  }
  return getApiDataService();
}

export type { DataService } from "./service";
