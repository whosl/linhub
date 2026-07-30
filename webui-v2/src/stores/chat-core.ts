// 聊天消息树与流事件应用的纯函数 —— 不依赖 zustand / DOM,可独立测试
// 约定:会话消息是一棵树(parentId 链接),UI 只展示从 currentLeafId 回溯到根的一条链;
// role === "skill-run-receipt" 的消息不参与链,仅在其 parent 位于链上时按 createdAt 插入展示。

import type { Message, MessagePart, StreamEvent } from "../api/types";

export interface ChatSession {
  conversationId: string;
  /** 全量消息树(不按可见链) */
  messages: Message[];
  status: "idle" | "streaming";
  streamingMessageId?: string;
  loaded: boolean;
  loadError?: string;
  streamError?: string;
  currentLeafId?: string;
}

/** applyEvent 的副作用出口(store 层注入,测试时可省略) */
export interface ApplyEventContext {
  setPendingRedirect?: (conversationId: string) => void;
}

export function isReceipt(message: Message): boolean {
  return message.role === "skill-run-receipt";
}

function byIdMap(messages: Message[]): Map<string, Message> {
  return new Map(messages.map((m) => [m.id, m]));
}

/** 非 receipt 子节点映射,每组按 createdAt 升序 */
function childrenMap(messages: Message[]): Map<string | null, Message[]> {
  const map = new Map<string | null, Message[]>();
  for (const m of messages) {
    if (isReceipt(m)) continue;
    const list = map.get(m.parentId);
    if (list) list.push(m);
    else map.set(m.parentId, [m]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return map;
}

/**
 * 最深叶子:从 startId(通常是 currentLeafId)出发,每步取最新子节点走到底;
 * 无起点(或起点不存在)时,取全部叶子中 createdAt 最新者。receipt 不算子节点。
 */
export function deepestLeaf(messages: Message[], startId?: string): string | undefined {
  if (messages.length === 0) return undefined;
  const byId = byIdMap(messages);
  const children = childrenMap(messages);

  let start = startId;
  // receipt 不能作为链上节点:上移到其父
  for (let m = start ? byId.get(start) : undefined; m && isReceipt(m); ) {
    start = m.parentId ?? undefined;
    m = start ? byId.get(start) : undefined;
  }

  if (start && byId.has(start)) {
    let cur = start;
    for (;;) {
      const kids = children.get(cur);
      if (!kids || kids.length === 0) return cur;
      cur = kids[kids.length - 1]!.id;
    }
  }

  let best: Message | undefined;
  for (const m of messages) {
    if (isReceipt(m)) continue;
    const kids = children.get(m.id);
    if (kids && kids.length > 0) continue; // 非叶子
    if (!best || m.createdAt > best.createdAt) best = m;
  }
  return best?.id;
}

/**
 * 可见消息链:从 leafId 沿 parentId 回溯到根后反转;
 * leafId 为空时用 deepestLeaf。receipt 不参与链,
 * 但 parent 在链上的 receipt 按 createdAt 插入返回。
 */
export function visibleThread(messages: Message[], leafId?: string): Message[] {
  if (messages.length === 0) return [];
  const byId = byIdMap(messages);
  const cur = leafId && byId.has(leafId) ? leafId : deepestLeaf(messages, leafId);
  if (!cur) return [];

  const chain: Message[] = [];
  const seen = new Set<string>();
  for (let m: Message | undefined = byId.get(cur); m && !seen.has(m.id); ) {
    seen.add(m.id);
    if (!isReceipt(m)) chain.push(m);
    m = m.parentId ? byId.get(m.parentId) : undefined;
  }
  chain.reverse();

  const chainIds = new Set(chain.map((m) => m.id));
  const receipts = messages.filter(
    (m) => isReceipt(m) && m.parentId !== null && chainIds.has(m.parentId),
  );
  if (receipts.length === 0) return chain;
  // 链本身按 createdAt 升序,直接归并排序插入
  return [...chain, ...receipts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 列出某消息的全部兄弟分支(同 parent 的非 receipt 子节点,按 createdAt 升序) */
export function siblingBranches(messages: Message[], messageId: string): Message[] {
  const byId = byIdMap(messages);
  const target = byId.get(messageId);
  if (!target) return [];
  return (childrenMap(messages).get(target.parentId) ?? []).slice();
}

// ---------------------------------------------------------------------------
// applyEvent:把流事件应用到 session draft(原地修改,调用方负责不可变包装)
// ---------------------------------------------------------------------------

function findMessage(session: ChatSession, id: string): Message | undefined {
  return session.messages.find((m) => m.id === id);
}

function upsertMessage(session: ChatSession, message: Message): Message {
  const existing = findMessage(session, message.id);
  if (existing) return existing;
  session.messages.push(message);
  return message;
}

/** parts 的文本总长(text + reasoning),用于快照防回退比较 */
function totalTextLength(parts: MessagePart[]): number {
  let n = 0;
  for (const p of parts) {
    if (p.type === "text" || p.type === "reasoning") n += p.text.length;
  }
  return n;
}

function appendTextPart(message: Message, type: "text" | "reasoning", delta: string): void {
  const last = message.parts[message.parts.length - 1];
  if (last && last.type === type) {
    last.text += delta;
  } else {
    message.parts.push({ type, text: delta });
  }
}

function upsertToolCallPart(
  message: Message,
  part: Extract<MessagePart, { type: "tool-call" }>,
): void {
  const idx = message.parts.findIndex(
    (p) => p.type === "tool-call" && p.toolCallId === part.toolCallId,
  );
  if (idx >= 0) {
    // 合并:保留已有 inputPreview 等未随事件下发的字段
    message.parts[idx] = { ...message.parts[idx], ...part } as MessagePart;
  } else {
    message.parts.push(part);
  }
}

export function applyEvent(
  session: ChatSession,
  event: StreamEvent,
  ctx?: ApplyEventContext,
): void {
  switch (event.type) {
    case "ping":
      return;

    case "conversation-created":
      ctx?.setPendingRedirect?.(event.conversation.id);
      return;

    case "user-message": {
      const msg = upsertMessage(session, event.message);
      msg.deliveryState = "accepted";
      msg.deliveryError = undefined;
      return;
    }

    case "assistant-start": {
      const existing = findMessage(session, event.message.id);
      if (existing) {
        // 已有乐观占位:只同步服务端字段,保留本地 parts
        existing.conversationId = event.message.conversationId;
        existing.modelId = event.message.modelId ?? existing.modelId;
        existing.status = event.message.status;
      } else {
        session.messages.push(event.message);
      }
      session.status = "streaming";
      session.streamingMessageId = event.message.id;
      return;
    }

    case "assistant-snapshot": {
      const existing = findMessage(session, event.message.id);
      if (!existing) {
        session.messages.push(event.message);
        return;
      }
      // 防回退:本地累积文本更长时,忽略快照 parts,只更新状态字段
      if (totalTextLength(existing.parts) > totalTextLength(event.message.parts)) {
        existing.status = event.message.status;
        existing.usage = event.message.usage ?? existing.usage;
      } else {
        const delivery = existing.deliveryState;
        Object.assign(existing, event.message);
        existing.deliveryState = delivery;
      }
      return;
    }

    case "routing-decision": {
      const msg = findMessage(session, event.messageId);
      if (!msg) return;
      const part = msg.parts.find((p) => p.type === "tool-config");
      if (part && part.type === "tool-config") {
        part.routing = event.decision;
      }
      return;
    }

    case "reasoning-delta": {
      const msg = findMessage(session, event.messageId);
      if (msg) appendTextPart(msg, "reasoning", event.delta);
      return;
    }

    case "reasoning-done": {
      const msg = findMessage(session, event.messageId);
      if (!msg) return;
      for (let i = msg.parts.length - 1; i >= 0; i--) {
        const p = msg.parts[i]!;
        if (p.type === "reasoning") {
          p.durationMs = event.durationMs;
          break;
        }
      }
      return;
    }

    case "text-delta": {
      const msg = findMessage(session, event.messageId);
      if (msg) appendTextPart(msg, "text", event.delta);
      return;
    }

    case "tool-call-start":
    case "tool-call-end": {
      const msg = findMessage(session, event.messageId);
      if (msg) upsertToolCallPart(msg, event.part);
      return;
    }

    case "tool-input-start": {
      const msg = findMessage(session, event.messageId);
      if (!msg) return;
      upsertToolCallPart(msg, {
        type: "tool-call",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        state: "running",
      });
      return;
    }

    case "tool-input-delta": {
      const msg = findMessage(session, event.messageId);
      if (!msg) return;
      const part = msg.parts.find(
        (p) => p.type === "tool-call" && p.toolCallId === event.toolCallId,
      );
      if (part && part.type === "tool-call") {
        part.inputPreview = (part.inputPreview ?? "") + event.delta;
      }
      return;
    }

    case "image": {
      const msg = findMessage(session, event.messageId);
      if (msg) msg.parts.push(event.part);
      return;
    }

    case "artifact":
      // 消息树不存 artifact part;store 层负责 invalidate ["artifacts", conversationId]
      return;

    case "title":
      // 由 store 层 invalidate conversations 列表处理
      return;

    case "done": {
      const msg = findMessage(session, event.messageId);
      if (msg) {
        msg.status = event.status;
        if (event.usage) msg.usage = event.usage;
      }
      if (session.streamingMessageId === event.messageId) {
        session.streamingMessageId = undefined;
      }
      session.status = "idle";
      return;
    }

    case "error": {
      session.streamError = event.message;
      const targetId = event.messageId ?? session.streamingMessageId;
      const msg = targetId ? findMessage(session, targetId) : undefined;
      if (msg) msg.status = "error";
      return;
    }
  }
}
