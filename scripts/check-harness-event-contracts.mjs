import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
// 第一项必须是 event-contract.ts：契约目录把后面几项当作领域事件的声明来源（scripts/contract-matrix/source-registry.mjs）。
export const HARNESS_EVENT_DECLARATION_PATHS = Object.freeze([
  "packages/composition/cordis-adapter/src/event-contract.ts",
  "packages/harness-evolution/harness-control/src/contracts.ts",
  "packages/core/agent-service/src/service.ts",
  "packages/core/agent-service/src/application.ts",
  "packages/core/runtime/src/session/session-plugin.ts",
  "packages/core/agent-loop/src/hooks.ts",
  "packages/core/tool-runtime/src/hooks.ts",
]);
const declaredModes = (declarations) =>
  new Map(
    [...declarations.matchAll(/\/\*\*\s*@mode\s+(emit|waterfall|parallel|serial|bail)\s*\*\/\s*"([^"]+)"/g)].map(
      (m) => [m[2], m[1]],
    ),
  );
/** Scan explicit dispatch literals. Dynamic wrappers are validated separately by adapter tests. */
export function inspectHarnessEvents(declarations, sources) {
  const modes = declaredModes(declarations);
  const errors = [];
  const wrappers = { emitNotification: "emit", waterfallDispatch: "waterfall", serialDispatch: "serial" };
  for (const [path, source] of sources) {
    const calls = [...source.matchAll(/\.(emit|serial|waterfall|parallel|bail)(?:\?\.)?\(\s*"([^"]+)"/g)].map((m) => [
      m[1],
      m[2],
    ]);
    for (const [wrapper, mode] of Object.entries(wrappers))
      for (const m of source.matchAll(new RegExp(`\\b${wrapper}\\([^,]+,\\s*"([^"]+)"`, "g"))) calls.push([mode, m[1]]);
    for (const [mode, event] of calls) {
      if (!modes.has(event)) errors.push(`${path}: missing @mode for ${event}`);
      else if (modes.get(event) !== mode)
        errors.push(`${path}: ${event} requires ${modes.get(event)}, dispatched ${mode}`);
    }
  }
  return errors;
}
/**
 * 干预点（声明的模式不是 emit）的监听器要用 onHook 注册。直接写 ctx.on("名字", …) 能跑，但监听器的 payload 和返回值没有类型。
 * 只认字面量名字；名字放在变量里再传给 on 的写法查不到。
 */
export function inspectHookRegistrations(declarations, sources) {
  const modes = declaredModes(declarations);
  const errors = [];
  for (const [path, source] of sources) {
    for (const m of source.matchAll(/\.(?:on|once)(?:\?\.)?\(\s*(["'`])([^"'`]+)\1/g)) {
      const mode = modes.get(m[2]);
      if (mode !== undefined && mode !== "emit")
        errors.push(`${path}: ${m[2]} is a ${mode} hook, register its listener with onHook(ctx, "${m[2]}", listener)`);
    }
  }
  return errors;
}
const DISPATCH_SKIP = new Set(["test", "testing.ts"]);
const isDispatchSource = (name) => name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(name);
// 查注册写法时从 packages 和 apps 的根目录走起，要多跳过依赖、构建产物和测试夹具。
const REGISTRATION_SKIP = new Set([
  ...DISPATCH_SKIP,
  "tests",
  "__tests__",
  "fixtures",
  "node_modules",
  "dist",
  "dist-electron",
  "build",
  "out",
  "coverage",
]);
const isListenerSource = (name) =>
  /\.(ts|tsx|mts|cts)$/.test(name) && !/\.d\.[cm]?ts$/.test(name) && !/\.(test|spec|bench|perf)\.[cm]?tsx?$/.test(name);
async function walk(root, skip = DISPATCH_SKIP, accepts = isDispatchSource) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path, skip, accepts)));
    else if (accepts(entry.name)) result.push([path, await readFile(path, "utf8")]);
  }
  return result;
}
/**
 * 可能注册监听器的源码：监听器可以写在任何插件里，所以查整个 packages 和 apps 的 TypeScript（不含测试、夹具、依赖和构建产物），
 * 不只查分发方所在的目录。路径相对 root，用 `/` 分隔。
 */
export async function readListenerSources(root = ".") {
  const found = (
    await Promise.all(["packages", "apps"].map((base) => walk(join(root, base), REGISTRATION_SKIP, isListenerSource)))
  ).flat();
  return found.map(([path, source]) => [relative(root, path).split(sep).join("/"), source]);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const declarations = (await Promise.all(HARNESS_EVENT_DECLARATION_PATHS.map((path) => readFile(path, "utf8")))).join(
    "\n",
  );
  const sources = (
    await Promise.all(
      [
        "packages/core/agent-loop/src",
        "packages/core/tool-runtime/src",
        "packages/core/runtime/src/startup",
        "packages/core/runtime/src/session",
        "packages/core/runtime/src/harness",
        "packages/core/agent-service/src",
        "packages/host/desktop-app/src",
        "packages/harness-evolution/harness-control/src",
      ].map((root) => walk(root)),
    )
  ).flat();
  const listeners = await readListenerSources();
  const errors = [...inspectHarnessEvents(declarations, sources), ...inspectHookRegistrations(declarations, listeners)];
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `Harness event mode declarations and explicit dispatch sites match; no hook listener is registered with a raw on() in ${listeners.length} files`,
    );
}
