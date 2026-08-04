import { tool, type ToolSet } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { z } from "zod";
import { and, eq, or, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/crypto";
import { resolveImageSource } from "./image-source";
import { getProviderBaseURL } from "./registry";
import { formatUpstreamError } from "@/lib/server/upstream-error";
import { getImageGenConfig, getSearchConfig } from "@/lib/server/engine-config";
import { assertModelAccess } from "@/lib/server/billing";
import {
  abortAtomicSpend,
  beginAtomicSpend,
  commitAtomicSpend,
  engineResource,
  modelResource,
  withAtomicBilling,
} from "@/lib/server/billing/capabilities";
import { assertSafeUrl } from "@/lib/server/net-guard";
import type { WebSource } from "@/lib/types";
import {
  listSkillResources,
  readSkillResource,
  runSkillScript,
} from "@/lib/server/skill-runtime";
import {
  analyzePptxTemplate,
  createPptxDeck,
  extractPptxTextFromBuffer,
  localAttachmentPath,
} from "@/lib/server/pptx";
import { openMediaStream } from "@/lib/server/media";
import {
  runCodeSandbox,
  type SandboxInputFile,
  type SandboxLanguage,
} from "@/lib/server/code-sandbox";
import {
  codeSandboxInputName,
  loadOwnedCodeSandboxInput,
  persistCodeSandboxOutputs,
} from "@/lib/server/code-sandbox-files";
import {
  codeSandboxLimits,
  codeSandboxPolicySummary,
  resolveCodeSandboxPolicy,
} from "@/lib/server/code-sandbox-policy";
import {
  inspectDashiLayouts,
  queryDashiLayouts,
  renderDashiDeck,
} from "@/lib/server/dashi-ppt";

// ---------- Tavily ----------

async function tavilyRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { apiKey, baseURL } = await getSearchConfig();
  // 网络抖动时 fetch 会直接抛 "fetch failed"（TCP/DNS 层），模型只能靠运气重试。
  // 这里加 15s 超时 + 1 次自动重试，消除大部分偶发失败。
  const doFetch = () =>
    fetch(`${baseURL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  let res: Response;
  try {
    res = await doFetch();
  } catch {
    // 4xx 业务错误（如 key 失效/限流）不会进 catch（res.ok 在下方判断），
    // 只有网络层失败才重试一次
    res = await doFetch().catch((secondErr) => {
      throw new Error(
        `Tavily 网络请求失败（已重试）：${secondErr instanceof Error ? secondErr.message : String(secondErr)}`
      );
    });
  }
  if (!res.ok) throw new Error(`Tavily 请求失败（${res.status}）`);
  return res.json() as Promise<T>;
}

export function buildWebTools(userId: string): ToolSet {
  return {
    web_search: tool({
      description:
        "在互联网上搜索最新信息。适用于时效性问题、公开事实核查、公开文档/报告调研；不要用于检索用户私有知识库或用户已上传的文档/报告/附件。",
      inputSchema: z.object({
        query: z.string().describe("搜索关键词"),
        searchDepth: z
          .enum(["basic", "advanced"])
          .optional()
          .describe("advanced 用于深度调研"),
      }),
      execute: async ({ query, searchDepth }) => {
        return withAtomicBilling(
          userId,
          {
            capability: "web-search",
            resource: engineResource("web-search"),
            units: { requestCount: 1 },
          },
          async () => {
            const data = await tavilyRequest<{
              results: { title: string; url: string; content: string }[];
              answer?: string;
            }>("/search", {
              query,
              search_depth: searchDepth ?? "basic",
              max_results: 6,
              include_answer: true,
            });
            const sources: WebSource[] = data.results.map((r) => ({
              title: r.title,
              url: r.url,
              snippet: r.content.slice(0, 200),
            }));
            return { answer: data.answer, sources };
          }
        );
      },
    }),
    web_read: tool({
      description: "读取指定网页的完整内容。",
      inputSchema: z.object({
        url: z.string().describe("要读取的网页 URL"),
      }),
      execute: async ({ url }) => {
        await assertSafeUrl(url);
        return withAtomicBilling(
          userId,
          {
            capability: "web-search",
            resource: engineResource("web-search"),
            units: { requestCount: 1 },
          },
          async () => {
            const data = await tavilyRequest<{
              results: { url: string; raw_content: string }[];
            }>("/extract", { urls: [url] });
            const content = data.results[0]?.raw_content ?? "";
            return {
              sources: [{ title: url, url }] satisfies WebSource[],
              text: content.slice(0, 20_000),
            };
          }
        );
      },
    }),
    web_crawl: tool({
      description: "爬取一个网站的多个页面，适用于需要站点级信息的任务。",
      inputSchema: z.object({
        url: z.string().describe("起始 URL"),
        instructions: z.string().optional().describe("爬取目标说明"),
      }),
      execute: async ({ url, instructions }) => {
        await assertSafeUrl(url);
        return withAtomicBilling(
          userId,
          {
            capability: "web-search",
            resource: engineResource("web-search"),
            units: { requestCount: 1 },
          },
          async () => {
            const data = await tavilyRequest<{
              results: { url: string; raw_content: string }[];
            }>("/crawl", { url, instructions, limit: 5 });
            return {
              sources: data.results.map((r) => ({
                title: r.url,
                url: r.url,
                snippet: r.raw_content.slice(0, 150),
              })) satisfies WebSource[],
              text: data.results
                .map((r) => `## ${r.url}\n${r.raw_content.slice(0, 4000)}`)
                .join("\n\n"),
            };
          }
        );
      },
    }),
  };
}

// ---------- 代码运行 ----------

const CODE_MAX_LENGTH = 8_000;
const CODE_OUTPUT_MAX_LENGTH = 4_000;
const SANDBOX_CONSOLE_PREVIEW_MAX_LENGTH = 12_000;
const CODE_VALUE_PREVIEW_ITEMS = 50;
const CODE_LOOP_MAX_ITERATIONS = 20_000;
const CODE_RUNTIME_STRING_MAX_LENGTH = 100_000;
const CODE_RUNTIME_ARRAY_MAX_ITEMS = 20_000;
const CODE_RUNTIME_NESTING_MAX_DEPTH = 20;

type CodeRuntimeValue = number | string | boolean | null | CodeRuntimeValue[];
type CodeRuntimeEnv = Map<string, CodeRuntimeValue>;
type CodeRuntimeLambda = {
  kind: "lambda";
  params: string[];
  body: string;
};
type CodeRuntimeNativeObject = { kind: "native"; name: "Math" };
type CodeRuntimeAnyValue =
  | CodeRuntimeValue
  | CodeRuntimeLambda
  | CodeRuntimeNativeObject;

type ExpressionToken =
  | { type: "number"; value: number; raw: string }
  | { type: "string"; value: string; raw: string }
  | { type: "identifier"; value: string; raw: string }
  | { type: "operator"; value: string; raw: string }
  | { type: "paren"; value: "(" | ")"; raw: string }
  | { type: "bracket"; value: "[" | "]"; raw: string }
  | { type: "dot"; value: "."; raw: "." }
  | { type: "comma"; value: ","; raw: "," };

function isLambda(value: CodeRuntimeAnyValue): value is CodeRuntimeLambda {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    value.kind === "lambda"
  );
}

function isNativeObject(value: CodeRuntimeAnyValue): value is CodeRuntimeNativeObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    value.kind === "native"
  );
}

function assertRuntimeValueWithinBudget(value: CodeRuntimeValue, depth = 0) {
  if (typeof value === "string" && value.length > CODE_RUNTIME_STRING_MAX_LENGTH) {
    throw new Error(
      `运行结果过大：字符串最多 ${CODE_RUNTIME_STRING_MAX_LENGTH} 个字符`
    );
  }
  if (!Array.isArray(value)) return;
  if (value.length > CODE_RUNTIME_ARRAY_MAX_ITEMS) {
    throw new Error(`运行结果过大：数组最多 ${CODE_RUNTIME_ARRAY_MAX_ITEMS} 项`);
  }
  if (depth >= CODE_RUNTIME_NESTING_MAX_DEPTH) {
    throw new Error(`运行结果嵌套过深，最多 ${CODE_RUNTIME_NESTING_MAX_DEPTH} 层`);
  }
  for (const item of value) assertRuntimeValueWithinBudget(item, depth + 1);
}

function checkedRuntimeValue(value: CodeRuntimeValue): CodeRuntimeValue {
  assertRuntimeValueWithinBudget(value);
  return value;
}

function toJsString(value: CodeRuntimeValue): string {
  if (Array.isArray(value)) return value.map((item) => toJsArrayJoinString(item)).join(",");
  return String(value);
}

function toJsArrayJoinString(value: CodeRuntimeValue): string {
  if (value === null) return "";
  return toJsString(value);
}

function formatCodeValue(value: unknown, depth = 0): string {
  if (typeof value === "string") return value.slice(0, CODE_OUTPUT_MAX_LENGTH);
  if (typeof value === "undefined") return "";
  const runtimeValue = value as CodeRuntimeAnyValue;
  if (isLambda(runtimeValue)) return "[Function]";
  if (isNativeObject(runtimeValue)) return `[${runtimeValue.name}]`;
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol" ||
    typeof value === "function"
  ) {
    return String(value);
  }
  if (depth >= 2) return "[Object]";
  if (Array.isArray(value)) {
    const items = value
      .slice(0, CODE_VALUE_PREVIEW_ITEMS)
      .map((item) => formatCodeValue(item, depth + 1));
    const suffix =
      value.length > CODE_VALUE_PREVIEW_ITEMS
        ? `, ... 还有 ${value.length - CODE_VALUE_PREVIEW_ITEMS} 项`
        : "";
    return `[${items.join(", ")}${suffix}]`;
  }
  const tag = Object.prototype.toString.call(value);
  if (tag === "[object Date]") return String(value);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const entries = keys.slice(0, CODE_VALUE_PREVIEW_ITEMS).map((key) => {
    let item: unknown;
    try {
      item = record[key];
    } catch {
      item = "[Unserializable]";
    }
    return `${JSON.stringify(key)}: ${formatCodeValue(item, depth + 1)}`;
  });
  const suffix =
    keys.length > CODE_VALUE_PREVIEW_ITEMS
      ? `, ... 还有 ${keys.length - CODE_VALUE_PREVIEW_ITEMS} 个字段`
      : "";
  return `{${entries.join(", ")}${suffix}}`;
}

function assertSafeJavaScriptSnippet(code: string) {
  if (code.length > CODE_MAX_LENGTH) {
    throw new Error(`代码过长，最多 ${CODE_MAX_LENGTH} 个字符`);
  }
  const blocked = /\b(?:process|require|module|exports|import|eval|Function|constructor|prototype|__proto__|globalThis|global|fetch|XMLHttpRequest|WebSocket|Worker|Deno|Bun|Atomics|SharedArrayBuffer|Promise|queueMicrotask|setTimeout|setInterval|async|await|new|class|this|while)\b/;
  if (blocked.test(code)) {
    throw new Error("代码包含受限 API；只能运行短小、无网络、无文件访问的 JavaScript 片段");
  }
}

function splitTopLevelStatements(code: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let quote: "'" | "\"" | "`" | null = null;
  let escaped = false;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === "{") braceDepth++;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);

    if (
      (char === ";" || char === "\n") &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      const statement = code.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }

  const rest = code.slice(start).trim();
  if (rest) statements.push(rest);
  return statements;
}

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let quote: "'" | "\"" | "`" | null = null;
  let escaped = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === "{") braceDepth++;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (
      char === "," &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  const rest = value.slice(start).trim();
  if (rest) parts.push(rest);
  return parts;
}

