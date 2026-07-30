import type { NextConfig } from "next";

const htmlRoutes = [
  "/",
  "/admin",
  "/billing",
  "/chat/:path*",
  "/files",
  "/knowledge",
  "/login",
  "/projects",
  "/projects/:path*",
  "/register",
  "/settings",
  "/share/:path*",
  "/skills",
];

const noStoreHeader = {
  key: "Cache-Control",
  value: "private, no-cache, no-store, max-age=0, must-revalidate",
};

const alwaysRevalidateHeader = {
  key: "Cache-Control",
  value: "public, no-cache, max-age=0, must-revalidate",
};

const nextConfig: NextConfig = {
  // 允许通过 Lighthouse 的 Tailscale 地址访问 dev server 与 HMR。
  allowedDevOrigins: ["100.100.13.55"],
  // pdf-parse/pdfjs 在 Node 环境会相对自身模块加载 pdf.worker.mjs。
  // 若被 Next/Turbopack 打进 server chunk，相对路径会错误地落到 .next/**/chunks。
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // HTML 壳包含当前构建的 chunk 引用，不能让 CDN 跨部署长期缓存；
  // 带内容哈希的 /_next/static 仍由 Next.js 保持 immutable 长缓存。
  async headers() {
    return [
      ...htmlRoutes.map((source) => ({
        source,
        headers: [noStoreHeader],
      })),
      {
        source: "/sw.js",
        headers: [
          alwaysRevalidateHeader,
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/offline.html",
        headers: [alwaysRevalidateHeader],
      },
      {
        source: "/manifest.webmanifest",
        headers: [alwaysRevalidateHeader],
      },
    ];
  },
};

export default nextConfig;
