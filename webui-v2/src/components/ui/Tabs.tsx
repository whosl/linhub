import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

interface Tab {
  value: string;
  label: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  value: string;
  onChange: (value: string) => void;
}

export function Tabs({ tabs, value, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === tab.value
              ? "bg-surface text-text shadow-sm"
              : "text-text-2 hover:text-text",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