function tokenizeExpression(expression: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let i = 0;
  while (i < expression.length) {
    const char = expression[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === "'" || char === "\"") {
      const quote = char;
      let value = "";
      i++;
      while (i < expression.length) {
        const next = expression[i++];
        if (next === "\\") {
          const escaped = expression[i++];
          value += escaped ?? "";
          continue;
        }
        if (next === quote) break;
        value += next;
      }
      tokens.push({ type: "string", value, raw: JSON.stringify(value) });
      continue;
    }
    if (/\d/.test(char) || (char === "." && /\d/.test(expression[i + 1] ?? ""))) {
      const match = expression.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
      if (!match) throw new Error(`无法解析表达式：${expression}`);
      tokens.push({ type: "number", value: Number(match[0]), raw: match[0] });
      i += match[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      const match = expression.slice(i).match(/^[A-Za-z_$][\w$]*/);
      if (!match) throw new Error(`无法解析表达式：${expression}`);
      tokens.push({ type: "identifier", value: match[0], raw: match[0] });
      i += match[0].length;
      continue;
    }
    if (char === ".") {
      tokens.push({ type: "dot", value: ".", raw: "." });
      i++;
      continue;
    }
    const two = expression.slice(i, i + 2);
    const three = expression.slice(i, i + 3);
    if (["===", "!=="].includes(three)) {
      tokens.push({ type: "operator", value: three, raw: three });
      i += 3;
      continue;
    }
    if (["**", "<=", ">=", "==", "!=", "&&", "||", "=>"].includes(two)) {
      tokens.push({ type: "operator", value: two, raw: two });
      i += 2;
      continue;
    }
    if ("+-*/%<>!".includes(char)) {
      tokens.push({ type: "operator", value: char, raw: char });
      i++;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char, raw: char });
      i++;
      continue;
    }
    if (char === "[" || char === "]") {
      tokens.push({ type: "bracket", value: char, raw: char });
      i++;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma", value: char, raw: char });
      i++;
      continue;
    }
    throw new Error(`表达式包含不支持的字符：${char}`);
  }
  return tokens;
}

function toNumber(value: CodeRuntimeAnyValue): number {
  if (Array.isArray(value) || isLambda(value) || isNativeObject(value)) {
    throw new Error("表达式需要数值");
  }
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("表达式需要数值");
  return number;
}

function toBoolean(value: CodeRuntimeAnyValue): boolean {
  if (isLambda(value) || isNativeObject(value)) return true;
  return Boolean(value);
}

function asRuntimeValue(value: CodeRuntimeAnyValue): CodeRuntimeValue {
  if (isLambda(value) || isNativeObject(value)) {
    throw new Error("表达式结果不是可输出的值");
  }
  return checkedRuntimeValue(value);
}

function resolveIdentifier(name: string, env: CodeRuntimeEnv): CodeRuntimeAnyValue {
  if (env.has(name)) return env.get(name) ?? null;
  if (name === "true") return true;
  if (name === "false") return false;
  if (name === "null") return null;
  if (name === "Math") return { kind: "native", name: "Math" };
  throw new Error(`变量未定义：${name}`);
}

function callMathFunction(name: string, args: CodeRuntimeAnyValue[]): CodeRuntimeValue {
  const fnName = name.replace(/^Math\./, "");
  const allowed = new Set([
    "abs",
    "ceil",
    "floor",
    "round",
    "trunc",
    "sqrt",
    "pow",
    "min",
    "max",
    "sin",
    "cos",
    "tan",
    "log",
    "exp",
    "random",
  ]);
  if (!allowed.has(fnName)) throw new Error(`不支持的函数：${name}`);
  const fn = Math[fnName as keyof Math];
  if (typeof fn !== "function") throw new Error(`不支持的函数：${name}`);
  return (fn as (...values: number[]) => number)(...args.map(toNumber));
}

function evaluateExpression(expression: string, env: CodeRuntimeEnv): CodeRuntimeValue {
  const tokens = tokenizeExpression(expression);
  let index = 0;

  const peek = () => tokens[index];
  const consume = () => tokens[index++];
  const matchOperator = (...ops: string[]) => {
    const token = peek();
    if (token?.type === "operator" && ops.includes(token.value)) {
      index++;
      return token.value;
    }
    return null;
  };

  const consumeExpected = <T extends ExpressionToken["type"]>(
    type: T,
    value?: Extract<ExpressionToken, { type: T }>["value"]
  ) => {
    const token = consume();
    if (!token || token.type !== type || (value && token.value !== value)) {
      throw new Error(`表达式语法错误：${expression}`);
    }
    return token as Extract<ExpressionToken, { type: T }>;
  };

  function isLambdaStart(): boolean {
    const token = peek();
    if (!token) return false;
    if (token.type === "identifier") {
      return (
        tokens[index + 1]?.type === "operator" &&
        tokens[index + 1]?.value === "=>"
      );
    }
    if (token.type !== "paren" || token.value !== "(") return false;
    let scan = index + 1;
    let expectIdentifier = true;
    let sawParam = false;
    while (scan < tokens.length) {
      const current = tokens[scan];
      if (current?.type === "paren" && current.value === ")") {
        return (
          (!expectIdentifier || !sawParam) &&
          tokens[scan + 1]?.type === "operator" &&
          tokens[scan + 1]?.value === "=>"
        );
      }
      if (expectIdentifier) {
        if (current?.type !== "identifier") return false;
        sawParam = true;
        expectIdentifier = false;
      } else {
        if (current?.type !== "comma") return false;
        expectIdentifier = true;
      }
      scan++;
    }
    return false;
  }

  function parseLambda(): CodeRuntimeLambda {
    const params: string[] = [];
    const start = peek();
    if (start?.type === "identifier") {
      params.push(consumeExpected("identifier").value);
    } else {
      consumeExpected("paren", "(");
      while (peek() && !(peek()?.type === "paren" && peek()?.value === ")")) {
        params.push(consumeExpected("identifier").value);
        if (peek()?.type === "comma") consume();
      }
      consumeExpected("paren", ")");
    }
    consumeExpected("operator", "=>");

    const bodyStart = index;
    let parenDepth = 0;
    let bracketDepth = 0;
    while (index < tokens.length) {
      const token = peek();
      if (
        parenDepth === 0 &&
        bracketDepth === 0 &&
        (token?.type === "comma" ||
          (token?.type === "paren" && token.value === ")") ||
          (token?.type === "bracket" && token.value === "]"))
      ) {
        break;
      }
      if (token?.type === "paren") {
        if (token.value === "(") parenDepth++;
        else parenDepth = Math.max(0, parenDepth - 1);
      } else if (token?.type === "bracket") {
        if (token.value === "[") bracketDepth++;
        else bracketDepth = Math.max(0, bracketDepth - 1);
      }
      index++;
    }
    const body = tokens
      .slice(bodyStart, index)
      .map((token) => token.raw)
      .join("");
    if (!body.trim()) throw new Error(`箭头函数缺少函数体：${expression}`);
    return { kind: "lambda", params, body };
  }

  function parseArgument(): CodeRuntimeAnyValue {
    if (isLambdaStart()) return parseLambda();
    return parseLogicalOr();
  }

  function parseCallArgs(): CodeRuntimeAnyValue[] {
    consumeExpected("paren", "(");
    const args: CodeRuntimeAnyValue[] = [];
    while (peek() && !(peek()?.type === "paren" && peek()?.value === ")")) {
      args.push(parseArgument());
      if (peek()?.type === "comma") consume();
      else break;
    }
    consumeExpected("paren", ")");
    return args;
  }

  function invokeLambda(
    lambda: CodeRuntimeLambda,
    values: CodeRuntimeValue[],
    parentEnv: CodeRuntimeEnv
  ): CodeRuntimeValue {
    const scoped = new Map(parentEnv);
    lambda.params.forEach((param, i) => scoped.set(param, values[i] ?? null));
    return evaluateExpression(lambda.body, scoped);
  }

  function getMember(value: CodeRuntimeAnyValue, property: string): CodeRuntimeAnyValue {
    if (isNativeObject(value)) {
      if (property === "PI") return Math.PI;
      if (property === "E") return Math.E;
      throw new Error(`不支持的属性：Math.${property}`);
    }
    if (Array.isArray(value)) {
      if (property === "length") return value.length;
      throw new Error(`不支持的数组属性：${property}`);
    }
    if (typeof value === "string") {
      if (property === "length") return value.length;
      throw new Error(`不支持的字符串属性：${property}`);
    }
    throw new Error(`不支持的属性访问：${property}`);
  }

  function getIndex(value: CodeRuntimeAnyValue, key: CodeRuntimeAnyValue): CodeRuntimeValue {
    const indexValue = Math.trunc(toNumber(key));
    if (Array.isArray(value)) return value[indexValue] ?? null;
    if (typeof value === "string") return value[indexValue] ?? "";
    throw new Error("只有数组和字符串支持下标访问");
  }

  function applyMemberCall(
    target: CodeRuntimeAnyValue,
    method: string,
    args: CodeRuntimeAnyValue[]
  ): CodeRuntimeValue {
    if (isNativeObject(target)) {
      return callMathFunction(`Math.${method}`, args);
    }

    if (Array.isArray(target)) {
      const array = target;
      if (method === "map") {
        const fn = args[0];
        if (!isLambda(fn)) throw new Error("Array.map 需要箭头函数参数");
        return checkedRuntimeValue(
          array.map((item, i) => invokeLambda(fn, [item, i, array], env))
        );
      }
      if (method === "filter") {
        const fn = args[0];
        if (!isLambda(fn)) throw new Error("Array.filter 需要箭头函数参数");
        return checkedRuntimeValue(
          array.filter((item, i) =>
            toBoolean(invokeLambda(fn, [item, i, array], env))
          )
        );
      }
      if (method === "reduce") {
        const fn = args[0];
        if (!isLambda(fn)) throw new Error("Array.reduce 需要箭头函数参数");
        if (array.length === 0 && args.length < 2) {
          throw new Error("空数组 reduce 需要初始值");
        }
        let acc = args.length >= 2 ? asRuntimeValue(args[1]) : array[0];
        const start = args.length >= 2 ? 0 : 1;
        for (let i = start; i < array.length; i++) {
          acc = invokeLambda(fn, [acc, array[i], i, array], env);
        }
        return checkedRuntimeValue(acc);
      }
      if (method === "join") {
        const separator =
          args.length > 0 ? toJsString(asRuntimeValue(args[0])) : ",";
        return checkedRuntimeValue(array.map((item) => toJsArrayJoinString(item)).join(separator));
      }
      if (method === "slice") {
        const start = args.length > 0 ? Math.trunc(toNumber(args[0])) : undefined;
        const end = args.length > 1 ? Math.trunc(toNumber(args[1])) : undefined;
        return checkedRuntimeValue(array.slice(start, end));
      }
      if (method === "at") {
        const position = Math.trunc(toNumber(args[0] ?? 0));
        return array.at(position) ?? null;
      }
      if (method === "includes") return array.includes(asRuntimeValue(args[0]));
      if (method === "indexOf") return array.indexOf(asRuntimeValue(args[0]));
      if (method === "reverse") return checkedRuntimeValue([...array].reverse());
      if (method === "sort") {
        const sorted = [...array];
        const fn = args[0];
        if (typeof fn === "undefined") {
          return checkedRuntimeValue(
            sorted.sort((a, b) =>
              toJsString(a).localeCompare(toJsString(b))
            )
          );
        }
        if (!isLambda(fn)) throw new Error("Array.sort 只支持箭头函数比较器");
        return checkedRuntimeValue(
          sorted.sort((a, b) => toNumber(invokeLambda(fn, [a, b], env)))
        );
      }
      throw new Error(`不支持的数组方法：${method}`);
    }

    if (typeof target === "string") {
      const values = args.map(asRuntimeValue);
      if (method === "split") {
        const separator =
          typeof values[0] === "undefined" || values[0] === null
            ? undefined
            : toJsString(values[0]);
        const limit =
          typeof values[1] === "undefined" || values[1] === null
            ? undefined
            : Math.trunc(toNumber(values[1]));
        return typeof separator === "undefined"
          ? [target]
          : checkedRuntimeValue(target.split(separator, limit));
      }
      if (method === "slice") {
        const start =
          typeof values[0] === "undefined" || values[0] === null
            ? undefined
            : Math.trunc(toNumber(values[0]));
        const end =
          typeof values[1] === "undefined" || values[1] === null
            ? undefined
            : Math.trunc(toNumber(values[1]));
        return checkedRuntimeValue(target.slice(start, end));
      }
      if (method === "toUpperCase") return target.toUpperCase();
      if (method === "toLowerCase") return target.toLowerCase();
      if (method === "trim") return target.trim();
      if (method === "includes") return target.includes(toJsString(values[0] ?? ""));
      if (method === "indexOf") return target.indexOf(toJsString(values[0] ?? ""));
      if (method === "startsWith") return target.startsWith(toJsString(values[0] ?? ""));
      if (method === "endsWith") return target.endsWith(toJsString(values[0] ?? ""));
      throw new Error(`不支持的字符串方法：${method}`);
    }

    throw new Error(`不支持的方法调用：${method}`);
  }

  function parsePrimaryBase(): CodeRuntimeAnyValue {
    const token = consume();
    if (!token) throw new Error(`表达式不完整：${expression}`);
    if (token.type === "number" || token.type === "string") return token.value;
    if (token.type === "identifier") {
      return resolveIdentifier(token.value, env);
    }
    if (token.type === "paren" && token.value === "(") {
      const value = parseLogicalOr();
      const close = consume();
      if (close?.type !== "paren" || close.value !== ")") {
        throw new Error(`表达式缺少右括号：${expression}`);
      }
      return value;
    }
    if (token.type === "bracket" && token.value === "[") {
      const items: CodeRuntimeValue[] = [];
      while (peek() && !(peek()?.type === "bracket" && peek()?.value === "]")) {
        items.push(asRuntimeValue(parseLogicalOr()));
        if (peek()?.type === "comma") consume();
        else break;
      }
      consumeExpected("bracket", "]");
      return items;
    }
    throw new Error(`表达式语法错误：${expression}`);
  }

  function parsePostfix(): CodeRuntimeAnyValue {
    let value = parsePrimaryBase();
    for (;;) {
      if (peek()?.type === "bracket" && peek()?.value === "[") {
        consume();
        const key = parseLogicalOr();
        consumeExpected("bracket", "]");
        value = getIndex(value, key);
        continue;
      }
      if (peek()?.type !== "dot") return value;
      consume();
      const property = consumeExpected("identifier").value;
      if (peek()?.type === "paren" && peek()?.value === "(") {
        value = applyMemberCall(value, property, parseCallArgs());
      } else {
        value = getMember(value, property);
      }
    }
  }

  function parseUnary(): CodeRuntimeAnyValue {
    const op = matchOperator("+", "-", "!");
    if (!op) return parsePostfix();
    if (op === "!") return !toBoolean(parseUnary());
    const value = toNumber(parseUnary());
    return op === "-" ? -value : value;
  }

  function parsePower(): CodeRuntimeAnyValue {
    let value = parseUnary();
    while (matchOperator("**")) {
      value = toNumber(value) ** toNumber(parseUnary());
    }
    return value;
  }

  function parseMultiplicative(): CodeRuntimeAnyValue {
    let value = parsePower();
    for (;;) {
      const op = matchOperator("*", "/", "%");
      if (!op) return value;
      const right = parsePower();
      if (op === "*") value = toNumber(value) * toNumber(right);
      if (op === "/") value = toNumber(value) / toNumber(right);
      if (op === "%") value = toNumber(value) % toNumber(right);
    }
  }

  function parseAdditive(): CodeRuntimeAnyValue {
    let value = parseMultiplicative();
    for (;;) {
      const op = matchOperator("+", "-");
      if (!op) return value;
      const right = parseMultiplicative();
      if (op === "+") {
        value =
          typeof value === "string" || typeof right === "string"
            ? checkedRuntimeValue(
                `${toJsString(asRuntimeValue(value))}${toJsString(
                  asRuntimeValue(right)
                )}`
              )
            : toNumber(value) + toNumber(right);
      } else {
        value = toNumber(value) - toNumber(right);
      }
    }
  }

  function parseComparison(): CodeRuntimeAnyValue {
    let value = parseAdditive();
    for (;;) {
      const op = matchOperator("<", "<=", ">", ">=", "==", "!=", "===", "!==");
      if (!op) return value;
      const right = parseAdditive();
      if (op === "<") value = toNumber(value) < toNumber(right);
      if (op === "<=") value = toNumber(value) <= toNumber(right);
      if (op === ">") value = toNumber(value) > toNumber(right);
      if (op === ">=") value = toNumber(value) >= toNumber(right);
      if (op === "==" || op === "===") value = value === right;
      if (op === "!=" || op === "!==") value = value !== right;
    }
  }

  function parseLogicalAnd(): CodeRuntimeAnyValue {
    let value = parseComparison();
    while (matchOperator("&&")) {
      const right = parseComparison();
      value = toBoolean(value) ? right : value;
    }
    return value;
  }

  function parseLogicalOr(): CodeRuntimeAnyValue {
    let value = parseLogicalAnd();
    while (matchOperator("||")) {
      const right = parseLogicalAnd();
      value = toBoolean(value) ? value : right;
    }
    return value;
  }

  const result = parseLogicalOr();
  if (index < tokens.length) throw new Error(`表达式语法错误：${expression}`);
  return asRuntimeValue(result);
}

