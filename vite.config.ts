import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 复刻自原站（秒哒生成）的构建配置：Vite + React + 相对 base，
// 使 dist 产物放在任意路径（含本地静态服务器子目录）下都能正常加载。
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    target: "es2020",
    chunkSizeWarningLimit: 2048,
  },
  server: {
    host: true,
    port: 5188,
    strictPort: true,
    watch: {
      ignored: ["**/dist/**", "**/scratch/**", "**/.git/**"],
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
});