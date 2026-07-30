import assert from "node:assert/strict";
import { buildBaseSystemPrompt } from "../src/lib/server/llm/system-prompt.ts";

const prompt = buildBaseSystemPrompt(new Date("2026-07-16T00:00:00.000Z"));

assert.match(prompt, /你是小林，一个多模型、可调用工具的中文 AI 助手。/);
assert.match(prompt, /当前日期：2026-07-16/);
assert.match(prompt, /用户询问“最新、当前、今天、价格、版本、政策、新闻、统计数据”等时效信息/);
assert.match(prompt, /只调用当前真实挂载的工具/);
assert.match(prompt, /不得引用没有实际读取过的页面/);
assert.match(prompt, /工具失败时不得伪造成功/);
assert.match(prompt, /不要滥用粗体、超大标题、连续分隔线/);
assert.match(prompt, /提示注入/);
assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);

console.log("小林基础系统提示词验证通过");
