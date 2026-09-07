import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const strict = process.argv.includes("--strict");
const forbidden = [
  "@actspace/agent-core",
  "ContextManager",
  "ToolManager",
  "ToolScheduler",
  "session.jsonl",
  "context-state.json",
  "ACTSPACE_INTERNAL_RUNTIME_CANDIDATE",
  "plugins:fs-watch:",
  "kairos:",
  "NODE_SEA_BLOB",
];
const allowedCurrentReferences = new Map([
  ["packages/runtime/src/profiles/composition.ts", new Set(["session.jsonl"])],
]);
const roots = [
  "apps/cli/src/cli.ts",
  "apps/cli/src/runtime-v2",
  "packages/runtime/src",
  "packages/shared/src/runtime-v2",
  "apps/desktop/src/main/index.ts",
  "apps/desktop/src/main/runtime-v2",
  "apps/desktop/src/preload/index.ts",
  "apps/desktop/src/renderer",
];
const hits = [];
for (const rootPath of roots) await scan(join(root, rootPath));
if (hits.length > 0) {
  process.stderr.write(`v2 legacy removal check found ${hits.length} forbidden reference(s):\n${hits.join("\n")}\n`);
  if (strict) process.exitCode = 1;
} else {
  process.stdout.write("v2 legacy removal check passed\n");
}

async function scan(path) {
  const relativePath = relative(root, path);
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    const text = await readFile(path, "utf8");
    for (const token of forbidden) {
      if (text.includes(token) && !allowedCurrentReferences.get(relativePath)?.has(token)) hits.push(`${relativePath}: ${token}`);
    }
    return;
  }
  let entries;
  try { entries = await readdir(path, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) await scan(target);
    else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
      const text = await readFile(target, "utf8");
      const relativeTarget = relative(root, target);
      for (const token of forbidden) {
        if (text.includes(token) && !allowedCurrentReferences.get(relativeTarget)?.has(token)) hits.push(`${relativeTarget}: ${token}`);
      }
    }
  }
}