function assignVariable(
  env: CodeRuntimeEnv,
  name: string,
  op: "=" | "+=" | "-=" | "*=" | "/=",
  value: CodeRuntimeValue
) {
  if (op === "=") {
    env.set(name, value);
    return;
  }
  const previous = resolveIdentifier(name, env);
  if (op === "+=") env.set(name, toNumber(previous) + toNumber(value));
  if (op === "-=") env.set(name, toNumber(previous) - toNumber(value));
  if (op === "*=") env.set(name, toNumber(previous) * toNumber(value));
  if (op === "/=") env.set(name, toNumber(previous) / toNumber(value));
}

// 仅保留旧解释器供历史结果调试；聊天工具已强制走 gVisor，不会调用或回退到这里。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function runJavaScriptSnippet(code: string): Promise<string> {
  assertSafeJavaScriptSnippet(code);
  const logs: string[] = [];
  const env: CodeRuntimeEnv = new Map();
  const pushLog = (...args: unknown[]) => {
    if (logs.join("\n").length >= CODE_OUTPUT_MAX_LENGTH) return;
    logs.push(args.map((arg) => formatCodeValue(arg)).join(" "));
  };

  let loopIterations = 0;
  let lastValue: CodeRuntimeValue | undefined;

  const executeStatement = (statement: string): boolean => {
    const value = statement.trim();
    if (!value) return false;

    const forMatch = value.match(/^for\s*\(([\s\S]*?)\)\s*\{([\s\S]*)\}$/);
    if (forMatch) {
      const header = splitTopLevelStatements(forMatch[1]);
      if (header.length !== 3) throw new Error("for 循环格式无效");
      executeStatement(header[0]);
      while (evaluateExpression(header[1], env)) {
        if (++loopIterations > CODE_LOOP_MAX_ITERATIONS) {
          throw new Error(`循环次数过多，最多 ${CODE_LOOP_MAX_ITERATIONS} 次`);
        }
        for (const bodyStatement of splitTopLevelStatements(forMatch[2])) {
          if (executeStatement(bodyStatement)) return true;
        }
        executeStatement(header[2]);
      }
      return false;
    }

    const consoleMatch = value.match(/^console\.(?:log|info|warn|error)\(([\s\S]*)\)$/);
    if (consoleMatch) {
      pushLog(...splitTopLevelCommas(consoleMatch[1]).map((part) => evaluateExpression(part, env)));
      return false;
    }

    const returnMatch = value.match(/^return\s+([\s\S]*?);?$/);
    if (returnMatch) {
      lastValue = evaluateExpression(returnMatch[1], env);
      return true;
    }

    const declarationMatch = value.match(/^(?:let|const|var)\s+([A-Za-z_$][\w$]*)(?:\s*=\s*([\s\S]+))?$/);
    if (declarationMatch) {
      env.set(
        declarationMatch[1],
        declarationMatch[2] ? evaluateExpression(declarationMatch[2], env) : null
      );
      return false;
    }

    const updateMatch = value.match(/^([A-Za-z_$][\w$]*)(\+\+|--)$/);
    if (updateMatch) {
      const current = toNumber(resolveIdentifier(updateMatch[1], env));
      env.set(updateMatch[1], updateMatch[2] === "++" ? current + 1 : current - 1);
      return false;
    }

    const prefixUpdateMatch = value.match(/^(\+\+|--)([A-Za-z_$][\w$]*)$/);
    if (prefixUpdateMatch) {
      const current = toNumber(resolveIdentifier(prefixUpdateMatch[2], env));
      env.set(prefixUpdateMatch[2], prefixUpdateMatch[1] === "++" ? current + 1 : current - 1);
      return false;
    }

    const assignmentMatch = value.match(/^([A-Za-z_$][\w$]*)\s*(=|\+=|-=|\*=|\/=)\s*([\s\S]+)$/);
    if (assignmentMatch) {
      assignVariable(
        env,
        assignmentMatch[1],
        assignmentMatch[2] as "=" | "+=" | "-=" | "*=" | "/=",
        evaluateExpression(assignmentMatch[3], env)
      );
      return false;
    }

    lastValue = evaluateExpression(value, env);
    return false;
  };

  for (const statement of splitTopLevelStatements(code.trim())) {
    if (executeStatement(statement)) break;
  }
  if (logs.length === 0 && typeof lastValue !== "undefined") pushLog(lastValue);
  const output = logs.join("\n") || "（无输出）";
  return output.slice(0, CODE_OUTPUT_MAX_LENGTH);
}

