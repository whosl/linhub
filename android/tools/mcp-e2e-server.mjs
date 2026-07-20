import { createServer } from "node:http";

const port = Number(process.env.LINHUB_MCP_E2E_PORT || 43121);
const state = {
  requests: 0,
  lastSecret: null,
  history: [],
};

function json(response, status, value, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("请求体超过 1MB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function responseFor(message) {
  if (!message || typeof message !== "object" || !("id" in message)) return null;
  switch (message.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion || "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "linhub-android-e2e", version: "1.0.0" },
          instructions: "用于 LinHub Android MCP 设备闭环测试。",
        },
      };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [
            {
              name: "echo_android_e2e",
              description: "回显 Android MCP E2E 输入",
              inputSchema: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
                additionalProperties: false,
              },
            },
            {
              name: "device_status_android_e2e",
              description: "返回 Android MCP E2E 测试状态",
              inputSchema: { type: "object", properties: {}, additionalProperties: false },
            },
          ],
        },
      };
    case "ping":
      return { jsonrpc: "2.0", id: message.id, result: {} };
    case "tools/call": {
      const name = message.params?.name;
      if (name === "echo_android_e2e") {
        const text = String(message.params?.arguments?.text ?? "");
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [{ type: "text", text: `ANDROID_MCP_ECHO:${text}` }],
            structuredContent: { echoed: text, status: "ANDROID_MCP_ECHO_OK" },
            isError: false,
          },
        };
      }
      if (name === "device_status_android_e2e") {
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [{ type: "text", text: "ANDROID_MCP_STATUS_OK_731" }],
            structuredContent: { status: "ANDROID_MCP_STATUS_OK_731" },
            isError: false,
          },
        };
      }
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32602, message: `Unknown tool: ${name}` },
      };
    }
    default:
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` },
      };
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (request.method === "GET" && url.pathname === "/state") {
    json(response, 200, state);
    return;
  }
  if (url.pathname !== "/mcp") {
    json(response, 404, { error: "not found" });
    return;
  }
  if (request.method === "GET") {
    response.writeHead(405, { allow: "POST, DELETE" });
    response.end();
    return;
  }
  if (request.method === "DELETE") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST, DELETE" });
    response.end();
    return;
  }

  try {
    const message = await readJson(request);
    const secret = request.headers["x-linhub-secret"];
    state.requests += 1;
    state.lastSecret = typeof secret === "string" ? secret : null;
    state.history.push({
      method: Array.isArray(message) ? "batch" : message.method || "unknown",
      secret: state.lastSecret,
    });
    state.history = state.history.slice(-32);

    const messages = Array.isArray(message) ? message : [message];
    const responses = messages.map(responseFor).filter(Boolean);
    if (responses.length === 0) {
      response.writeHead(202);
      response.end();
      return;
    }
    json(response, 200, Array.isArray(message) ? responses : responses[0]);
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`LinHub MCP E2E server: http://127.0.0.1:${port}/mcp\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
