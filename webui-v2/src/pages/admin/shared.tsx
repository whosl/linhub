// 管理后台共享工具:金额格式化、错误文案、确认框、表单/表格样式

import type {
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** 金额:整数分 → ¥xx.xx */
export function formatCents(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

/** 解析整数输入,非法时返回 fallback */
export function parseIntOr(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 表单字段:label + 控件 */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-text-3">{hint}</span>}
    </label>
  );
}

/** 开关行:label + Switch */
export function SwitchRow({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-sm text-text">{label}</span>
        {hint && <span className="text-xs text-text-3">{hint}</span>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/** 危险操作确认框 */
export function ConfirmDialog({
  title,
  description,
  confirmText = "删除",
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmText?: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "处理中…" : confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text">{description}</p>
    </Dialog>
  );
}

/** 分区卡片(系统设置等场景) */
export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-text-2">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export const tableClass = "w-full border-collapse text-sm";
export const thClass =
  "border-b border-border px-3 py-2 text-left text-xs font-medium text-text-2 whitespace-nowrap";
export const tdClass = "border-b border-border/60 px-3 py-2 text-text align-middle";

/** 表格容器(横向滚动) */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      {children}
    </div>
  );
}

/** 空态文案 */
export function EmptyState({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border border-dashed border-border py-12 text-sm text-text-2",
        className,
      )}
    >
      {text}
    </div>
  );
}

/** 原生 select,样式对齐 Input */
export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text",
        "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** 原生 textarea,样式对齐 Input */
export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text",
        "placeholder:text-text-3",
        "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
