import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";

export const maxDuration = 120;

/** 导出当前用户可携带的数据；明确排除密码、会话令牌、密钥、向量和存储路径。 */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const limited = rateLimit(`account-export:${session.user.id}`, 3, 60 * 60_000);
  if (limited) return limited;
  const userId = session.user.id;

  const [userRows, projects, conversations, memories, styles, skills, knowledgeBases, mcpServers,
    usage, ledger, subscriptions, orders, attachments, media] = await Promise.all([
    db.select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      emailVerified: schema.users.emailVerified,
      avatarUrl: schema.users.image,
      role: schema.users.role,
      balanceCents: schema.users.balanceCents,
      defaultModelId: schema.users.defaultModelId,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt,
    }).from(schema.users).where(eq(schema.users.id, userId)),
    db.select().from(schema.projects).where(eq(schema.projects.ownerId, userId)),
    db.select().from(schema.conversations).where(eq(schema.conversations.ownerId, userId)),
    db.select({
      id: schema.memories.id,
      content: schema.memories.content,
      sourceConversationId: schema.memories.sourceConversationId,
      projectId: schema.memories.projectId,
      createdAt: schema.memories.createdAt,
      updatedAt: schema.memories.updatedAt,
    }).from(schema.memories).where(eq(schema.memories.ownerId, userId)),
    db.select().from(schema.styles).where(eq(schema.styles.ownerId, userId)),
    db.select({
      id: schema.skills.id,
      name: schema.skills.name,
      emoji: schema.skills.emoji,
      description: schema.skills.description,
      systemPrompt: schema.skills.systemPrompt,
      kind: schema.skills.kind,
      version: schema.skills.version,
      source: schema.skills.source,
      manifest: schema.skills.manifest,
      requiredTools: schema.skills.requiredTools,
      resourceRefs: schema.skills.resourceRefs,
      scriptPolicy: schema.skills.scriptPolicy,
      reviewStatus: schema.skills.reviewStatus,
      publishedAt: schema.skills.publishedAt,
      greeting: schema.skills.greeting,
      defaultModelId: schema.skills.defaultModelId,
      enabledTools: schema.skills.enabledTools,
      knowledgeBaseIds: schema.skills.knowledgeBaseIds,
      visibility: schema.skills.visibility,
      usageCount: schema.skills.usageCount,
      createdAt: schema.skills.createdAt,
      updatedAt: schema.skills.updatedAt,
    }).from(schema.skills).where(eq(schema.skills.ownerId, userId)),
    db.select().from(schema.knowledgeBases).where(eq(schema.knowledgeBases.ownerId, userId)),
    db.select({
      id: schema.mcpServers.id,
      scope: schema.mcpServers.scope,
      name: schema.mcpServers.name,
      url: schema.mcpServers.url,
      transport: schema.mcpServers.transport,
      enabled: schema.mcpServers.enabled,
      status: schema.mcpServers.status,
      tools: schema.mcpServers.tools,
      createdAt: schema.mcpServers.createdAt,
    }).from(schema.mcpServers).where(eq(schema.mcpServers.ownerId, userId)),
    db.select().from(schema.usageRecords).where(eq(schema.usageRecords.userId, userId)),
    db.select().from(schema.ledger).where(eq(schema.ledger.userId, userId)),
    db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, userId)),
    db.select().from(schema.orders).where(eq(schema.orders.userId, userId)),
    db.select({
      id: schema.attachments.id,
      projectId: schema.attachments.projectId,
      name: schema.attachments.name,
      mimeType: schema.attachments.mimeType,
      size: schema.attachments.size,
      extractedText: schema.attachments.extractedText,
      createdAt: schema.attachments.createdAt,
    }).from(schema.attachments).where(eq(schema.attachments.ownerId, userId)),
    db.select({
      id: schema.mediaAssets.id,
      kind: schema.mediaAssets.kind,
      name: schema.mediaAssets.name,
      mimeType: schema.mediaAssets.mimeType,
      size: schema.mediaAssets.size,
      conversationId: schema.mediaAssets.conversationId,
      messageId: schema.mediaAssets.messageId,
      projectId: schema.mediaAssets.projectId,
      sourceTool: schema.mediaAssets.sourceTool,
      extractedText: schema.mediaAssets.extractedText,
      createdAt: schema.mediaAssets.createdAt,
    }).from(schema.mediaAssets).where(eq(schema.mediaAssets.ownerId, userId)),
  ]);

  const conversationIds = conversations.map((item) => item.id);
  const projectIds = projects.map((item) => item.id);
  const knowledgeBaseIds = knowledgeBases.map((item) => item.id);
  const [messages, artifacts, knowledgeDocuments, knowledgeChunks, projectKnowledgeBases] =
    await Promise.all([
      conversationIds.length
        ? db.select().from(schema.messages).where(inArray(schema.messages.conversationId, conversationIds))
        : Promise.resolve([]),
      conversationIds.length
        ? db.select({
            id: schema.artifacts.id,
            conversationId: schema.artifacts.conversationId,
            title: schema.artifacts.title,
            kind: schema.artifacts.kind,
            language: schema.artifacts.language,
            versions: schema.artifacts.versions,
            currentVersion: schema.artifacts.currentVersion,
            createdAt: schema.artifacts.createdAt,
            updatedAt: schema.artifacts.updatedAt,
          }).from(schema.artifacts).where(inArray(schema.artifacts.conversationId, conversationIds))
        : Promise.resolve([]),
      knowledgeBaseIds.length
        ? db.select({
            id: schema.kbDocuments.id,
            knowledgeBaseId: schema.kbDocuments.knowledgeBaseId,
            name: schema.kbDocuments.name,
            mimeType: schema.kbDocuments.mimeType,
            size: schema.kbDocuments.size,
            status: schema.kbDocuments.status,
            chunkCount: schema.kbDocuments.chunkCount,
            extractMethod: schema.kbDocuments.extractMethod,
            errorMessage: schema.kbDocuments.errorMessage,
            createdAt: schema.kbDocuments.createdAt,
          }).from(schema.kbDocuments).where(inArray(schema.kbDocuments.knowledgeBaseId, knowledgeBaseIds))
        : Promise.resolve([]),
      knowledgeBaseIds.length
        ? db.select({
            id: schema.kbChunks.id,
            documentId: schema.kbChunks.documentId,
            knowledgeBaseId: schema.kbChunks.knowledgeBaseId,
            chunkIndex: schema.kbChunks.chunkIndex,
            content: schema.kbChunks.content,
            createdAt: schema.kbChunks.createdAt,
          }).from(schema.kbChunks).where(inArray(schema.kbChunks.knowledgeBaseId, knowledgeBaseIds))
        : Promise.resolve([]),
      projectIds.length
        ? db.select().from(schema.projectKnowledgeBases)
            .where(inArray(schema.projectKnowledgeBases.projectId, projectIds))
        : Promise.resolve([]),
    ]);

  const payload = JSON.stringify({
    format: "linhub-account-export-v1",
    exportedAt: new Date().toISOString(),
    user: userRows[0] ?? null,
    projects,
    conversations,
    messages,
    artifacts,
    memories,
    styles,
    skills,
    knowledgeBases,
    knowledgeDocuments,
    knowledgeChunks,
    projectKnowledgeBases,
    mcpServers,
    usage,
    ledger,
    subscriptions,
    orders,
    attachments,
    media,
  }, null, 2);
  return new Response(payload, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="linhub-account-export.json"',
      "Cache-Control": "no-store",
    },
  });
}