export function buildCodeTools(
  userId: string,
  context?: { conversationId: string; messageId: string; modelId: string }
): ToolSet {
  const tools: ToolSet = {
    run_code: tool({
      description:
        "在 gVisor 隔离沙盒中运行最长 120 秒的 Python、Node.js 或 Bash。Python 已预装 pandas、NumPy、PyArrow、OpenPyXL、Polars、DuckDB、SciPy、scikit-learn 和绘图库。沙盒无网络、非 root、根文件系统只读；输入附件位于 /workspace/input，解压和中间文件写入 /tmp，需交付的文件必须写入 /workspace/output。预计超过 120 秒时改用 start_code_lab。",
      inputSchema: z.object({
        language: z
          .enum(["python", "node", "javascript", "js", "bash"])
          .describe("运行语言；javascript/js 会使用 Node.js"),
        code: z.string().max(1_000_000).describe("要在沙盒中执行的完整代码"),
        args: z
          .array(z.string().max(4_096))
          .max(32)
          .optional()
          .describe("传给脚本的命令行参数"),
        inputs: z
          .array(
            z.object({
              attachmentId: z.string().describe("用户拥有的附件或媒体资产 id"),
              path: z
                .string()
                .max(240)
                .optional()
                .describe("在 /workspace/input 下的相对路径；默认使用原文件名"),
            })
          )
          .max(32)
          .optional()
          .describe("只读输入附件"),
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(120)
          .optional()
          .describe("运行超时；普通代码默认 30 秒，数据或压缩包处理建议 120 秒"),
      }),
      execute: async ({ language, code, args, inputs, timeoutSeconds }) => {
        const policy = await resolveCodeSandboxPolicy(userId);
        const sandboxLanguage: SandboxLanguage =
          language === "python" || language === "bash" ? language : "node";
        const inputFiles: SandboxInputFile[] = [];
        const usedPaths = new Set<string>();
        for (const input of inputs ?? []) {
          const loaded = await loadOwnedCodeSandboxInput(userId, input.attachmentId);
          let targetPath = input.path?.trim() || codeSandboxInputName(loaded.name);
          if (usedPaths.has(targetPath)) {
            targetPath = `${input.attachmentId}-${targetPath}`;
          }
          usedPaths.add(targetPath);
          inputFiles.push({ path: targetPath, content: loaded.buffer });
        }

        const result = await runCodeSandbox({
          language: sandboxLanguage,
          code,
          args,
          inputFiles,
          limits: codeSandboxLimits(
            policy,
            Math.min(
              timeoutSeconds ?? policy.defaultTimeoutSeconds,
              policy.maxSyncTimeoutSeconds
            )
          ),
        });
        const stdout = truncateSandboxConsole(result.stdout);
        const stderr = truncateSandboxConsole(result.stderr);
        const attachments = await persistCodeSandboxOutputs(userId, result.outputFiles);
        const policySummary = codeSandboxPolicySummary(policy);

        const summary = [
          `语言：${sandboxLanguage}`,
          `环境：${policySummary.label} · /tmp ${policySummary.tmpMiB} MiB · 内存 ${policySummary.memoryMiB} MiB`,
          `退出码：${result.exitCode ?? "无"}`,
          `耗时：${result.durationMs} ms`,
          result.timedOut ? "状态：运行超时" : undefined,
          result.stdoutStderrLimitExceeded ? "状态：标准输出超过限制" : undefined,
          result.outputLimitExceeded ? "状态：部分输出文件超过限制，未保存" : undefined,
          stdout.text ? `stdout:\n${stdout.text}` : "stdout：（无输出）",
          stderr.text ? `stderr:\n${stderr.text}` : undefined,
          stdout.truncated || stderr.truncated
            ? "状态：控制台预览已截断；如需完整结果请写入 /workspace/output 文件"
            : undefined,
        ].filter((value): value is string => Boolean(value));
        return {
          text: summary.join("\n"),
          attachments,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          timedOut: result.timedOut,
          stdoutStderrLimitExceeded: result.stdoutStderrLimitExceeded,
          outputLimitExceeded: result.outputLimitExceeded,
          consolePreviewTruncated: stdout.truncated || stderr.truncated,
          sandboxPolicy: policySummary,
        };
      },
    }),
  };

  if (context) {
    Object.assign(tools, {
      start_code_lab: tool({
        description:
          "启动可刷新恢复的后台 Code Lab。仅用于预计超过 120 秒、较大压缩包/数据集、需要进度和停止能力的代码任务；短任务继续使用 run_code。任务最长 300 秒，完成后会生成附件和简短回执。",
        inputSchema: z.object({
          language: z.enum(["python", "node", "javascript", "js", "bash"]),
          code: z.string().max(1_000_000).describe("要在后台沙盒执行的完整代码"),
          args: z.array(z.string().max(4_096)).max(32).optional(),
          inputs: z
            .array(
              z.object({
                attachmentId: z.string(),
                path: z.string().max(240).optional(),
              })
            )
            .max(32)
            .optional(),
          timeoutSeconds: z
            .number()
            .int()
            .min(121)
            .max(300)
            .optional()
            .describe("后台运行上限，默认 300 秒"),
          taskName: z.string().min(2).max(80).optional().describe("任务卡标题"),
        }),
        execute: async ({
          language,
          code,
          args,
          inputs,
          timeoutSeconds,
          taskName,
        }) => {
          const { createSkillRun } = await import("@/lib/server/skill-runs");
          const run = await createSkillRun({
            ownerId: userId,
            conversationId: context.conversationId,
            messageId: context.messageId,
            kind: "code-lab",
            skillName: taskName?.trim() || "Code Lab",
            payload: {
              language,
              code,
              args,
              inputs,
              timeoutSeconds: timeoutSeconds ?? 300,
              modelId: context.modelId,
            },
          });
          if (!run) throw new Error("Code Lab 后台任务创建失败");
          return {
            text: "Code Lab 已在后台启动，可在任务卡查看进度、停止运行，并在完成后下载输出文件。",
            skillRunId: run.id,
            skillName: run.skillName,
          };
        },
      }),
    });
  }

  return tools;
}

function truncateSandboxConsole(value: string) {
  if (value.length <= SANDBOX_CONSOLE_PREVIEW_MAX_LENGTH) {
    return { text: value, truncated: false };
  }
  return {
    text: `${value.slice(0, SANDBOX_CONSOLE_PREVIEW_MAX_LENGTH)}\n…（控制台输出已截断）`,
    truncated: true,
  };
}

// ---------- 图像生成 / 编辑（gpt-image-2） ----------

class RetryableImageError extends Error {}

const REMOTE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const IMAGE_EDIT_TIMEOUT_MS = 110_000;
const MAX_REMOTE_IMAGE_REDIRECTS = 5;

type GeneratedImageItem = {
  b64_json?: string;
  url?: string;
};

type RemoteImageDownload =
  | { type: "redirect"; location: string }
  | { type: "image"; buffer: Buffer; ext: string };

function imageExtensionFromContentType(contentType: string | null): string | null {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  if (type === "image/png") return ".png";
  if (type === "image/jpeg" || type === "image/jpg") return ".jpg";
  if (type === "image/webp") return ".webp";
  return null;
}

function mimeFromImageExtension(ext: string): string {
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function imageExtensionFromMime(mime: string): string | null {
  const type = mime.split(";")[0]?.trim().toLowerCase();
  if (type === "image/png") return ".png";
  if (type === "image/jpeg" || type === "image/jpg") return ".jpg";
  if (type === "image/webp") return ".webp";
  return null;
}

function imageBlobNameFromMime(mime: string) {
  return `image${imageExtensionFromMime(mime) ?? ".png"}`;
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

export async function saveRemoteGeneratedImage(
  userId: string,
  remoteUrl: string,
  kind: "generated" | "edited" = "generated",
  id?: string
): Promise<string> {
  const { buffer, ext } = await fetchSafeRemoteImage(remoteUrl);
  const { persistMedia } = await import("@/lib/server/media");
  const asset = await persistMedia({
    ownerId: userId,
    bytes: buffer,
    mimeType: mimeFromImageExtension(ext),
    name: `generated${ext}`,
    kind,
    ext,
    sourceTool: kind === "edited" ? "edit_image" : "generate_image",
    id,
  });
  return asset.url;
}

function dataUrlToImageBlob(dataUrl: string): { blob: Blob; mime: string; filename: string } {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    dataUrl
  );
  if (!match) throw new Error("图片格式无效，仅支持 PNG/JPEG/WebP");
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > REMOTE_IMAGE_MAX_BYTES) {
    throw new Error("图片过大，请压缩到 12MB 以下再编辑");
  }
  return {
    blob: new Blob([bufferToArrayBuffer(buffer)], { type: mime }),
    mime,
    filename: imageBlobNameFromMime(mime),
  };
}

async function imageUrlToEditBlob(
  imageUrl: string,
  origin?: string
): Promise<{ blob: Blob; filename: string }> {
  const source = await resolveImageSource(imageUrl, origin);
  if (source.startsWith("data:image/")) {
    return dataUrlToImageBlob(source);
  }
  if (!/^https?:\/\//i.test(source)) {
    throw new Error("图片路径无效");
  }

  const { buffer, ext } = await fetchSafeRemoteImage(source);
  return {
    blob: new Blob([bufferToArrayBuffer(buffer)], { type: mimeFromImageExtension(ext) }),
    filename: `image${ext}`,
  };
}

