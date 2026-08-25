/**
 * 浏览器与聊天流之间的临时传输中断。
 *
 * 这不代表服务端生成失败：手机切到后台、网络切换或代理重置连接时，
 * 后台任务仍可能继续运行。调用方应保留当前快照并重新订阅。
 */
export class ChatStreamTransportError extends Error {
  constructor(message = "聊天流连接中断") {
    super(message);
    this.name = "ChatStreamTransportError";
  }
}

export function isChatStreamTransportError(
  error: unknown
): error is ChatStreamTransportError {
  return error instanceof ChatStreamTransportError;
}
