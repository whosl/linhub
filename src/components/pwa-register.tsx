"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/** 注册 service worker + 断网提示 */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onOffline = () => toast.warning("网络已断开，部分功能不可用");
    const onOnline = () => toast.success("网络已恢复");
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return null;
}
