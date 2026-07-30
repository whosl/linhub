import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import {
  normalizeMarkdownBlockBoundaries,
  normalizeTrustedLinHubUrl,
} from "../src/lib/markdown-normalization.ts";

assert.equal(
  normalizeTrustedLinHubUrl("sandbox:/api/attachments/att-cd69d34220c5400d"),
  "/api/attachments/att-cd69d34220c5400d"
);
assert.equal(
  normalizeTrustedLinHubUrl("sandbox:/api/attachments/../../account"),
  "sandbox:/api/attachments/../../account"
);

assert.equal(
  normalizeMarkdownBlockBoundaries("第一行\n第二行。\n---\n下一段"),
  "第一行\n第二行。\n\n---\n下一段"
);

assert.equal(
  normalizeMarkdownBlockBoundaries("上一段\n\n---\n下一段"),
  "上一段\n\n---\n下一段"
);

assert.equal(
  normalizeMarkdownBlockBoundaries("```text\n正文\n---\n下一行\n```\n结束"),
  "```text\n正文\n---\n下一行\n```\n结束"
);

assert.equal(
  normalizeMarkdownBlockBoundaries("| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |"),
  "| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |"
);

assert.equal(
  normalizeMarkdownBlockBoundaries("一级标题\n===\n正文"),
  "一级标题\n===\n正文"
);

assert.equal(
  normalizeMarkdownBlockBoundaries("---\ntitle: 文档\ntags: [a, b]\n---\n正文"),
  "---\ntitle: 文档\ntags: [a, b]\n---\n正文"
);

const accidentalHeading = normalizeMarkdownBlockBoundaries(
  "Cloudflare 只负责 DNS 查询。\n真正请求由 EdgeOne 处理。\n---\n下一节"
);
const rendered = renderToStaticMarkup(
  React.createElement(ReactMarkdown, null, accidentalHeading)
);
assert.match(rendered, /<hr\/>/);
assert.doesNotMatch(rendered, /<h2>/);

const accidentalQuote = normalizeMarkdownBlockBoundaries(
  "> **「余烬酒馆」**\n> *余烬尚温，酒可暖人*\n店里并不算热闹。"
);
const quoteRendered = renderToStaticMarkup(
  React.createElement(ReactMarkdown, null, accidentalQuote)
);
assert.match(quoteRendered, /<\/blockquote>\n<p>店里并不算热闹。<\/p>/);
const quoteBlock = quoteRendered.match(/<blockquote>[\s\S]*?<\/blockquote>/)?.[0];
assert.ok(quoteBlock);
assert.doesNotMatch(quoteBlock, /店里并不算热闹。/);

console.log("Markdown 分隔线规范化验证通过");
