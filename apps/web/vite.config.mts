import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { sharedAliases } from "./shared-aliases.mts";

const version = (JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version: string }).version;
const buildId = `${version}-${Date.now().toString(36)}`;
// 开发时 /rpc 转给本机 Host；Origin 原样转发，由 Host 的回环来源规则放行（不改写 Origin）。
const hostTarget = process.env.ACTSPACE_HOST_URL ?? "http://127.0.0.1:4317";

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: sharedAliases },
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_ID__: JSON.stringify(buildId) },
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, "index.html"), sw: resolve(__dirname, "src/pwa/sw.ts") },
      // Service Worker 的作用域取决于它的路径，所以固定输出到根目录的 /sw.js。
      output: {
        entryFileNames: chunk => (chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"),
        // 依赖单独成块：应用更新时手机只需重新下载业务代码。
        manualChunks: id => {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          if (/[\\/](react-markdown|remark-|mdast-|micromark|unified|hast-|unist-|vfile|property-information|decode-named-character-reference|character-entities)/.test(id)) return "markdown";
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.VITE_DEV_PORT) || 5174,
    strictPort: true,
    proxy: { "/rpc": { target: hostTarget, ws: true } },
  },
});
