// SSE(text/event-stream)手写解析 —— EventSource 不能带 Authorization 头,故用 fetch + ReadableStream
// createSseParser 是纯函数式解析器(不依赖 fetch/DOM),便于在 node 侧单测

export interface SseEvent {
  /** event: 行的值,缺省为 "message" */
  event: string;
  /** data: 行按 \n 拼接后的完整数据 */
  data: string;
}

export interface SseParser {
  /** 喂入一块字节;可能触发 0~N 次 onEvent */
  push(chunk: Uint8Array): void;
  /** 流结束:冲刷 decoder 与残块 */
  end(): void;
}

/**
 * 增量 SSE 解析器:
 * - 用 TextDecoder(stream:true) 处理多字节字符跨 chunk
 * - 按空行(\n\n,兼容 \r\n)分事件块,跨 chunk 残块留在 buffer 等下一块拼合
 * - 块内逐行解析 event: / data:(忽略注释行与其他字段),data 多行用 \n 连接
 */
export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  const decoder = new TextDecoder();
  let buffer = "";

  const emitBlock = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (!line || line.startsWith(":")) continue; // 空行 / 注释
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      // 规范:值开头的单个空格要去掉
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value || "message";
      else if (field === "data") dataLines.push(value);
    }
    // 没有 data 的块(纯注释 / ping 空块)不下发
    if (dataLines.length === 0) return;
    onEvent({ event, data: dataLines.join("\n") });
  };

  /** 取出 buffer 中所有完整块(以空行结尾),残块留在 buffer */
  const drain = () => {
    for (;;) {
      const match = /\r?\n\r?\n/.exec(buffer);
      if (!match) return;
      emitBlock(buffer.slice(0, match.index));
      buffer = buffer.slice(match.index + match[0].length);
    }
  };

  return {
    push(chunk) {
      buffer += decoder.decode(chunk, { stream: true });
      drain();
    },
    end() {
      buffer += decoder.decode();
      drain();
      // 流末尾无空行收尾的残块也尝试下发
      if (buffer.trim()) emitBlock(buffer);
      buffer = "";
    },
  };
}

/**
 * 把 fetch Response(SSE body)变成 SseEvent 异步生成器。
 * 非 2xx 时先读 JSON { error | message } 抛错。
 */
export async function* streamSse(response: Response): AsyncGenerator<SseEvent> {
  if (!response.ok) {
    let message = `请求失败(${response.status})`;
    try {
      const data = (await response.json()) as { error?: unknown; message?: unknown };
      if (typeof data?.error === "string" && data.error) message = data.error;
      else if (typeof data?.message === "string" && data.message) message = data.message;
    } catch {
      // 响应体非 JSON,保留默认信息
    }
    throw new Error(message);
  }
  if (!response.body) {
    throw new Error("响应不支持流式读取");
  }

  const queue: SseEvent[] = [];
  const parser = createSseParser((event) => {
    queue.push(event);
  });

  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) parser.push(value);
      while (queue.length > 0) yield queue.shift()!;
    }
    parser.end();
    while (queue.length > 0) yield queue.shift()!;
  } finally {
    reader.releaseLock();
  }
}
