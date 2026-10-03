import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Explicit built-in closure, not an arbitrary npm plugin packager. Host contracts
// retain module identity; execution implementation code is bundled into artifacts.
const root = fileURLToPath(new URL("../", import.meta.url));
const outdir = join(root, "dist/default-harness");
const entries = {
  "subagent-tools": "./dist/runtime/harness-subagent-tools.js",
  "llm-service": "@actspace/llm-service/plugin",
  "tools-runtime": "@actspace/tools-runtime/plugin",
  "tools-approval": "@actspace/tools-approval/plugin",
  "context-assembly": "@actspace/context/plugin",
  "prompt-runtime": "@actspace/prompt/plugin",
  "compaction-runtime": "@actspace/compaction/plugin",
  ...Object.fromEntries(["filesystem-read", "filesystem-search", "filesystem-write", "shell-tools", "web-tools", "image-generation", "image-inspection", "browser-tools"].map(id => [id, `@actspace/tools-${id}/plugin`])),
};
const external = ["@actspace/cordis-adapter", "@actspace/core-scope", "@actspace/shared", "@actspace/shared/*", "@actspace/session-journal", "@actspace/session-persistence", "@actspace/session-projection", "@actspace/session-jsonl"];
await rm(outdir, { recursive: true, force: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: [...Object.entries(entries).map(([out, specifier]) => ({ out, in: specifier })), { out: "agent-factory", in: "harness:factory" }, { out: "todo-tools", in: "harness:todo" }],
  outdir, bundle: true, splitting: true, format: "esm", platform: "node", target: "node22", external,
  metafile: true, write: true,
  plugins: [{ name: "default-factory-entry", setup(build) {
    build.onResolve({ filter: /^harness:(factory|todo)$/ }, args => ({ path: args.path.split(":")[1], namespace: "harness" }));
    build.onLoad({ filter: /.*/, namespace: "harness" }, args => ({ contents: args.path === "todo" ? 'export { applyTools as apply } from "@actspace/tools-todo-tools/plugin";' : 'export { applyRunFactory as apply, inject } from "./dist/runtime/agent-factory-plugin.js";', resolveDir: root, loader: "js" }));
  } }],
});
await mkdir(outdir, { recursive: true });
const files = Object.keys(result.metafile.outputs).map(path => path.slice("dist/default-harness/".length)).sort();
await writeFile(join(outdir, "files.json"), JSON.stringify(files, null, 2) + "\n");
console.log(`Default Harness: ${files.length} fixed ESM files`);
