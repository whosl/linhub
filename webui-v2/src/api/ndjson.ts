// NDJSON(每行一个 JSON)流解析 —— 聊天流式协议的基础
// createNdjsonParser 是纯函数式解析器(不依赖 fetch/DOM),便于在 node 侧单测

export interface NdjsonParser {
  /** 喂入一块字节;可能触发 0~N 次 onEvent */
  push(chunk: Uint8Array): void;
  /** 流结束:冲刷 decoder 与残行 */
  end(): void;
}

/**
 * 增量 NDJSON 解析器:
 * - 用 TextDecoder(stream:true) 处理多字节字符跨 chunk
 * - 按 \n 切行,跨 chunk 残行留在 buffer 里等下一块拼合
 * - 空行忽略,其余逐行 JSON.parse
 */
export function createNdjsonParser<T>(onEvent: (event: T) => void): NdjsonParser {
  const decoder = new TextDecoder();
  let buffer = "";

  const emitLine = (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    onEvent(JSON.parse(line) as T);
  };

  return {
    push(chunk) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        emitLine(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
      }
    },
    end() {
      buffer += decoder.decode();
      emitLine(buffer);
      buffer = "";
    },
  };
}

/**
 * 把 fetch Response(NDJSON body)变成 StreamEvent 异步生成器。
 * 非 2xx 时先读 JSON { error | message } 抛错。
 */
export async function* streamNdjson<T = unknown>(
  response: Response,
): AsyncGenerator<T> {
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

  // 缓冲队列:解析器同步回调事件,生成器逐个吐出
  const queue: T[] = [];
  const parser = createNdjsonParser<T>((event) => {
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
