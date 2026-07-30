import { QueryClient } from "@tanstack/react-query";

/** 全局 QueryClient 单例 —— 独立成模块,便于非组件代码(chat-store)做 invalidate */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
