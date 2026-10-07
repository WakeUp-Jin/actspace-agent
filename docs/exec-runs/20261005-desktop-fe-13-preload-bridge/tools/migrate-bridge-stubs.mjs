#!/usr/bin/env node
// 13 T9 一次性迁移脚本：把 renderer 测试里的扁平 bridge stub 改写成 `setupBridge({ "域.成员": … })`。
// 用法：node migrate-bridge-stubs.mjs <file...>   （就地改写，打印需要人工处理的位置）
//
// 改写范围：
// - `window.actspace = X`、`Object.defineProperty(window, "actspace", { value: X })` → `setupBridge(X)`
// - `Object.assign(window.actspace, X)` → `overrideBridge(X)`
// - 上述 X 以及 `taskHostFixture(X)` / `setupBridge(X)` 的顶层键：扁平名 → "域.成员"
// - X 里展开的本地变量 / 本地函数返回的对象字面量，同样改键
// - 投影成员：测试 stub 返回 SessionRecord。`taskHostFixture` 实参里的 getSession → fixture 选项 `getRecord`；
//   其余 getSession / createSession / forkSession → `"sessions.*": projectRecord(X)`（helpers/session-records）
// 不处理：getSessionToolDetail、actspaceHosts、无法解析的展开，均打印出来人工处理。
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../../../..");
const require = createRequire(resolve(repo, "apps/desktop/package.json"));
const ts = require("typescript");
const { LEGACY_FLAT_MEMBERS, LEGACY_PROJECTED_MEMBERS } = require(resolve(repo, "packages/shared/dist/desktop-bridge/legacy.js"));

const FIXTURE_CALLEES = new Set(["taskHostFixture", "setupBridge", "overrideBridge"]);

function unwrap(node) {
  while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isTypeAssertionExpression?.(node)) node = node.expression;
  return node;
}

// T9h：`(window as { actspace?: … }).actspace` 也算，T9 漏了这种写法。
function isWindow(node) {
  const inner = unwrap(node);
  return ts.isIdentifier(inner) && inner.text === "window";
}

function isWindowMember(node, name) {
  return ts.isPropertyAccessExpression(node) && node.name.text === name && isWindow(node.expression);
}