async function fetchImageEdit(baseURL: string, apiKey: string, form: FormData) {
  try {
    return await fetch(`${baseURL}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(IMAGE_EDIT_TIMEOUT_MS),
    });
  } catch (e) {
    if (isTimeoutError(e)) throw new Error("图片编辑超时，请稍后重试");
    if (isRetryableImageError(e)) {
      throw new RetryableImageError("图片编辑请求网络异常，请稍后重试");
    }
    throw e;
  }
}

async function fetchSafeRemoteImage(rawUrl: string): Promise<{ buffer: Buffer; ext: string }> {
  let url = rawUrl;
  for (let redirects = 0; redirects <= MAX_REMOTE_IMAGE_REDIRECTS; redirects++) {
    await assertSafeUrl(url);
    const result = await fetchRemoteImageWithRetry(url);
    if (result.type === "image") return { buffer: result.buffer, ext: result.ext };

    url = new URL(result.location, url).toString();
  }
  throw new Error("下载生图结果失败：重定向次数过多");
}

async function fetchRemoteImageWithRetry(url: string): Promise<RemoteImageDownload> {
  try {
    return await fetchRemoteImageAttempt(url);
  } catch (e) {
    if (!isRetryableImageError(e)) throw e;
    // 远程图片下载偶发失败时，只重试下载，不重复发起生图请求。
    try {
      return await fetchRemoteImageAttempt(url);
    } catch (secondErr) {
      if (isRetryableImageError(secondErr)) {
        throw new Error(toRemoteImageFetchErrorMessage(secondErr));
      }
      throw secondErr;
    }
  }
}

async function fetchRemoteImageAttempt(url: string): Promise<RemoteImageDownload> {
  const res = await fetchRemoteImageOnce(url);
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get("location");
    if (!location) throw new Error("下载生图结果失败：重定向缺少 Location");
    return { type: "redirect", location };
  }
  if (!res.ok) throw new Error(await formatUpstreamError(res, "下载生图结果失败"));

  const ext = imageExtensionFromContentType(res.headers.get("content-type"));
  if (!ext) throw new Error("生图结果图片格式不受支持");
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > REMOTE_IMAGE_MAX_BYTES) throw new Error("生图结果图片过大");

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > REMOTE_IMAGE_MAX_BYTES) throw new Error("生图结果图片过大");
  return { type: "image", buffer, ext };
}

function fetchRemoteImageOnce(url: string) {
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS),
  });
}

function isTimeoutError(e: unknown) {
  if (!(e instanceof Error)) return false;
  return (
    e.name === "TimeoutError" ||
    e.name === "AbortError" ||
    /timeout|aborted/i.test(e.message)
  );
}

function isRetryableImageError(e: unknown) {
  if (e instanceof RetryableImageError) return true;
  return (
    e instanceof Error &&
    /fetch failed|network|timeout|ECONN|ETIMEDOUT|AbortError/i.test(e.message)
  );
}

function toRemoteImageFetchErrorMessage(e: unknown) {
  if (!(e instanceof Error)) return "下载生图结果失败，请稍后重试";
  if (/timeout|AbortError|ETIMEDOUT/i.test(e.message)) {
    return "下载生图结果超时，请稍后重试";
  }
  if (/fetch failed|network|ECONN/i.test(e.message)) {
    return "下载生图结果失败：网络异常，请稍后重试";
  }
  return `下载生图结果失败：${e.message}`;
}

function arrayOrSingle(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function normalizeGeneratedImageString(value: string): GeneratedImageItem | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return { url: trimmed };

  const dataUrl = trimmed.match(/^data:image\/[^;]+;base64,(.+)$/i);
  if (dataUrl?.[1]) return { b64_json: dataUrl[1] };

  // 部分 OpenAI-compatible 网关把 base64 直接作为字符串放在 images/data 里。
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 200) {
    return { b64_json: trimmed };
  }
  return null;
}

function normalizeGeneratedImageItem(value: unknown): GeneratedImageItem | null {
  if (typeof value === "string") return normalizeGeneratedImageString(value);
  if (!value || typeof value !== "object") return null;

  const item = value as Record<string, unknown>;
  const b64 =
    typeof item.b64_json === "string"
      ? item.b64_json
      : typeof item.b64 === "string"
        ? item.b64
        : typeof item.base64 === "string"
          ? item.base64
          : undefined;
  const url = typeof item.url === "string" ? item.url : undefined;
  if (b64 || url) return { b64_json: b64, url };

  // 兼容 Responses 风格或网关包装：{ result: "base64" } / { image: "url" }。
  for (const key of ["result", "image", "content"] as const) {
    const nested = normalizeGeneratedImageItem(item[key]);
    if (nested) return nested;
  }
  return null;
}

function getFirstGeneratedImage(data: unknown): GeneratedImageItem {
  if (!data || typeof data !== "object") {
    throw new Error("生图失败：上游返回格式无效");
  }
  const body = data as Record<string, unknown>;
  const candidates = [
    ...arrayOrSingle(body.data),
    ...arrayOrSingle(body.images),
    ...arrayOrSingle(body.image),
    ...arrayOrSingle(body.output),
    body,
  ];

  for (const candidate of candidates) {
    const item = normalizeGeneratedImageItem(candidate);
    if (item) return item;
  }

  const keys = Object.keys(body).slice(0, 8).join("、") || "空";
  throw new Error(`生图失败：上游未返回图片（响应字段：${keys}）`);
}

export async function getImageModelConfig() {
  const rows = await db
    .select({ model: schema.models, provider: schema.providers })
    .from(schema.models)
    .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
    .where(eq(schema.models.enabled, true));
  const found = rows.find((r) =>
    (r.model.capabilities as string[]).includes("image-generation")
  );
  if (!found) throw new Error("未配置图像生成模型");
  if (!found.provider.apiKeyEncrypted)
    throw new Error(`供应商 ${found.provider.name} 未配置 API Key`);
  return {
    record: found.model,
    apiKey: decryptSecret(found.provider.apiKeyEncrypted),
    baseURL: getProviderBaseURL(found.provider) ?? "https://api.openai.com/v1",
  };
}

export function buildImageTools(
  userId: string,
  onImage: (url: string) => void,
  origin?: string
): ToolSet {
  return {
    generate_image: tool({
      description:
        "生成图片。当用户要求画图、生成图片、设计图、画 XX 时，直接调用此工具，不要只给文字描述或 prompt。调用前自行把用户的中文需求扩写为详细的英文 prompt 作为参数传入。",
      inputSchema: z.object({
        prompt: z.string().describe("详细的英文图片描述（由你根据用户需求扩写）"),
        size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).optional(),
      }),
      execute: async ({ prompt, size }) => {
        const imgConfig = await getImageGenConfig();
        const { apiKey, baseURL, model, record } = imgConfig;
        if (!record) throw new Error("管理员尚未配置图像计费模型");
        await assertModelAccess(userId, record);
        const resource = modelResource(record);
        const pricePerImage = Math.max(0, record.pricePerImage ?? 30);
        const reservation =
          pricePerImage > 0
            ? await beginAtomicSpend(
                userId,
                pricePerImage,
                "image",
                resource.name
              )
            : null;

        // 网关偶发返回空 200/5xx，封装请求 + 重试一次；超时不重试，避免用户等到数分钟后才看到失败。
        const doGenerate = async () => {
          const res = await fetch(`${baseURL}/images/generations`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              prompt,
              size: size ?? "1024x1024",
              n: 1,
            }),
            signal: AbortSignal.timeout(120_000),
          }).catch((e) => {
            if (isTimeoutError(e)) {
              // 超时通常表示本次生成已耗尽等待窗口；不再整轮重试，避免用户等到 4 分钟才看到结果。
              throw new Error("生图请求超时，请稍后重试");
            }
            if (isRetryableImageError(e)) {
              throw new RetryableImageError("生图请求网络异常，请稍后重试");
            }
            throw e;
          });
          if (!res.ok) {
            const message = await formatUpstreamError(res, "生图失败");
            if (res.status === 408 || res.status === 504) {
              throw new Error("生图请求超时，请稍后重试");
            }
            if (
              res.status === 409 ||
              res.status === 425 ||
              res.status === 429 ||
              res.status >= 500
            ) {
              throw new RetryableImageError(message);
            }
            throw new Error(message);
          }
          // 网关偶发返回 200 但空响应体（application/octet-stream, 0 bytes）
          const text = await res.text();
          if (!text.trim()) {
            throw new RetryableImageError("生图上游返回空响应（网关异常），请稍后重试");
          }
          try {
            return JSON.parse(text) as unknown;
          } catch {
            throw new RetryableImageError(
              `生图上游返回了非 JSON 响应（${text.slice(0, 100)}），请稍后重试`
            );
          }
        };

        try {
          let data: unknown;
          try {
            data = await doGenerate();
          } catch (e) {
            if (!isRetryableImageError(e)) throw e;
            // 仅对网络/限流/5xx/网关空响应等瞬时错误重试一次。
            data = await doGenerate();
          }
          const item = getFirstGeneratedImage(data);
          if (item.b64_json) {
            const url = await saveGeneratedImage(userId, item.b64_json);
            if (reservation) {
              await commitAtomicSpend(userId, reservation, {
                capability: "image",
                resource,
                units: { imageCount: 1 },
                costCents: pricePerImage,
              });
            }
            onImage(url);
            return { images: [url], text: "图片已生成并展示给用户" };
          }
          const url = item.url
            ? await saveRemoteGeneratedImage(userId, item.url)
            : "";
          // I7: 仅在确实拿到图片 URL 时才回调与计费，避免空结果也扣费
          if (!url) throw new Error("生图失败：上游未返回图片 URL");
          if (reservation) {
            await commitAtomicSpend(userId, reservation, {
              capability: "image",
              resource,
              units: { imageCount: 1 },
              costCents: pricePerImage,
            });
          }
          onImage(url);
          return { images: [url], text: "图片已生成并展示给用户" };
        } catch (e) {
          if (reservation) {
            await abortAtomicSpend(userId, reservation, "image").catch((err) =>
              console.error("[billing] 生图失败退款异常", err)
            );
          }
          throw e;
        }
      },
    }),
    edit_image: tool({
      description:
        "编辑已有图片。当用户要求修改、修图、P图、换背景、去背景、移除元素、改变风格或调整刚才/已上传的图片时调用。必须提供要编辑的图片 URL；如果上下文里有生成或上传的图片，优先使用最近相关图片。",
      inputSchema: z.object({
        imageUrl: z.string().describe("要编辑的图片 URL，通常来自最近上传或生成的图片"),
        prompt: z.string().describe("详细说明要如何修改图片"),
        size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).optional(),
      }),
      execute: async ({ imageUrl, prompt, size }) => {
        const imgConfig = await getImageGenConfig();
        const { apiKey, baseURL, model, record } = imgConfig;
        if (!record) throw new Error("管理员尚未配置图像计费模型");
        await assertModelAccess(userId, record);
        const resource = modelResource(record);
        const pricePerImage = Math.max(0, record.pricePerImage ?? 30);
        const reservation =
          pricePerImage > 0
            ? await beginAtomicSpend(
                userId,
                pricePerImage,
                "image-edit",
                resource.name
              )
            : null;

        try {
          const image = await imageUrlToEditBlob(imageUrl, origin);
          const form = new FormData();
          form.append("model", model);
          form.append("prompt", prompt);
          form.append("n", "1");
          form.append("size", size ?? "1024x1024");
          form.append("image", image.blob, image.filename);

          let res: Response;
          try {
            res = await fetchImageEdit(baseURL, apiKey, form);
          } catch (e) {
            if (!isRetryableImageError(e)) throw e;
            res = await fetchImageEdit(baseURL, apiKey, form);
          }
          if (!res.ok) throw new Error(await formatUpstreamError(res, "图片编辑失败"));

          const text = await res.text();
          if (!text.trim()) throw new Error("图片编辑失败：上游返回空响应");
          let data: unknown;
          try {
            data = JSON.parse(text) as unknown;
          } catch {
            throw new Error("图片编辑失败：上游返回了非 JSON 响应");
          }
          const item = getFirstGeneratedImage(data);
          let url = "";
          if (item.b64_json) {
            url = await saveGeneratedImage(userId, item.b64_json);
          } else if (item.url) {
            url = await saveRemoteGeneratedImage(userId, item.url);
          }
          if (!url) throw new Error("图片编辑失败：上游未返回图片 URL");

          if (reservation) {
            await commitAtomicSpend(userId, reservation, {
              capability: "image-edit",
              resource,
              units: { imageCount: 1 },
              costCents: pricePerImage,
            });
          }
          onImage(url);
          return { images: [url], text: "图片已编辑并展示给用户" };
        } catch (e) {
          if (reservation) {
            await abortAtomicSpend(userId, reservation, "image-edit").catch(
              (err) => console.error("[billing] 图片编辑失败退款异常", err)
            );
          }
          throw e;
        }
      },
    }),
  };
}

export async function saveGeneratedImage(
  userId: string,
  b64: string,
  kind: "generated" | "edited" = "generated",
  id?: string
): Promise<string> {
  const { persistMedia } = await import("@/lib/server/media");
  const asset = await persistMedia({
    ownerId: userId,
    bytes: Buffer.from(b64, "base64"),
    mimeType: "image/png",
    name: `${kind}.png`,
    kind,
    ext: ".png",
    sourceTool: kind === "edited" ? "edit_image" : "generate_image",
    id,
  });
  return asset.url;
}

// ---------- 辅助识图 ----------

export function buildVisionTool(userId: string, origin?: string): ToolSet {
  return {
    analyze_image: tool({
      description: "分析一张图片的内容（当你自己无法直接看图时使用）。",
      inputSchema: z.object({
        imageUrl: z.string().describe("图片 URL"),
        question: z.string().optional().describe("关于图片想了解什么"),
      }),
      execute: async ({ imageUrl, question }) => {
        if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
          await assertSafeUrl(imageUrl);
        }

        // 直接读 Buffer，避免 4MB+ 图先转 data URL 再在工具调用栈里正则/序列化
        const { resolveImageBuffer } = await import(
          "@/lib/server/llm/image-source"
        );
        const { buffer, mimeType: mime } = await resolveImageBuffer(
          imageUrl,
          origin
        );

        const { describeImageFromBuffer } = await import(
          "@/lib/server/vision-describe"
        );
        let text: string;
        try {
          text = await describeImageFromBuffer(
            userId,
            buffer,
            mime,
            question ?? "详细描述这张图片的内容。"
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : "未知错误";
          if (/Maximum call stack size exceeded/i.test(message)) {
            throw new Error(
              "辅助识图模型处理这张图片失败，请压缩图片或切换支持视觉输入的辅助识图模型。"
            );
          }
          throw e;
        }
        return { text };
      },
    }),
  };
}

// ---------- 表格深度分析 ----------

const SPREADSHEET_EXTS = new Set([".xlsx", ".xls", ".csv", ".tsv"]);

export function buildSpreadsheetTools(userId: string): ToolSet {
  return {
    analyze_spreadsheet: tool({
      description:
        "深度分析用户上传的 Excel/CSV/TSV 表格：返回各 sheet 的列名、行数、数值列统计与样例行。复杂聚合、筛选、对比请优先调用本工具；简单算术再用 run_code。不要假装能 import pandas 或访问文件系统。",
      inputSchema: z.object({
        attachmentId: z
          .string()
          .optional()
          .describe("聊天附件 id（优先）"),
        mediaAssetId: z
          .string()
          .optional()
          .describe("媒体资产 id（与 attachmentId 通常相同）"),
        documentId: z
          .string()
          .optional()
          .describe("知识库文档 id"),
      }),
      execute: async ({ attachmentId, mediaAssetId, documentId }) => {
        if (!attachmentId && !mediaAssetId && !documentId) {
          throw new Error("请提供 attachmentId、mediaAssetId 或 documentId 之一");
        }
        return withAtomicBilling(
          userId,
          {
            capability: "spreadsheet-analysis",
            resource: engineResource("spreadsheet-analysis"),
            units: { requestCount: 1 },
          },
          async () => {
            const loaded = await loadOwnedSpreadsheetBuffer(userId, {
              attachmentId,
              mediaAssetId,
              documentId,
            });
            const { analyzeSpreadsheetBuffer } = await import(
              "@/lib/server/document-extract"
            );
            const result = await analyzeSpreadsheetBuffer(
              loaded.name,
              loaded.buffer
            );
            return {
              name: loaded.name,
              sheets: result.sheets,
              text: result.text.slice(0, 12_000),
            };
          }
        );
      },
    }),
  };
}

async function loadOwnedSpreadsheetBuffer(
  userId: string,
  ids: {
    attachmentId?: string;
    mediaAssetId?: string;
    documentId?: string;
  }
): Promise<{ name: string; buffer: Buffer }> {
  const { readFile } = await import("node:fs/promises");
  const pathMod = await import("node:path");

  if (ids.attachmentId || ids.mediaAssetId) {
    const id = ids.attachmentId || ids.mediaAssetId!;
    const { openMediaStream } = await import("@/lib/server/media");
    const media = await openMediaStream(id, userId);
    if (media) {
      assertSpreadsheetName(media.row.name);
      return { name: media.row.name, buffer: media.buffer };
    }
    const [att] = await db
      .select({
        name: schema.attachments.name,
        storagePath: schema.attachments.storagePath,
      })
      .from(schema.attachments)
      .where(
        and(
          eq(schema.attachments.id, id),
          eq(schema.attachments.ownerId, userId)
        )
      )
      .limit(1);
    if (!att) throw new Error("附件不存在或无权访问");
    assertSpreadsheetName(att.name);
    const { localAttachmentPath } = await import("@/lib/server/pptx");
    const filePath = localAttachmentPath(att.storagePath);
    if (!filePath && att.storagePath.startsWith("/api/media/")) {
      const mediaId = att.storagePath.replace(/^\/api\/media\//, "");
      const again = await openMediaStream(mediaId, userId);
      if (again) return { name: att.name, buffer: again.buffer };
    }
    if (!filePath) throw new Error("附件文件不可读取");
    return { name: att.name, buffer: await readFile(filePath) };
  }

  if (ids.documentId) {
    const [doc] = await db
      .select({
        id: schema.kbDocuments.id,
        name: schema.kbDocuments.name,
        storagePath: schema.kbDocuments.storagePath,
        knowledgeBaseId: schema.kbDocuments.knowledgeBaseId,
      })
      .from(schema.kbDocuments)
      .innerJoin(
        schema.knowledgeBases,
        eq(schema.kbDocuments.knowledgeBaseId, schema.knowledgeBases.id)
      )
      .where(
        and(
          eq(schema.kbDocuments.id, ids.documentId),
          eq(schema.knowledgeBases.ownerId, userId)
        )
      )
      .limit(1);
    if (!doc) throw new Error("知识库文档不存在或无权访问");
    assertSpreadsheetName(doc.name);
    if (!doc.storagePath) {
      throw new Error("该知识库文档未保留原文件，请重新上传后再分析");
    }
    if (doc.storagePath.includes("..")) throw new Error("非法存储路径");
    const abs = pathMod.join(process.cwd(), doc.storagePath);
    return { name: doc.name, buffer: await readFile(abs) };
  }

  throw new Error("请提供 attachmentId、mediaAssetId 或 documentId");
}

function assertSpreadsheetName(name: string) {
  const ext = name.includes(".")
    ? name.slice(name.lastIndexOf(".")).toLowerCase()
    : "";
  if (!SPREADSHEET_EXTS.has(ext)) {
    throw new Error("仅支持 .xlsx / .xls / .csv / .tsv");
  }
}

// ---------- Artifacts ----------

const artifactKinds = ["html", "react", "svg", "markdown", "code", "mermaid"] as const;

export function buildArtifactTools(conversationId: string): ToolSet {
  return {
    create_artifact: tool({
      description:
        "为用户创建一个 Artifact（独立展示的内容作品），适用于完整网页、React 组件、SVG 图形、长文档、完整代码文件、Mermaid 图表。内容会在右侧面板中展示，不要再在回复中重复完整内容。",
      inputSchema: z.object({
        title: z.string().describe("作品标题"),
        kind: z.enum(artifactKinds).describe("作品类型"),
        language: z.string().optional().describe("kind=code 时的编程语言"),
        content: z.string().describe("完整内容"),
      }),
      execute: async ({ title, kind, language, content }) => {
        const id = `art-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
        await db.insert(schema.artifacts).values({
          id,
          conversationId,
          title,
          kind,
          language,
          versions: [{ version: 1, content, createdAt: new Date().toISOString() }],
          currentVersion: 1,
        });
        return { artifactId: id, artifactTitle: title, text: `已创建 Artifact「${title}」` };
      },
    }),
    update_artifact: tool({
      description: "更新一个已存在的 Artifact，生成新版本。",
      inputSchema: z.object({
        artifactId: z.string().describe("要更新的 artifact id"),
        title: z.string().trim().min(1).max(120).optional().describe("可选：同步更新作品标题"),
        content: z.string().describe("更新后的完整内容"),
      }),
      execute: async ({ artifactId, title, content }) => {
        // 只允许更新当前会话内的 artifact（防跨会话越权写）
        const scope = and(
          eq(schema.artifacts.id, artifactId),
          eq(schema.artifacts.conversationId, conversationId)
        );
        const [existing] = await db.select().from(schema.artifacts).where(scope);
        if (!existing) throw new Error("Artifact 不存在");
        const nextVersion = existing.currentVersion + 1;
        const nextTitle = title?.trim() || existing.title;
        await db
          .update(schema.artifacts)
          .set({
            title: nextTitle,
            versions: [
              ...existing.versions,
              { version: nextVersion, content, createdAt: new Date().toISOString() },
            ],
            currentVersion: nextVersion,
            updatedAt: new Date(),
          })
          .where(scope);
        return {
          artifactId,
          artifactTitle: nextTitle,
          text: `已更新 Artifact「${nextTitle}」到 v${nextVersion}`,
        };
      },
    }),
  };
}

