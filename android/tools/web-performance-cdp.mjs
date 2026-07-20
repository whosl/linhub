#!/usr/bin/env node

const DEBUG_ENDPOINT = process.env.CHROME_DEBUG_ENDPOINT ?? "http://127.0.0.1:9222";
const TARGET_URL = process.env.LINHUB_WEB_URL ?? "http://127.0.0.1:3001/";
const ITERATIONS = Number.parseInt(process.env.ITERATIONS ?? "10", 10);
const TIMEOUT_MS = 20_000;

if (!Number.isInteger(ITERATIONS) || ITERATIONS < 1 || ITERATIONS > 50) {
  throw new Error("ITERATIONS 必须是 1..50 的整数");
}

const pages = await fetch(`${DEBUG_ENDPOINT}/json`).then((response) => response.json());
const expectedUrl = new URL(TARGET_URL);
const target = pages.find((page) => {
  if (page.type !== "page") return false;
  const current = new URL(page.url);
  return current.origin === expectedUrl.origin && current.pathname === expectedUrl.pathname;
});
if (!target?.webSocketDebuggerUrl) {
  throw new Error(`没有找到 ${TARGET_URL} 对应的 Chrome 页面`);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("连接 Chrome DevTools 超时")), TIMEOUT_MS);
  socket.addEventListener("open", () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
  socket.addEventListener("error", () => {
    clearTimeout(timer);
    reject(new Error("连接 Chrome DevTools 失败"));
  }, { once: true });
});

let sequence = 0;
const pending = new Map();
const eventWaiters = new Map();

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.id != null) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
    return;
  }
  const waiters = eventWaiters.get(message.method);
  if (!waiters?.length) return;
  eventWaiters.delete(message.method);
  waiters.forEach((waiter) => waiter.resolve(message.params));
});

function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} 超时`));
    }, TIMEOUT_MS);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function waitForEvent(method) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const remaining = eventWaiters.get(method)?.filter((item) => item.resolve !== wrappedResolve);
      if (remaining?.length) eventWaiters.set(method, remaining);
      else eventWaiters.delete(method);
      reject(new Error(`等待 ${method} 超时`));
    }, TIMEOUT_MS);
    const wrappedResolve = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    eventWaiters.set(method, [...(eventWaiters.get(method) ?? []), { resolve: wrappedResolve }]);
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

async function waitUntilInteractive() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await evaluate(`(() => {
      const composer = document.querySelector('textarea');
      const text = document.body?.innerText ?? '';
      return document.readyState === 'complete' && !!composer &&
        text.includes('LinHub 可能会出错') && !composer.disabled;
    })()`);
    if (ready) {
      return evaluate(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now()))))",
        true,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("等待聊天首页可交互超时");
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

await command("Page.enable");
await command("Runtime.enable");
await command("Network.enable");
await command("Page.bringToFront");
await command("Network.setCacheDisabled", { cacheDisabled: true });

const samples = [];
for (let index = 0; index < ITERATIONS; index += 1) {
  await command("Network.clearBrowserCache");
  const loadEvent = waitForEvent("Page.loadEventFired");
  const separator = TARGET_URL.includes("?") ? "&" : "?";
  await command("Page.navigate", {
    url: `${TARGET_URL}${separator}perfRun=${Date.now()}-${index}`,
  });
  await loadEvent;
  const interactive = await waitUntilInteractive();
  const navigation = await evaluate(
    "performance.getEntriesByType('navigation')[0]?.toJSON() ?? null",
  );
  if (!navigation) throw new Error("页面没有 Navigation Timing 数据");
  samples.push({
    run: index + 1,
    responseStartMs: navigation.responseStart,
    domInteractiveMs: navigation.domInteractive,
    loadEventEndMs: navigation.loadEventEnd,
    interactivePaintedMs: interactive,
    transferSize: navigation.transferSize,
  });
}

socket.close();
const metrics = ["responseStartMs", "domInteractiveMs", "loadEventEndMs", "interactivePaintedMs"];
const summary = Object.fromEntries(metrics.map((metric) => {
  const values = samples.map((sample) => sample[metric]);
  return [metric, {
    min: Math.min(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  }];
}));

console.log(JSON.stringify({ target: TARGET_URL, cacheDisabled: true, samples, summary }, null, 2));
