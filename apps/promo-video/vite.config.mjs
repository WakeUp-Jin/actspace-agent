import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // 配乐（.cache/music/）是下载来的本地文件，放在 Git 忽略的 .cache/ 里，由开发服务器原样托管给预览页。
  publicDir: here("./.cache"),
  server: {
    host: "127.0.0.1",
    port: 8770,
  },
});