function migrate(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const manual = [];
  const literals = new Set();
  const fixtureLiterals = new Set();
  const used = new Set();
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  // 局部声明：变量 → 对象字面量；函数 → 返回的对象字面量
  const declarations = new Map();
  const visitDecl = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isObjectLiteralExpression(init)) declarations.set(node.name.text, { kind: "object", node: init });
      else if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) declarations.set(node.name.text, { kind: "function", node: init });
    }
    if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, { kind: "function", node });
    ts.forEachChild(node, visitDecl);
  };
  visitDecl(source);

  const returnedObjects = (fn) => {
    const out = [];
    if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) {
      const body = unwrap(fn.body);
      if (ts.isObjectLiteralExpression(body)) out.push(body);
      return out;
    }
    const walk = (node) => {
      if (node !== fn && (ts.isFunctionLike(node))) return;
      if (ts.isReturnStatement(node) && node.expression) {
        const value = unwrap(node.expression);
        if (ts.isObjectLiteralExpression(value)) out.push(value);
      }
      ts.forEachChild(node, walk);
    };
    if (fn.body) walk(fn.body);
    return out;
  };

  const addLiteral = (expr, origin) => {
    const node = unwrap(expr);
    if (ts.isObjectLiteralExpression(node)) {
      if (literals.has(node)) return;
      literals.add(node);
      for (const prop of node.properties) {
        if (!ts.isSpreadAssignment(prop)) continue;
        const spread = unwrap(prop.expression);
        if (ts.isIdentifier(spread) && declarations.get(spread.text)?.kind === "object") addLiteral(declarations.get(spread.text).node, origin);
        else if (ts.isCallExpression(spread) && ts.isIdentifier(spread.expression) && declarations.get(spread.expression.text)?.kind === "function") {
          for (const value of returnedObjects(declarations.get(spread.expression.text).node)) addLiteral(value, origin);
        } else if (ts.isObjectLiteralExpression(spread)) addLiteral(spread, origin);
        else manual.push(`${line(prop)}: 无法解析的展开 \`${prop.getText(source).slice(0, 60)}\`（${origin}）`);
      }
      return;
    }
    if (ts.isIdentifier(node) && declarations.get(node.text)?.kind === "object") return addLiteral(declarations.get(node.text).node, origin);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && FIXTURE_CALLEES.has(node.expression.text)) return;
    manual.push(`${line(node)}: 不是对象字面量的 bridge 值 \`${node.getText(source).slice(0, 60)}\`（${origin}）`);
  };

  const visit = (node) => {
    // window.actspace = X
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && isWindowMember(node.left, "actspace")) {
      const value = unwrap(node.right);
      if (ts.isExpressionStatement(node.parent)) {
        addLiteral(value, "window.actspace =");
        edits.push({ start: node.getStart(source), end: node.getEnd(), text: `setupBridge(${value.getText(source)})`, inner: value });
        used.add("setupBridge");
      } else manual.push(`${line(node)}: 表达式里的 window.actspace 赋值`);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      // Object.assign(window.actspace, X)
      if (ts.isPropertyAccessExpression(callee) && callee.getText(source) === "Object.assign" && node.arguments.length === 2 && isWindowMember(node.arguments[0], "actspace")) {
        addLiteral(node.arguments[1], "Object.assign");
        edits.push({ start: node.getStart(source), end: node.getEnd(), text: `overrideBridge(${unwrap(node.arguments[1]).getText(source)})`, inner: unwrap(node.arguments[1]) });
        used.add("overrideBridge");
      }
      // Object.defineProperty(window, "actspace", { value: X })
      if (ts.isPropertyAccessExpression(callee) && callee.getText(source) === "Object.defineProperty" && node.arguments.length === 3
        && ts.isIdentifier(node.arguments[0]) && node.arguments[0].text === "window" && ts.isStringLiteral(node.arguments[1]) && node.arguments[1].text === "actspace") {
        const descriptor = unwrap(node.arguments[2]);
        const value = ts.isObjectLiteralExpression(descriptor)
          ? descriptor.properties.find((prop) => ts.isPropertyAssignment(prop) && prop.name.getText(source) === "value")
          : undefined;
        if (value) {
          const inner = unwrap(value.initializer);
          addLiteral(inner, "defineProperty");
          edits.push({ start: node.getStart(source), end: node.getEnd(), text: `setupBridge(${inner.getText(source)})`, inner });
          used.add("setupBridge");
        } else manual.push(`${line(node)}: defineProperty 不是 { value } 形式`);
      }
      if (ts.isIdentifier(callee) && FIXTURE_CALLEES.has(callee.text) && node.arguments[0]) {
        addLiteral(node.arguments[0], `${callee.text}()`);
        if (callee.text === "taskHostFixture" && ts.isObjectLiteralExpression(unwrap(node.arguments[0]))) fixtureLiterals.add(unwrap(node.arguments[0]));
      }
    }
    if (ts.isPropertyAccessExpression(node) && isWindow(node.expression) && (node.name.text === "actspace" || node.name.text === "actspaceHosts")) {
      const parent = node.parent;
      const handled = (ts.isBinaryExpression(parent) && parent.left === node && node.name.text === "actspace")
        || (ts.isCallExpression(parent) && parent.arguments[0] === node && parent.expression.getText(source) === "Object.assign");
      if (!handled) manual.push(`${line(node)}: \`${parent.getText(source).slice(0, 80)}\``);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  // 键改写
  const keyEdits = [];
  for (const literal of literals) {
    for (const prop of literal.properties) {
      if (ts.isSpreadAssignment(prop)) continue;
      const name = prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : undefined;
      if (!name) continue;
      if (LEGACY_PROJECTED_MEMBERS.includes(name)) {
        const projected = { getSession: "sessions.get", createSession: "sessions.create", forkSession: "sessions.fork" }[name];
        if (!projected) { manual.push(`${line(prop)}: 投影成员 ${name}`); continue; }
        if (name === "getSession" && fixtureLiterals.has(literal)) {
          if (ts.isShorthandPropertyAssignment(prop)) keyEdits.push({ start: prop.getStart(source), end: prop.getEnd(), text: `getRecord: ${name}` });
          else keyEdits.push({ start: prop.name.getStart(source), end: prop.name.getEnd(), text: "getRecord" });
          continue;
        }
        if (ts.isShorthandPropertyAssignment(prop)) keyEdits.push({ start: prop.getStart(source), end: prop.getEnd(), text: `"${projected}": projectRecord(${name})` });
        else if (ts.isPropertyAssignment(prop)) keyEdits.push({ start: prop.getStart(source), end: prop.getEnd(), text: `"${projected}": projectRecord(${prop.initializer.getText(source)})` });
        else { manual.push(`${line(prop)}: 投影成员 ${name}（方法写法）`); continue; }
        used.add("projectRecord");
        continue;
      }
      const target = LEGACY_FLAT_MEMBERS[name];
      if (!target) {
        if (!name.includes(".") && !["execute", "executeCompaction", "prepare"].includes(name)) manual.push(`${line(prop)}: 未知键 ${name}`);
        continue;
      }
      const path = `"${target[0]}.${target[1]}"`;
      if (ts.isShorthandPropertyAssignment(prop)) keyEdits.push({ start: prop.getStart(source), end: prop.getEnd(), text: `${path}: ${name}` });
      else keyEdits.push({ start: prop.name.getStart(source), end: prop.name.getEnd(), text: path });
    }
  }

  // 外层改写（setupBridge(...)）包含内层键改写：先把键改写应用到内层文本
  const apply = (base, offset, list) => {
    let out = base;
    for (const edit of [...list].sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start - offset) + edit.text + out.slice(edit.end - offset);
    return out;
  };
  const outer = edits.map((edit) => {
    const innerStart = edit.inner.getStart(source);
    const innerEnd = edit.inner.getEnd();
    const nested = keyEdits.filter((key) => key.start >= innerStart && key.end <= innerEnd);
    nested.forEach((key) => { key.consumed = true; });
    const innerText = apply(text.slice(innerStart, innerEnd), innerStart, nested);
    return { start: edit.start, end: edit.end, text: edit.text.replace(edit.inner.getText(source), () => innerText) };
  });
  const remaining = keyEdits.filter((key) => !key.consumed && !outer.some((edit) => key.start >= edit.start && key.end <= edit.end));
  let result = apply(text, 0, [...outer, ...remaining]);

  const addImport = (names, from) => {
    if (names.length === 0 || result.includes(`from "${from}"`)) return;
    const imports = [...result.matchAll(/^import [^;]+;\n/gm)];
    const last = imports.at(-1);
    const at = last ? last.index + last[0].length : 0;
    result = `${result.slice(0, at)}import { ${names.sort().join(", ")} } from "${from}";\n${result.slice(at)}`;
  };
  // 相对 R/test/helpers 计算导入路径（fixtures/ 下的文件要 "../helpers/…"）。
  const helpers = relative(dirname(resolve(file)), resolve(repo, "apps/desktop/src/renderer/test/helpers"));
  const helper = (name) => `${helpers.startsWith(".") ? helpers : `./${helpers}`}/${name}`;
  addImport([...used].filter((name) => name !== "projectRecord"), helper("bridge"));
  addImport([...used].filter((name) => name === "projectRecord"), helper("session-records"));
  if (result !== text) writeFileSync(file, result);
  return { changed: result !== text, keys: keyEdits.length, roots: edits.length, manual };
}

for (const file of process.argv.slice(2)) {
  const { changed, keys, roots, manual } = migrate(resolve(file));
  console.log(`\n${file}: ${changed ? "改写" : "未变"}（${roots} 处安装，${keys} 个键）`);
  for (const item of manual) console.log(`  人工：${item}`);
}
