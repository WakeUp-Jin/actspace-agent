/** 渲染和录制要用到的两个本地服务：宣传片合成页（Vite）与官网（Astro）。 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

export const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
export const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));

const SITE_URL = "http://127.0.0.1:8765/actspace-agent/";

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

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** 官网开发服务器已经开着就直接用，否则临时起一个，用完关掉。 */
export async function ensureSite() {
  if (await reachable(SITE_URL)) return { url: SITE_URL, close: async () => {} };

  const child = spawn("pnpm", ["--filter", "@actspace/site", "dev"], {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "inherit"],
    detached: true,
  });
  const close = async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    // astro 是 pnpm 的子进程，按进程组一起结束。
    process.kill(-child.pid, "SIGTERM");
    await exited;
  };

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`官网开发服务器启动失败（退出码 ${child.exitCode}）`);
    if (await reachable(SITE_URL)) return { url: SITE_URL, close };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await close();
  throw new Error(`官网开发服务器 90 秒内没有就绪：${SITE_URL}`);
}
