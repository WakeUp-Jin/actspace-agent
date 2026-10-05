#!/usr/bin/env node
// 13 T7 一次性迁移脚本：renderer 业务代码里的 `window.actspace.<扁平名>` → `<域>Api.<成员>`，并补 `api/<域>` 导入。
// 用法：node migrate-renderer-api.mjs [--hosts] <file...>   （就地改写，打印需要人工处理的位置）
// - 默认只改 `window.actspace.*`；`--hosts` 时也改 `window.actspaceHosts.*`（`call` 签名不同，留给人工）。
// - `window.actspace.<域>.<成员>` 这种已经是契约路径的写法同样改成 `<域>Api.<成员>`。
// - 裸的 `window.actspace` / `window.actspaceHosts`（赋给变量、存在检查）只打印，不改。
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../../../..");
const require = createRequire(resolve(repo, "apps/desktop/package.json"));
const ts = require("typescript");
const { LEGACY_FLAT_MEMBERS, LEGACY_HOST_MEMBERS } = require(resolve(repo, "packages/shared/dist/desktop-bridge/legacy.js"));
const { desktopBridgeContract } = require(resolve(repo, "packages/shared/dist/desktop-bridge/contract.js"));

const API_DIR = resolve(repo, "apps/desktop/src/renderer/api");
const FILE_OF = { quickOpen: "quick-open", englishLearning: "english-learning", browserBridge: "browser-bridge" };
const args = process.argv.slice(2);
const withHosts = args.includes("--hosts");
const files = args.filter((arg) => arg !== "--hosts");

function isWindow(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return ts.isIdentifier(node) && node.text === "window";
}

/** `window.actspace` / `window.actspace!` / `(window as …).actspace` → 成员名，否则 undefined。 */
function rootName(node) {
  while (ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
  if (ts.isPropertyAccessExpression(node) && isWindow(node.expression)) return node.name.text;
  return undefined;
}

function migrate(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const manual = [];
  const domains = new Set();
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node)) {
      const root = rootName(node.expression);
      if (root === "actspace" || (withHosts && root === "actspaceHosts")) {
        const name = node.name.text;
        let target = root === "actspace" ? LEGACY_FLAT_MEMBERS[name] : LEGACY_HOST_MEMBERS[name];
        let end = node.getEnd();
        // window.actspace.<域>.<成员>
        if (!target && root === "actspace" && desktopBridgeContract[name] && ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) {
          target = [name, node.parent.name.text];
          end = node.parent.getEnd();
        }
        if (target && desktopBridgeContract[target[0]]?.[target[1]]) {
          edits.push({ start: node.getStart(source), end, text: `${target[0]}Api.${target[1]}` });
          domains.add(target[0]);
          return;
        }
        manual.push(`${line(node)}: 未映射的成员 ${root}.${name}`);
        return;
      }
    }
    const root = ts.isPropertyAccessExpression(node) && isWindow(node.expression) ? node.name.text : undefined;
    if (root === "actspace" || (withHosts && root === "actspaceHosts")) {
      manual.push(`${line(node)}: 裸引用 \`${node.parent.getText(source).slice(0, 90)}\``);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  let result = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);

  const imports = [...domains].sort().filter((domain) => !new RegExp(`\\b${domain}Api\\b`).test(text));
  if (imports.length > 0) {
    const fromDir = dirname(resolve(file));
    const lines = [];
    for (const domain of imports) {
      let path = relative(fromDir, resolve(API_DIR, FILE_OF[domain] ?? domain));
      if (!path.startsWith(".")) path = `./${path}`;
      // 已经从同一模块导入（如 api/sessions 的 createSession）时并进去。
      const existing = new RegExp(`^import \\{([^}]*)\\} from "${path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}";$`, "m");
      if (existing.test(result)) result = result.replace(existing, (_, names) => `import {${names.trimEnd()}, ${domain}Api } from "${path}";`);
      else lines.push(`import { ${domain}Api } from "${path}";\n`);
    }
    const all = [...result.matchAll(/^import [\s\S]*?;\n/gm)];
    const at = all.length ? all.at(-1).index + all.at(-1)[0].length : 0;
    result = `${result.slice(0, at)}${lines.join("")}${result.slice(at)}`;
  }
  if (result !== text) writeFileSync(file, result);
  return { edits: edits.length, domains: [...domains], manual };
}

for (const file of files) {
  const { edits, domains, manual } = migrate(resolve(file));
  if (edits === 0 && manual.length === 0) continue;
  console.log(`${file}: ${edits} 处（${domains.join(", ")}）`);
  for (const item of manual) console.log(`  人工：${item}`);
}
