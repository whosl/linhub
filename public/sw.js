/* LinHub Service Worker — 离线壳缓存（P2 后接入 serwist 做精细策略） */
const CACHE = "linhub-shell-v1";
const SHELL = ["/", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith("http")) return;
  // 网络优先，失败回退缓存（保证开发时始终最新）
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && new URL(request.url).origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? Response.error()))
  );
});
