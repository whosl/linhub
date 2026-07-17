import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许通过 Lighthouse 的 Tailscale 地址访问 dev server 与 HMR。
  allowedDevOrigins: ["100.100.13.55"],
  /* config options here */
};

export default nextConfig;