// ---------- 记忆 ----------

export function buildMemoryTools(
  userId: string,
  conversationId: string,
  projectId?: string | null
): ToolSet {
  return {
    save_memory: tool({
      description:
        "保存关于用户的重要长期信息（偏好、背景、事实），供以后的对话使用。只在用户提到值得长期记住的信息时使用。",
      inputSchema: z.object({
        content: z.string().describe("要记住的内容，一句话概括"),
      }),
      execute: async ({ content }) => {
        const id = `mem-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
        let embedding: number[] | null = null;
        try {
          const { embedText } = await import("./embedding");
          embedding = await embedText(content, { userId });
        } catch {
          // 未配置 embedding 时保存纯文本，检索退化为关键词匹配
        }
        await db.insert(schema.memories).values({
          id,
          ownerId: userId,
          content,
          sourceConversationId: conversationId,
          projectId: projectId ?? null,
          embedding,
        });
        return { text: `已记住：${content}` };
      },
    }),
    search_memory: tool({
      description:
        "检索之前保存的关于用户的长期记忆。不要用于检索用户私有知识库或用户已上传的文档/报告/附件；这些内容应调用 search_knowledge。",
      inputSchema: z.object({
        query: z.string().describe("检索关键词"),
      }),
      execute: async ({ query }) => {
        const results = await searchMemories(userId, query, 5, projectId);
        if (results.length === 0) return { text: "没有找到相关记忆" };
        return { text: results.map((m, i) => `${i + 1}. ${m}`).join("\n") };
      },
    }),
  };
}

export async function searchMemories(
  userId: string,
  query: string,
  limit: number,
  projectId?: string | null
): Promise<string[]> {
  // 项目级记忆：只检索同一项目的 + 全局的（projectId=null）
  const memFilter = projectId
    ? and(
        eq(schema.memories.ownerId, userId),
        or(eq(schema.memories.projectId, projectId), isNull(schema.memories.projectId))
      )
    : and(eq(schema.memories.ownerId, userId), isNull(schema.memories.projectId));
  try {
    const { embedText } = await import("./embedding");
    const queryEmbedding = await embedText(query, { userId });
    const { cosineDistance, desc: descOp, sql: sqlOp } = await import("drizzle-orm");
    const similarity = sqlOp<number>`1 - (${cosineDistance(schema.memories.embedding, queryEmbedding)})`;
    const rows = await db
      .select({ content: schema.memories.content, similarity })
      .from(schema.memories)
      .where(memFilter)
      .orderBy((t) => descOp(t.similarity))
      .limit(limit);
    return rows.filter((r) => r.similarity > 0.3).map((r) => r.content);
  } catch {
    // 无 embedding：关键词退化匹配
    const { ilike, and: andOp } = await import("drizzle-orm");
    const rows = await db
      .select({ content: schema.memories.content })
      .from(schema.memories)
      .where(
        andOp(
          memFilter,
          ilike(schema.memories.content, `%${query.slice(0, 20)}%`)
        )
      )
      .limit(limit);
    return rows.map((r) => r.content);
  }
}

/** 开场注入：取用户最近的记忆拼进系统提示词（项目级隔离） */
export async function loadRecentMemories(
  userId: string,
  limit = 10,
  projectId?: string | null
): Promise<string[]> {
  const { desc: descOp } = await import("drizzle-orm");
  // 项目级记忆：项目内 + 全局（projectId=null）；无项目时只取全局
  const memFilter = projectId
    ? and(
        eq(schema.memories.ownerId, userId),
        or(eq(schema.memories.projectId, projectId), isNull(schema.memories.projectId))
      )
    : and(eq(schema.memories.ownerId, userId), isNull(schema.memories.projectId));
  const rows = await db
    .select({ content: schema.memories.content })
    .from(schema.memories)
    .where(memFilter)
    .orderBy(descOp(schema.memories.updatedAt))
    .limit(limit);
  return rows.map((r) => r.content);
}

// ---------- 知识库检索 ----------

export function buildKnowledgeTool(userId: string, kbIds: string[]): ToolSet {
  return {
    search_knowledge: tool({
      description:
        kbIds.length > 0
          ? "在当前限定的用户私有知识库范围中检索相关内容。用户提到知识库、用户已上传的文档/报告/资料/附件或要求基于私有材料回答时，必须优先调用；回答引用检索结果时注明来源文档。"
          : "在用户的所有私有知识库中检索相关内容。用户提到知识库、用户已上传的文档/报告/资料/附件或要求基于私有材料回答时，必须优先调用；不要用 web_search 或 search_memory 替代；回答引用检索结果时注明来源文档。",
      inputSchema: z.object({
        query: z.string().describe("检索问题或关键词"),
      }),
      execute: async ({ query }) => {
        const { and: andOp, cosineDistance, desc: descOp, inArray, isNotNull, or: orOp, sql: sqlOp } =
          await import("drizzle-orm");
        const normalize = (value: string) => value.trim().toLocaleLowerCase();
        const escapeLikePattern = (value: string) =>
          `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        const stopWords = new Set([
          "the",
          "and",
          "for",
          "with",
          "what",
          "how",
          "use",
          "using",
          "please",
          "回答",
          "必须",
          "包含",
          "使用",
          "只用",
          "挂载",
          "文档",
        ]);
        const addTerm = (terms: Map<string, number>, rawTerm: string, weight: number) => {
          const term = normalize(rawTerm);
          if (!term || stopWords.has(term)) return;
          terms.set(term, Math.max(terms.get(term) ?? 0, weight));
        };
        const collectKeywordTerms = () => {
          const terms = new Map<string, number>();
          query
            .split(/[^\p{L}\p{N}]+/u)
            .map((term) => term.trim())
            .filter((term) => term.length >= 3 && term.length <= 32)
            .forEach((term) => addTerm(terms, term, term.length >= 5 ? 3 : 2));
          for (const match of query.matchAll(/[\p{Script=Han}]{2,}/gu)) {
            const text = match[0];
            if (text.length <= 4) {
              addTerm(terms, text, 2);
              continue;
            }
            for (let size = 2; size <= 3; size += 1) {
              for (let i = 0; i <= text.length - size; i += 1) {
                addTerm(terms, text.slice(i, i + size), size === 3 ? 2 : 1);
              }
            }
          }
          return Array.from(terms, ([term, weight]) => ({ term, weight })).slice(0, 18);
        };
        const keywordTerms = collectKeywordTerms();
        const scoreKeywordHit = (content: string) => {
          const text = normalize(content);
          return keywordTerms.reduce(
            (score, { term, weight }) => score + (text.includes(term) ? weight : 0),
            0
          );
        };
        const scope = andOp(
          ...(kbIds.length > 0 ? [inArray(schema.kbChunks.knowledgeBaseId, kbIds)] : []),
          // 只允许检索当前用户自己的知识库（防 IDOR）
          eq(schema.knowledgeBases.ownerId, userId),
          eq(schema.kbDocuments.status, "ready")
        );
        const keywordRows = async () => {
          if (keywordTerms.length === 0) return [];
          const clauses = keywordTerms.map(({ term }) => {
            const pattern = escapeLikePattern(term);
            return sqlOp`${schema.kbChunks.content} ilike ${pattern} escape '\\'`;
          });
          const keywordScore = sqlOp<number>`(${sqlOp.join(
            keywordTerms.map(({ term, weight }) => {
              const pattern = escapeLikePattern(term);
              return sqlOp`case when ${schema.kbChunks.content} ilike ${pattern} escape '\\' then ${weight} else 0 end`;
            }),
            sqlOp` + `
          )})`;
          const rows = await db
            .select({
              documentId: schema.kbChunks.documentId,
              chunkIndex: schema.kbChunks.chunkIndex,
              content: schema.kbChunks.content,
              documentName: schema.kbDocuments.name,
              keywordScore,
            })
            .from(schema.kbChunks)
            .innerJoin(
              schema.kbDocuments,
              andOp(
                eq(schema.kbChunks.documentId, schema.kbDocuments.id),
                eq(schema.kbChunks.knowledgeBaseId, schema.kbDocuments.knowledgeBaseId)
              )
            )
            .innerJoin(
              schema.knowledgeBases,
              eq(schema.kbChunks.knowledgeBaseId, schema.knowledgeBases.id)
            )
            .where(andOp(scope, orOp(...clauses)))
            .orderBy((t) => [descOp(t.keywordScore), t.documentId, t.chunkIndex])
            .limit(12);
          return rows
            .map((row) => ({
              ...row,
              keywordScore: Number(row.keywordScore) || scoreKeywordHit(row.content),
            }))
            .filter((row) => row.keywordScore >= 2)
            .slice(0, 6)
            .map((row) => ({
              ...row,
              similarity: Math.min(0.99, row.keywordScore / 10),
            }));
        };
        const mergeHits = (
          candidates: Array<{
            documentId: string;
            documentName: string | null;
            chunkIndex: number;
            content: string;
            similarity?: number;
          }>
        ) => {
          const byChunk = new Map<string, (typeof candidates)[number] & { similarity: number }>();
          for (const candidate of candidates) {
            const similarity = typeof candidate.similarity === "number" ? candidate.similarity : 0;
            const key = `${candidate.documentId}:${candidate.chunkIndex}`;
            const existing = byChunk.get(key);
            if (!existing || similarity > existing.similarity) {
              byChunk.set(key, { ...candidate, similarity });
            }
          }
          return Array.from(byChunk.values())
            .sort(
              (a, b) =>
                b.similarity - a.similarity ||
                (a.documentName ?? "").localeCompare(b.documentName ?? "") ||
                a.documentId.localeCompare(b.documentId) ||
                a.chunkIndex - b.chunkIndex
            )
            .slice(0, 6);
        };

        let hits: Array<{
          documentId: string;
          documentName: string | null;
          chunkIndex: number;
          content: string;
          similarity?: number;
        }> = [];
        let queryEmbedding: number[] | null = null;
        try {
          const { embedText } = await import("./embedding");
          const embedding = await embedText(query, { userId });
          if (embedding.length === 1536) {
            queryEmbedding = embedding;
          } else {
            console.warn(
              `知识库 query embedding 维度异常：${embedding.length}，已降级为关键词检索`
            );
          }
        } catch (e) {
          // embedding 不可用时退化为关键词检索。
          console.warn("知识库 query embedding 失败，已降级为关键词检索", e);
        }
        if (queryEmbedding) {
          try {
            const similarity = sqlOp<number>`1 - (${cosineDistance(schema.kbChunks.embedding, queryEmbedding)})`;
            const rows = await db
              .select({
                documentId: schema.kbChunks.documentId,
                chunkIndex: schema.kbChunks.chunkIndex,
                content: schema.kbChunks.content,
                similarity,
                documentName: schema.kbDocuments.name,
              })
              .from(schema.kbChunks)
              .innerJoin(
                schema.kbDocuments,
                andOp(
                  eq(schema.kbChunks.documentId, schema.kbDocuments.id),
                  eq(schema.kbChunks.knowledgeBaseId, schema.kbDocuments.knowledgeBaseId)
                )
              )
              .innerJoin(
                schema.knowledgeBases,
                eq(schema.kbChunks.knowledgeBaseId, schema.knowledgeBases.id)
              )
              .where(andOp(scope, isNotNull(schema.kbChunks.embedding)))
              .orderBy((t) => descOp(t.similarity))
              .limit(6);
            hits = rows.filter((r) => r.similarity > 0.2);
          } catch (e) {
            console.warn("知识库向量检索失败，已降级为关键词检索", e);
          }
        }
        hits = mergeHits([...hits, ...(await keywordRows())]);
        if (hits.length === 0) return { text: "知识库中没有找到相关内容" };

        return {
          chunks: hits.map((r) => ({
            documentId: r.documentId,
            documentName: r.documentName,
            chunkIndex: r.chunkIndex,
            snippet: r.content.slice(0, 300),
            score:
              typeof r.similarity === "number"
                ? Math.round(r.similarity * 100) / 100
                : 0,
          })),
          text: hits
            .map((r, i) => `[${i + 1}] 《${r.documentName}》#${r.chunkIndex}:\n${r.content}`)
            .join("\n\n"),
        };
      },
    }),
  };
}

