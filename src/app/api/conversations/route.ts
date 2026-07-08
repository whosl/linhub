import { NextRequest } from "next/server";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";

/**
 * I4: 转义 ILIKE 的元字符（\ % _），防止用户输入的通配符被当作模式，
 * 既避免 %_%_%... 拖慢 Postgres，也保证标题含这些字符时精确匹配。
 * 用 ESCAPE '\' 显式声明转义字符。
 */
function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function deepestLeaf(
  messages: { id: string; parentId: string | null }[],
  rootId: string
) {
  let current = rootId;
  const childrenByParent = new Map<string | null, { id: string }[]>();
  for (const message of messages) {
    const children = childrenByParent.get(message.parentId) ?? [];
    children.push(message);
    childrenByParent.set(message.parentId, children);
  }
  for (;;) {
    const children = childrenByParent.get(current) ?? [];
    if (children.length === 0) return current;
    current = children[children.length - 1].id;
  }
}

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const pattern = q ? `%${escapeIlike(q)}%` : undefined;
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(
      q && pattern
        ? and(
            eq(schema.conversations.ownerId, session.user.id),
            // I4: 转义通配符后用 ESCAPE '\' 包裹
            or(
              ilike(schema.conversations.title, pattern),
              sql`exists (
                select 1
                from ${schema.messages} m,
                  jsonb_array_elements(
                    case
                      when jsonb_typeof(m.parts) = 'array' then m.parts
                      else '[]'::jsonb
                    end
                  ) part
                where m.conversation_id = ${schema.conversations.id}
                  and part->>'type' = 'text'
                  and part->>'text' ilike ${pattern} escape '\\'
              )`
            )
          )
        : eq(schema.conversations.ownerId, session.user.id)
    )
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(200);

  const searchMatchLeafByConversation = new Map<string, string>();
  if (q && rows.length > 0) {
    const conversationIds = rows.map((c) => c.id);
    const matchingMessages = await db
      .select({
        id: schema.messages.id,
        conversationId: schema.messages.conversationId,
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .where(
        and(
          inArray(schema.messages.conversationId, conversationIds),
          sql`exists (
            select 1
            from jsonb_array_elements(
              case
                when jsonb_typeof(${schema.messages.parts}) = 'array' then ${schema.messages.parts}
                else '[]'::jsonb
              end
            ) part
            where part->>'type' = 'text'
              and part->>'text' ilike ${pattern} escape '\\'
          )`
        )
      )
      .orderBy(schema.messages.createdAt);
    const bodyMatchedConversationIds = [
      ...new Set(matchingMessages.map((message) => message.conversationId)),
    ];
    if (bodyMatchedConversationIds.length === 0) {
      return Response.json(
        rows.map((c) => ({
          id: c.id,
          title: c.title,
          projectId: c.projectId ?? undefined,
          skillId: c.skillId ?? undefined,
          modelId: c.modelId,
          styleId: c.styleId ?? undefined,
          pinned: c.pinned,
          archived: c.archived,
          currentLeafId: c.currentLeafId ?? undefined,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        }))
      );
    }
    const messages = await db
      .select({
        id: schema.messages.id,
        conversationId: schema.messages.conversationId,
        parentId: schema.messages.parentId,
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .where(inArray(schema.messages.conversationId, bodyMatchedConversationIds))
      .orderBy(schema.messages.createdAt);
    const messagesByConversation = new Map<
      string,
      { id: string; parentId: string | null }[]
    >();
    for (const message of messages) {
      const list = messagesByConversation.get(message.conversationId) ?? [];
      list.push({
        id: message.id,
        parentId: message.parentId,
      });
      messagesByConversation.set(message.conversationId, list);
    }

    for (const message of matchingMessages) {
      const list = messagesByConversation.get(message.conversationId);
      if (!list) continue;
      searchMatchLeafByConversation.set(
        message.conversationId,
        deepestLeaf(list, message.id)
      );
    }
  }

  return Response.json(
    rows.map((c) => ({
      id: c.id,
      title: c.title,
      projectId: c.projectId ?? undefined,
      skillId: c.skillId ?? undefined,
      modelId: c.modelId,
      styleId: c.styleId ?? undefined,
      pinned: c.pinned,
      archived: c.archived,
      currentLeafId: c.currentLeafId ?? undefined,
      searchMatchLeafId: searchMatchLeafByConversation.get(c.id),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))
  );
}
