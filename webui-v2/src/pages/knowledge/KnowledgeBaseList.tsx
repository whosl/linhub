import type { KnowledgeBase } from "@/api/knowledge";
import { cn } from "@/lib/cn";

interface KnowledgeBaseListProps {
  bases: KnowledgeBase[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (kb: KnowledgeBase) => void;
}

/** 左侧知识库列表(约 280px):选中高亮,hover 显示删除 */
export function KnowledgeBaseList({
  bases,
  selectedId,
  onSelect,
  onDelete,
}: KnowledgeBaseListProps) {
  return (
    <ul className="flex flex-col gap-1 px-2 pb-3">
      {bases.map((kb) => {
        const selected = kb.id === selectedId;
        return (
          <li key={kb.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(kb.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(kb.id);
                }
              }}
              className={cn(
                "group flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                selected ? "bg-primary-soft" : "hover:bg-surface-2",
              )}
            >
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    selected ? "text-primary" : "text-text",
                  )}
                >
                  {kb.name}
                </p>
                {kb.description && (
                  <p className="mt-0.5 truncate text-xs text-text-2">
                    {kb.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-text-3">
                  {kb.documentCount} 个文档 · {kb.totalChunks} 个片段
                </p>
              </div>
              <button
                type="button"
                aria-label={`删除 ${kb.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(kb);
                }}
                className="mt-0.5 shrink-0 rounded-md p-1 text-text-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100"
              >
                <TrashIcon className="size-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
