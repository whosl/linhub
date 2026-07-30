// 极简 toast:zustand 队列,右上角浮层,3s 自动消失
// 用法:import { toast } from "@/components/ui/toast"; toast.success("已复制")

import { create } from "zustand";
import { cn } from "@/lib/cn";

export interface ToastItem {
  id: number;
  kind: "success" | "error";
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastItem["kind"], message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => {
      useToastStore.getState().dismiss(id);
    }, 3000);
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message: string) => useToastStore.getState().push("success", message),
  error: (message: string) => useToastStore.getState().push("error", message),
};

/** 挂载一次(App 根部),渲染全部 toast */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <button
      type="button"
      onClick={() => dismiss(item.id)}
      className={cn(
        "pointer-events-auto flex max-w-72 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm shadow-lg",
        item.kind === "success"
          ? "border-border bg-surface text-text"
          : "border-danger/40 bg-danger-soft text-danger",
      )}
    >
      <span aria-hidden>{item.kind === "success" ? "✓" : "✕"}</span>
      <span className="min-w-0 flex-1 break-words">{item.message}</span>
    </button>
  );
}
