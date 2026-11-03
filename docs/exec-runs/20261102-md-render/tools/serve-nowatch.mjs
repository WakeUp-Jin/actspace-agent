// 起一个不监听文件变化、不热更新的 renderer 开发服务器，供截图和逐帧测量用：
// 同一个 worktree 里还有别的改动在进行时，普通 dev server 会因为文件变化重载页面，打断测量。
// 用法：node docs/exec-runs/20261102-md-render/tools/serve-nowatch.mjs [端口，默认 5189]
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../apps/desktop");
const require = createRequire(resolve(desktop, "package.json"));
const viteRoot = dirname(require.resolve("vite/package.json"));
const { createServer } = await import(pathToFileURL(resolve(viteRoot, "dist/node/index.js")).href);
const port = Number(process.argv[2] ?? 5189);
const server = await createServer({
  root: desktop,
  configFile: resolve(desktop, "vite.config.mts"),
  server: { port, strictPort: true, host: "127.0.0.1", watch: null, hmr: false },
});
await server.listen();
server.printUrls();
