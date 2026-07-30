import { cn } from "@/lib/cn";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
} from "react";

interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  /** 点击触发器时是否阻止冒泡(用于会话列表项内) */
  stopPropagation?: boolean;
}

/** 自写下拉菜单:点击外部或 Esc 关闭 */
export function DropdownMenu({
  trigger,
  children,
  align = "right",
  stopPropagation = false,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onTriggerClick = (e: MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    setOpen((v) => !v);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <span onClick={onTriggerClick} className="inline-flex">
        {trigger}
      </span>
      {open && (
        <div
          className={cn(
            "absolute top-full z-40 mt-1 min-w-36 rounded-lg border border-border bg-surface p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  onClick?: () => void;
  danger?: boolean;
  children: ReactNode;
}

export function DropdownItem({ onClick, danger, children }: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
        danger ? "text-danger hover:bg-danger-soft" : "text-text hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}
