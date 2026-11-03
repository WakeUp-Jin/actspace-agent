// 构建 demo.js / demo.css，并复制应用编译后的样式 app.css。
// 依赖两处 node_modules：本目录（新插件）和 apps/desktop（react、react-markdown 等，需要先在仓库根 pnpm install）。
import { build } from "esbuild";
import { copyFileSync, readdirSync } from "node:fs";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const desktop = path.resolve(here, "../../../../apps/desktop");
const appModules = process.env.APP_NODE_MODULES ?? path.join(desktop, "node_modules");
await build({
  entryPoints: [path.join(here, "src/demo.tsx")],
  bundle: true, format: "iife", minify: true, target: ["chrome110", "safari16"], jsx: "automatic",
  outfile: path.join(here, "demo.js"),
  nodePaths: [appModules, path.join(here, "node_modules")],
  alias: { "@repo": path.join(desktop, "src/renderer"), react: path.join(appModules, "react"), "react-dom": path.join(appModules, "react-dom") },
  external: ["mermaid"],
  loader: { ".txt": "text", ".svg": "dataurl", ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
  define: { "import.meta.env.DEV": "false", "import.meta.env.MODE": '"production"', "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
// app.css 取应用的生产构建产物（pnpm --filter @actspace/desktop build 之后的 dist/assets/index-*.css）。
const assets = process.env.APP_DIST_ASSETS ?? path.join(desktop, "dist/assets");
const css = readdirSync(assets).find((f) => /^index-.*\.css$/.test(f));
copyFileSync(path.join(assets, css), path.join(here, "app.css"));
