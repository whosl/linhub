import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  listProjectConversations,
  projectConversationsKey,
} from "@/api/projects";
import { Button } from "@/components/ui/Button";
import { PageLoading } from "@/components/ui/Spinner";
import { formatRelativeTime } from "./utils";

/** 项目详情 - 对话 Tab:该项目下的会话列表 + 新对话入口 */
export function ProjectConversationsTab({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { data: conversations, isLoading } = useQuery({
    queryKey: projectConversationsKey(projectId),
    queryFn: () => listProjectConversations(projectId),
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => navigate(`/?project=${projectId}`)}>
          新对话
        </Button>
      </div>

      {isLoading ? (
        <PageLoading />
      ) : !conversations || conversations.length === 0 ? (
        <p className="py-12 text-center text-sm text-text-2">
          该项目下还没有对话,点击右上角「新对话」开始
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => navigate(`/chat/${c.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-text">
                  {c.pinned && (
                    <span className="mr-1.5 text-primary" aria-label="已置顶">
                      📌
                    </span>
                  )}
                  {c.title || "未命名对话"}
                </span>
                <span className="shrink-0 text-xs text-text-3">
                  {formatRelativeTime(c.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
