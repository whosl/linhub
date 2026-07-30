import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  deleteConversation,
  patchConversation,
  type ConversationPatch,
} from "@/api/conversations";
import type { Conversation } from "@/api/types";

export const CONVERSATIONS_KEY = ["conversations"] as const;

function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 乐观更新单条会话字段,失败回滚 */
async function optimisticPatch(
  qc: QueryClient,
  id: string,
  patch: ConversationPatch,
) {
  await qc.cancelQueries({ queryKey: CONVERSATIONS_KEY });
  const previous = qc.getQueryData<Conversation[]>(CONVERSATIONS_KEY);
  qc.setQueryData<Conversation[]>(CONVERSATIONS_KEY, (old) =>
    old
      ? sortConversations(
          old.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        )
      : old,
  );
  return { previous };
}

/** 会话操作(重命名/置顶/归档/删除),全部乐观更新 */
export function useConversationActions() {
  const qc = useQueryClient();

  const rollback = (context?: { previous?: Conversation[] }) => {
    if (context?.previous) {
      qc.setQueryData(CONVERSATIONS_KEY, context.previous);
    }
  };
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });

  const patch = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConversationPatch }) =>
      patchConversation(id, data),
    onMutate: ({ id, data }) => optimisticPatch(qc, id, data),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: CONVERSATIONS_KEY });
      const previous = qc.getQueryData<Conversation[]>(CONVERSATIONS_KEY);
      qc.setQueryData<Conversation[]>(CONVERSATIONS_KEY, (old) =>
        old ? old.filter((c) => c.id !== id) : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => rollback(context),
    onSettled: invalidate,
  });

  return { patch, remove };
}