// ---------- Skill Pack 内部工具 ----------

export function buildSkillPackTools(
  skill: typeof schema.skills.$inferSelect,
  userId: string,
  context?: { conversationId: string; messageId: string; modelId: string }
): ToolSet {
  const tools: ToolSet = {
    list_skill_resources: tool({
      description: "列出当前 Skill Pack 附带的说明、参考材料、模板或资源清单。",
      inputSchema: z.object({}),
      execute: async () => ({
        text: "已列出当前技能资源。",
        resources: listSkillResources(skill),
      }),
    }),
    read_skill_resource: tool({
      description: "读取当前 Skill Pack 的单个资源内容。只能读取当前技能声明的资源。",
      inputSchema: z.object({
        resourceId: z.string().describe("资源 id"),
      }),
      execute: async ({ resourceId }) => {
        const resource = await readSkillResource(skill, resourceId);
        return {
          text: `资源「${resource.name}」：\n${resource.text}`,
          resource,
        };
      },
    }),
    run_skill_script: tool({
      description:
        "运行当前 Skill Pack 审核通过且显式允许的脚本。普通用户技能和未审核技能不能使用。",
      inputSchema: z.object({
        script: z.string().describe("脚本文件名，必须在技能清单中声明"),
        input: z.record(z.string(), z.unknown()).optional().describe("传给脚本的 JSON 输入"),
      }),
      execute: async ({ script, input }) => runSkillScript(skill, script, input ?? {}),
    }),
  };
  if (skill.id === "skill-deep-research") {
    Object.assign(tools, {
      start_deep_research: tool({
        description:
          "启动可刷新恢复的深度调研任务。用户要求深度调研、行业研究、竞品研究、尽调或带引用报告时必须调用；任务会在后台并行运行。",
        inputSchema: z.object({
          query: z.string().min(5).max(4_000).describe("完整研究问题和范围"),
          mode: z.enum(["quick", "deep"]).default("deep"),
        }),
        execute: async ({ query, mode }) => {
          if (!context) throw new Error("当前会话无法创建持久调研任务");
          const { createSkillRun } = await import("@/lib/server/skill-runs");
          const run = await createSkillRun({
            ownerId: userId,
            conversationId: context.conversationId,
            messageId: context.messageId,
            skillId: skill.id,
            kind: "deep-research",
            skillName: skill.name,
            payload: { query, mode, modelId: context.modelId },
          });
          if (!run) throw new Error("深度调研任务创建失败");
          return {
            text: "深度调研已在后台启动，可在任务卡查看并行子任务、来源和最终报告。",
            skillRunId: run.id,
            skillName: skill.name,
          };
        },
      }),
    });
    return tools;
  }
  if (skill.id === "skill-data-analyst") {
    Object.assign(tools, {
      start_data_analysis: tool({
        description:
          "启动可刷新恢复的数据分析任务。用户要求对上传的 CSV/TSV/XLSX/XLS 做完整质量检查、统计、图表或报告时调用；本地数据默认不联网。",
        inputSchema: z.object({
          question: z.string().min(5).max(4_000).describe("分析问题、指标口径和期望交付"),
          attachmentIds: z
            .array(z.string())
            .min(1)
            .max(8)
            .describe("需要分析的用户附件 id"),
          needsExternalData: z
            .boolean()
            .default(false)
            .describe("只有用户明确要求行业基准、公开数据或最新背景时才设为 true"),
        }),
        execute: async ({ question, attachmentIds, needsExternalData }) => {
          if (!context) throw new Error("当前会话无法创建持久数据分析任务");
          const { createSkillRun } = await import("@/lib/server/skill-runs");
          const run = await createSkillRun({
            ownerId: userId,
            conversationId: context.conversationId,
            messageId: context.messageId,
            skillId: skill.id,
            kind: "data-analysis",
            skillName: skill.name,
            payload: {
              question,
              attachmentIds,
              needsExternalData,
              modelId: context.modelId,
            },
          });
          if (!run) throw new Error("数据分析任务创建失败");
          return {
            text: "数据分析已在后台启动，可在任务卡查看数据检查、沙盒分析和最终交付物。",
            skillRunId: run.id,
            skillName: skill.name,
          };
        },
      }),
    });
    return tools;
  }
  if (skill.id === "skill-ppt-studio") {
    Object.assign(tools, {
      start_ppt_studio: tool({
        description:
          "在信息流中打开 PPT 工作室需求卡。用户要求制作或生成 PPT/演示文稿时先调用，让用户填写受众、页数、主题、媒体偏好、语言和输出格式；提交前不会渲染。",
        inputSchema: z.object({
          topic: z.string().min(2).max(200).describe("从用户请求提取的演示主题"),
          audience: z.string().min(1).max(200).optional().describe("用户已明确的目标受众"),
          pageCount: z.number().int().min(3).max(30).optional().describe("用户已明确的页数"),
          mediaPreference: z
            .enum(["auto", "image-heavy", "text-first", "no-media"])
            .optional()
            .describe("用户已明确的媒体偏好"),
          language: z.enum(["zh", "en"]).optional().describe("用户已明确的输出语言"),
          outputFormat: z
            .enum(["pptx", "html"])
            .optional()
            .describe("用户已明确的输出格式"),
        }),
        execute: async ({
          topic,
          audience,
          pageCount,
          mediaPreference,
          language,
          outputFormat,
        }) => {
          if (!context) throw new Error("当前会话无法创建 PPT 工作室任务");
          const { createSkillRun } = await import("@/lib/server/skill-runs");
          const run = await createSkillRun({
            ownerId: userId,
            conversationId: context.conversationId,
            messageId: context.messageId,
            skillId: skill.id,
            kind: "ppt-studio",
            skillName: skill.name,
            status: "waiting_input",
            stage: "等待填写 PPT 需求",
            payload: {
              topic,
              audience,
              pageCount,
              mediaPreference,
              language,
              outputFormat,
              modelId: context.modelId,
            },
          });
          if (!run) throw new Error("PPT 工作室任务创建失败");
          return {
            text: "PPT 工作室已打开，请在信息流卡片中填写需求；提交后才会开始生成。",
            skillRunId: run.id,
            skillName: skill.name,
          };
        },
      }),
    });
    return tools;
  }
  if (skill.id !== "skill-dashi-ppt") return tools;

  Object.assign(tools, {
    dashi_query_layouts: tool({
      description:
        "按主题和页面角色查询 Dashi PPT 候选版式。生成前必须先查询；需要图片槽时设置 needsMedia。",
      inputSchema: z.object({
        theme: z
          .enum([
            "theme01",
            "theme02",
            "theme03",
            "theme04",
            "theme05",
            "theme06",
            "theme07",
            "theme08",
            "theme09",
            "theme10",
            "theme11",
            "theme12",
          ])
          .describe("Dashi PPT 主题"),
        role: z.string().min(1).max(40).describe("页面角色，如 cover、agenda、metrics、comparison、timeline、closing"),
        limit: z.number().int().min(1).max(12).optional(),
        needsMedia: z.boolean().optional().describe("是否只查包含图片或视频槽的版式"),
      }),
      execute: async (input) => ({
        text: "已查询 Dashi PPT 候选版式。",
        result: await queryDashiLayouts(skill, input),
      }),
    }),
    dashi_inspect_layouts: tool({
      description:
        "检查 Dashi PPT 版式可填写字段、文案长度、数组形状和媒体槽。写入 props 前必须检查复杂版式。",
      inputSchema: z.object({
        layouts: z
          .array(z.string().regex(/^theme\d{2}_page\d{3}$/u))
          .min(1)
          .max(12),
      }),
      execute: async ({ layouts }) => ({
        text: "已读取 Dashi PPT 版式字段契约。",
        result: await inspectDashiLayouts(skill, layouts),
      }),
    }),
    dashi_render_deck: tool({
      description:
        "根据已查询并检查的唯一版式与 props 渲染 Dashi PPT，完成校验后导出可下载 PPTX 或浏览器可编辑 HTML 离线包。",
      inputSchema: z.object({
        format: z.enum(["pptx", "html"]).default("pptx"),
        goal: z.object({
          title: z.string().min(1).max(120),
          goal: z.string().min(1).max(1000),
          audience: z.string().min(1).max(300),
          owner: z.string().max(200).optional(),
          randomSeed: z.string().min(3).max(120),
          pageCount: z.number().int().min(1).max(30).optional(),
          themePack: z.enum([
            "theme01",
            "theme02",
            "theme03",
            "theme04",
            "theme05",
            "theme06",
            "theme07",
            "theme08",
            "theme09",
            "theme10",
            "theme11",
            "theme12",
          ]),
          language: z.enum(["zh", "en"]).optional(),
          slides: z
            .array(
              z.object({
                layout: z.string().regex(/^theme\d{2}_page\d{3}$/u),
                props: z.record(z.string(), z.unknown()),
              })
            )
            .min(1)
            .max(30),
        }),
      }),
      execute: async ({ goal, format }) => renderDashiDeck(skill, userId, goal, format),
    }),
  });
  return tools;
}

