/** 渲染要用到的本地服务：宣传片合成页（Vite）。 */
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

export const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

export async function startComposition() {
  const server = await createServer({
    root: packageRoot,
    logLevel: "warn",
    // 端口交给系统分配，和手动开着的 `pnpm dev` 互不抢占。
    // 关掉热更新和文件监听：渲染要跑几分钟，中途有人存了源码也不能让页面重载。
    server: { port: 0, strictPort: false, open: false, hmr: false, watch: null },
  });
  await server.listen();
  const { port } = server.httpServer.address();
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() };
}
