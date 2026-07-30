#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const DEBUG_ENDPOINT = process.env.CHROME_DEBUG_ENDPOINT ?? "http://127.0.0.1:9222";
const TARGET_URL = process.env.LINHUB_CHAT_URL ??
  "http://127.0.0.1:3001/chat/perf-web-native-1000";
const DEVICE = process.env.DEVICE ?? "emulator-5554";
const RUNS = Number.parseInt(process.env.RUNS ?? "5", 10);
const TIMEOUT_MS = 20_000;

if (!Number.isInteger(RUNS) || RUNS < 1 || RUNS > 20) {
  throw new Error("RUNS 必须是 1..20 的整数");
}

const pages = await fetch(`${DEBUG_ENDPOINT}/json`).then((response) => response.json());
const expectedUrl = new URL(TARGET_URL);
const target = pages.find((page) => {
  if (page.type !== "page") return false;
  const current = new URL(page.url);
  return current.origin === expectedUrl.origin && current.pathname === expectedUrl.pathname;
});
if (!target?.webSocketDebuggerUrl) throw new Error(`没有找到 ${TARGET_URL} 对应的 Chrome 页面`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("连接 Chrome DevTools 超时")), TIMEOUT_MS);
  socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("连接失败")); }, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.id == null) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} 超时`));
    }, TIMEOUT_MS);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "页面脚本执行失败");
  return result.result.value;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(values) {
  return {
    frames: values.length,
    min: Math.min(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
    over20ms: values.filter((value) => value > 20).length,
    over34ms: values.filter((value) => value > 34).length,
  };
}

await command("Runtime.enable");
await command("Page.bringToFront");
const scroller = await evaluate(`(() => {
  const candidates = [...document.querySelectorAll('*')].filter((element) => {
    const style = getComputedStyle(element);
    return element.scrollHeight > element.clientHeight * 2 &&
      ['auto', 'scroll'].includes(style.overflowY);
  }).sort((a, b) => b.clientHeight - a.clientHeight);
  const element = candidates[0];
  if (!element) return null;
  window.__linhubPerfScroller = element;
  return {
    tag: element.tagName,
    className: element.className,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  };
})()`);
if (!scroller) throw new Error("没有找到长会话滚动容器");

const runResults = [];
for (let run = 1; run <= RUNS; run += 1) {
  await evaluate(`(() => {
    const scroller = window.__linhubPerfScroller;
    scroller.scrollTop = scroller.scrollHeight;
    window.__linhubFrameIntervals = [];
    window.__linhubFrameRunning = true;
    let previous;
    const tick = (timestamp) => {
      if (!window.__linhubFrameRunning) return;
      if (previous != null) window.__linhubFrameIntervals.push(timestamp - previous);
      previous = timestamp;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 80));

  for (let index = 0; index < 4; index += 1) {
    execFileSync("adb", ["-s", DEVICE, "shell", "input", "swipe", "540", "800", "540", "1850", "300"]);
  }
  for (let index = 0; index < 4; index += 1) {
    execFileSync("adb", ["-s", DEVICE, "shell", "input", "swipe", "540", "1850", "540", "800", "300"]);
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
  const intervals = await evaluate(`(() => {
    window.__linhubFrameRunning = false;
    return window.__linhubFrameIntervals.filter(value => value > 1 && value < 1000);
  })()`);
  runResults.push({ run, ...summarize(intervals) });
}

socket.close();
console.log(JSON.stringify({
  target: TARGET_URL,
  device: DEVICE,
  scroller,
  runs: runResults,
  note: "rAF 间隔统计；over20ms/over34ms 分别表示超过约一帧和两帧预算。",
}, null, 2));
