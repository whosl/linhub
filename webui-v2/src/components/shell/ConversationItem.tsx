import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Conversation } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { DropdownItem, DropdownMenu } from "@/components/ui/DropdownMenu";
import { useConversationActions } from "@/hooks/use-conversation-actions";
import { cn } from "@/lib/cn";

interface Props {
  conversation: Conversation;
  active: boolean;
  onNavigate?: () => void;
}

/** 单个会话项:hover 出操作菜单,支持内联重命名 */
export function ConversationItem({ conversation, active, onNavigate }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { patch, remove } = useConversationActions();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const convId = conversation.id;

  const submitRename = () => {
    const title = draft.trim();
    setRenaming(false);
    if (title && title !== conversation.title) {
      patch.mutate({ id: convId, data: { title } });
    } else {
      setDraft(conversation.title);
    }
  };

  const handleDelete = () => {
    setConfirmDelete(false);
    remove.mutate(convId);
    // 删除的是当前会话时回到首页
    if (id === convId) navigate("/");
  };

  if (renaming) {
    return (
      <div className="px-1 py-0.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename();
            if (e.key === "Escape") {
              setDraft(conversation.title);
              setRenaming(false);
            }
          }}
          className="h-8 w-full rounded-md border border-primary bg-surface px-2 text-sm text-text focus-visible:outline-none"
        />
      </div>
    );
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          navigate(`/chat/${convId}`);
          onNavigate?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate(`/chat/${convId}`);
        }}
        className={cn(
          "group relative flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1.5",
          active ? "bg-surface-2 font-medium" : "hover:bg-surface-2/60",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-sm text-text">
          {conversation.title || "未命名会话"}
        </span>
        <DropdownMenu
          stopPropagation
          trigger={
            <span
              aria-label="会话操作"
              className={cn(
                "flex size-6 items-center justify-center rounded text-text-2 hover:bg-surface-2 hover:text-text",
                "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                active && "opacity-100",
              )}
            >
              ···
            </span>
          }
        >
          <DropdownItem
            onClick={() => {
              setDraft(conversation.title);
              setRenaming(true);
            }}
          >
            重命名
          </DropdownItem>
          <DropdownItem
            onClick={() =>
              patch.mutate({
                id: convId,
                data: { pinned: !conversation.pinned },
              })
            }
          >
            {conversation.pinned ? "取消置顶" : "置顶"}
          </DropdownItem>
          <DropdownItem
            onClick={() =>
              patch.mutate({
                id: convId,
                data: { archived: !conversation.archived },
              })
            }
          >
            {conversation.archived ? "取消归档" : "归档"}
          </DropdownItem>
          <DropdownItem danger onClick={() => setConfirmDelete(true)}>
            删除
          </DropdownItem>
        </DropdownMenu>
      </div>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="删除会话"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              删除
            </Button>
          </>
        }
      >
        确定要删除「{conversation.title || "未命名会话"}」吗?此操作无法撤销。
      </Dialog>
    </>
  );
}
