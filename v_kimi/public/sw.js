/* LinHub Service Worker — 仅缓存独立离线页，不缓存 HTML 壳、API 或构建资源。 */
const CACHE = "linhub-offline-v2";
const OWNED_CACHE_PREFIXES = ["linhub-shell-", "linhub-offline-"];
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== CACHE &&
                OWNED_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
            )
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // 业务页面、API 和带哈希的 Next.js 资源全部交给浏览器/CDN；
  // 仅在顶层导航真正断网时返回不引用任何构建 chunk 的离线页。
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((hit) => hit ?? Response.error())
    )
  );
});
