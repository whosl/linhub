import { useSyncExternalStore } from "react";

/** 订阅 <html> 上的 dark class 变化(theme 切换 / 系统偏好切换都会落到 class) */
function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

/** 当前是否暗色模式(跟随 applyTheme 写到 <html> 的 class) */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
