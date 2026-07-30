/**
 * 生成可在非安全 HTTP 上下文使用的 UUID。
 *
 * `crypto.randomUUID()` 只在 secure context 中可用，但局域网/Tailscale dev
 * 常通过 HTTP 访问。优先使用原生 UUID，其次使用 `getRandomValues`，最后才
 * 降级到时间戳与 `Math.random`，避免客户端操作直接崩溃。
 */
export function clientRandomUUID(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    let seed = Date.now();
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256) ^ (seed & 0xff);
      seed = Math.floor(seed / 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
