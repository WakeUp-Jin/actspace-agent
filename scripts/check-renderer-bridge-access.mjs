// renderer bridge 访问审计：renderer 只能通过 `api/<域>` 使用 preload bridge（13 T7 起）。
// 直接访问 `window.actspace` / `actspaceHosts` 只允许出现在：
//   - main.tsx（启动时决定装 preload bridge 还是 mock）；
//   - api/bridge.ts（唯一的 bridge 入口）；
//   - mock/**、test/**（mock bridge 与测试桩）。
// 识别的写法：`.actspace` / `.actspaceHosts` 成员访问（含 `window?.`、`(window as X).`），
// `["actspace"]` 下标访问，以及 `const { actspace } = window` 解构。
// 另外，`api/bridge`（`getBridge` / `installBridge` 等）只允许 api/**、main.tsx、bridge-bootstrap.ts、
// mock/**、test/** 导入；业务代码只 import `api/<域>`。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const RENDERER_ROOT = "apps/desktop/src/renderer";

const ALLOWED = [/^main\.tsx$/, /^api\/bridge\.ts$/, /^mock\//, /^test\//];

const BRIDGE_IMPORT_ALLOWED = [/^api\//, /^main\.tsx$/, /^bridge-bootstrap\.ts$/, /^mock\//, /^test\//];

/** 相对路径导入 `…/api/bridge`：`from "…"`、`import("…")`、`vi.mock("…")` 之外的裸 `import "…"`。 */
const BRIDGE_IMPORT_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'`]((?:\.{1,2}\/)+(?:[\w.-]+\/)*api\/bridge(?:\.ts)?)["'`]/g;

const ACCESS_PATTERNS = [
  /(?<=[\w$)\]])\s*\??\.\s*(actspace(?:Hosts)?)(?![\w$-])/g,
  /\[\s*["'`](actspace(?:Hosts)?)["'`]\s*\]/g,
  /\{[^{}]*\b(actspace(?:Hosts)?)\b[^{}]*\}\s*=\s*(?:window|globalThis|self)\b/g,
];

/** `relativePath` 相对 renderer 根目录，用 `/` 分隔。 */
export function isAllowedPath(relativePath) {
  return ALLOWED.some((pattern) => pattern.test(relativePath));
}

export function isBridgeImportAllowed(relativePath) {
  return BRIDGE_IMPORT_ALLOWED.some((pattern) => pattern.test(relativePath));
}

/** 返回源码中导入 `api/bridge` 的行号。 */
export function findBridgeImports(text) {
  return [...text.matchAll(BRIDGE_IMPORT_PATTERN)].map((match) => text.slice(0, match.index).split("\n").length);
}

/** 返回源码中直接访问 bridge 的位置：`{ line, name }`。 */
export function findBridgeAccesses(text) {
  const found = [];
  for (const pattern of ACCESS_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split("\n").length;
      found.push({ line, name: match[1] });
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

/** @param {{ path: string, text: string }[]} sources `path` 相对 renderer 根目录 */
export function auditRendererBridgeAccess(sources) {
  const errors = [];
  for (const { path: file, text } of sources) {
    if (!isAllowedPath(file)) {
      for (const { line, name } of findBridgeAccesses(text)) {
        errors.push(`${RENDERER_ROOT}/${file}:${line} 直接访问了 ${name}，请改用 api/<域>`);
      }
    }
    if (!isBridgeImportAllowed(file)) {
      for (const line of findBridgeImports(text)) {
        errors.push(`${RENDERER_ROOT}/${file}:${line} 导入了 api/bridge，请改用 api/<域>`);
      }
    }
  }
  return errors;
}

function readTree(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(full);
      } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) {
        out.push({ path: path.relative(root, full).split(path.sep).join("/"), text: fs.readFileSync(full, "utf8") });
      }
    }
  };
  walk(root);
  return out;
}

export function runCheck(root = repoRoot) {
  const sources = readTree(path.join(root, RENDERER_ROOT));
  return { files: sources.length, errors: auditRendererBridgeAccess(sources) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, errors } = runCheck();
  if (errors.length > 0) {
    console.error(`renderer bridge 访问审计失败（${errors.length} 处）：`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`renderer bridge 访问审计通过：检查了 ${files} 个文件。`);
}
