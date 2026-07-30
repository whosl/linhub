import http from "node:http";

const listenPort = Number(process.env.PORT || 3002);
const upstreamPort = Number(process.env.UPSTREAM_PORT || 3000);
const dropAfterBytes = Number(process.env.DROP_AFTER_BYTES || 768);
let shouldDropNextChatPost = true;

const server = http.createServer((request, response) => {
  const headers = { ...request.headers, host: `127.0.0.1:${upstreamPort}` };
  delete headers.connection;
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: upstreamPort,
      method: request.method,
      path: request.url,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      const dropThisResponse =
        shouldDropNextChatPost &&
        request.method === "POST" &&
        request.url?.startsWith("/api/chat");
      let bytes = 0;

      upstreamResponse.on("data", (chunk) => {
        bytes += chunk.length;
        if (!response.destroyed) response.write(chunk);
        if (dropThisResponse && bytes >= dropAfterBytes && !response.destroyed) {
          shouldDropNextChatPost = false;
          response.destroy(new Error("Android E2E intentional stream drop"));
          process.stdout.write(`dropped chat response after ${bytes} bytes\n`);
        }
      });
      upstreamResponse.on("end", () => {
        if (!response.destroyed) response.end();
      });
      upstreamResponse.on("error", (error) => {
        if (!response.destroyed) response.destroy(error);
      });
    },
  );

  upstream.on("error", (error) => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain" });
    if (!response.destroyed) response.end(error.message);
  });
  request.pipe(upstream);
});

server.listen(listenPort, "127.0.0.1", () => {
  process.stdout.write(
    `chat drop proxy listening on 127.0.0.1:${listenPort}, upstream ${upstreamPort}\n`,
  );
});
