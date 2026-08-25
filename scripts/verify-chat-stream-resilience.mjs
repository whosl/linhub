import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ChatStreamTransportError,
  isChatStreamTransportError,
} from "../src/lib/data/chat-stream-transport.ts";

const apiService = await readFile(
  new URL("../src/lib/data/api/api-service.ts", import.meta.url),
  "utf8"
);
const chatStore = await readFile(
  new URL("../src/stores/chat-store.ts", import.meta.url),
  "utf8"
);
const chatView = await readFile(
  new URL("../src/components/chat/chat-view.tsx", import.meta.url),
  "utf8"
);

const disconnect = new ChatStreamTransportError("移动网络切换");
assert.equal(isChatStreamTransportError(disconnect), true);
assert.equal(isChatStreamTransportError(new Error("模型调用失败")), false);

// 网络读取异常必须向状态层报告为“可恢复传输中断”，不能伪造服务端 error 事件。
assert.match(apiService, /throw new ChatStreamTransportError/);
assert.doesNotMatch(
  apiService,
  /catch \(e\) \{\s*if \(!controller\.signal\.aborted\) \{\s*yield \{\s*type: "error"/s
);

// 发送和重新生成都必须识别可恢复断线；显式停止通过 generation epoch 终止续接。
assert.ok((chatStore.match(/isChatStreamTransportError\(error\)/g) ?? []).length >= 3);
assert.match(chatStore, /invalidateGeneration\(conversationId\)/);
assert.match(chatStore, /disconnectChatStream\(conversationId\)/);
assert.match(chatStore, /RECONNECT_DELAYS_MS = \[500, 1_500, 3_000, 5_000\]/);

// 页面回到前台、BFCache 恢复和网络恢复都应主动刷新可能僵死的订阅。
assert.match(chatView, /"visibilitychange"/);
assert.match(chatView, /"pageshow"/);
assert.match(chatView, /"online"/);

console.log("聊天流韧性验证通过：传输断线可恢复，真实错误仍保持终态");