// ---------- PPTX ----------

export function buildPptxTools(userId: string): ToolSet {
  return {
    pptx_extract_text: tool({
      description:
        "从用户上传的 .pptx 附件中提取每页文字、备注和基础结构。用户要求总结/逐页分析 PPT 时优先使用。",
      inputSchema: z.object({
        attachmentId: z.string().describe("用户上传的 PPTX 附件 id"),
      }),
      execute: async ({ attachmentId }) => {
        const att = await loadOwnedPptxAttachment(userId, attachmentId);
        const result = await extractPptxTextFromBuffer(att.buffer);
        return {
          text: result.text.slice(0, 12_000),
          slideCount: result.slideCount,
          slides: result.slides.slice(0, 60),
        };
      },
    }),
    pptx_analyze_template: tool({
      description:
        "轻量分析用户上传的 .pptx 模板页数、文本块和备注情况，用于基于模板生成新版 PPT。",
      inputSchema: z.object({
        attachmentId: z.string().describe("用户上传的 PPTX 模板附件 id"),
      }),
      execute: async ({ attachmentId }) => {
        const att = await loadOwnedPptxAttachment(userId, attachmentId);
        const result = await extractPptxTextFromBuffer(att.buffer);
        const template = await analyzePptxTemplate(att.buffer);
        return {
          text: `${template.text}\n\n模板文字摘要：\n${result.text.slice(0, 6_000)}`,
          slideCount: template.slideCount,
          layouts: template.layouts,
        };
      },
    }),
    pptx_create_deck: tool({
      description:
        "根据结构化大纲生成可下载 .pptx 文件。适用于从零创建 PPT 或基于模板分析后生成新版。",
      inputSchema: z.object({
        title: z.string().min(1).max(120).describe("演示文稿标题"),
        slides: z
          .array(
            z.object({
              title: z.string().min(1).max(160),
              bullets: z.array(z.string().max(500)).optional(),
              body: z.string().max(2000).optional(),
              notes: z.string().max(3000).optional(),
            })
          )
          .min(1)
          .max(80)
          .describe("幻灯片数组"),
      }),
      execute: async ({ title, slides }) => {
        const attachment = await createPptxDeck({ ownerId: userId, title, slides });
        return {
          text: `已生成 PPT「${attachment.name}」，共 ${attachment.slideCount} 页，可下载。`,
          attachments: [attachment],
        };
      },
    }),
  };
}

async function loadOwnedPptxAttachment(userId: string, attachmentId: string) {
  const [att] = await db
    .select({
      id: schema.attachments.id,
      name: schema.attachments.name,
      mimeType: schema.attachments.mimeType,
      storagePath: schema.attachments.storagePath,
    })
    .from(schema.attachments)
    .where(and(eq(schema.attachments.id, attachmentId), eq(schema.attachments.ownerId, userId)))
    .limit(1);
  if (!att) throw new Error("PPTX 附件不存在或无权访问");
  if (!att.name.toLowerCase().endsWith(".pptx")) {
    throw new Error("请选择 .pptx 附件");
  }
  // 新上传附件存放在私有 media_assets，attachments.storagePath 只是鉴权 URL；
  // 生成的旧式 PPT 则仍可能落在 data/uploads。两种路径都在完成所有权校验后读取。
  const media = await openMediaStream(att.id, userId);
  if (media) return { ...att, buffer: media.buffer };

  const filePath = localAttachmentPath(att.storagePath);
  if (!filePath) throw new Error("附件路径不可读取");
  const { readFile } = await import("node:fs/promises");
  return { ...att, buffer: await readFile(filePath) };
}

// ---------- MCP ----------

export async function buildMcpTools(
  userId: string,
  enabledUserServerIds: string[]
): Promise<{
  tools: ToolSet;
  mountedServers: Array<{
    id: string;
    name: string;
    scope: "global" | "user";
    toolNames: string[];
  }>;
  close: () => Promise<void>;
}> {
  const servers = await db
    .select()
    .from(schema.mcpServers)
    .where(eq(schema.mcpServers.enabled, true));

  const prefs = await db
    .select()
    .from(schema.userMcpPreferences)
    .where(eq(schema.userMcpPreferences.userId, userId));
  const prefByServer = new Map(prefs.map((p) => [p.serverId, p.enabled]));
  const selected = new Set(enabledUserServerIds);
  const hasExplicitSelection = selected.size > 0;

  const active = servers.filter((s) => {
    const prefEnabled = prefByServer.get(s.id);
    if (s.scope === "user") {
      if (s.ownerId !== userId) return false;
      if (selected.has(s.id)) return true;
      // 空选择是“默认全部”；用户点选某一个后，本轮只挂载该个人服务器。
      return !hasExplicitSelection && prefEnabled !== false;
    }
    // 全局 MCP 由管理员统一启停，对所有用户自动挂载。
    return true;
  });

  const clients: Awaited<ReturnType<typeof createMCPClient>>[] = [];
  const tools: ToolSet = {};
  const mountedServers: Array<{
    id: string;
    name: string;
    scope: "global" | "user";
    toolNames: string[];
  }> = [];

  const timeout = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([
      p,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("MCP 连接超时")), ms)
      ),
    ]);

  // 多个远程 MCP 并行握手，避免全局自动挂载后逐个累加连接延迟。
  const connections = await Promise.all(
    active.map(async (server) => {
      let client: Awaited<ReturnType<typeof createMCPClient>> | null = null;
      try {
        // SSRF 防护：禁止指向内网/元数据地址
        const { assertSafeUrl } = await import("@/lib/server/net-guard");
        await assertSafeUrl(server.url);
        const headers = server.headersEncrypted
          ? (JSON.parse(decryptSecret(server.headersEncrypted)) as Record<string, string>)
          : undefined;
        // 单服务器 10s 超时，防止慢/挂的 MCP 拖死整个聊天请求
        client = await timeout(
          createMCPClient({
            // I6: 按 server.transport 选择传输（'streamable-http' → 'http'）
            transport: {
              type: server.transport === "streamable-http" ? "http" : "sse",
              url: server.url,
              headers,
            },
          }),
          10_000
        );
        const serverTools = (await timeout(client.tools(), 10_000)) as ToolSet;
        return { server, client, serverTools };
      } catch {
        await client?.close().catch(() => {});
        return null;
      }
    })
  );

  for (const connection of connections) {
    if (!connection) continue;
    const { server, client, serverTools } = connection;
    clients.push(client);
    const prefix = server.name.replace(/\W+/g, "_").replace(/^_+|_+$/g, "");
    const toolNames: string[] = [];
    for (const [name, tool] of Object.entries(serverTools)) {
      const exposedName = `${prefix}_${name}`;
      tools[exposedName] = tool;
      toolNames.push(exposedName);
    }
    mountedServers.push({
      id: server.id,
      name: server.name,
      scope: server.scope,
      toolNames,
    });
  }

  return {
    tools,
    mountedServers,
    close: async () => {
      await Promise.allSettled(clients.map((c) => c.close()));
    },
  };
}
