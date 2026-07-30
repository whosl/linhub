import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 开发代理:/api 转发到已部署的 LinHub 后端
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "https://lin.wenzhuolin.xyz",
        changeOrigin: true,
        secure: true,
        // better-auth 校验 Origin/Referer,改写成后端地址避免 "Invalid origin"
        headers: {
          origin: "https://lin.wenzhuolin.xyz",
          referer: "https://lin.wenzhuolin.xyz/",
        },
      },
    },
  },
});
