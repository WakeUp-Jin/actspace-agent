// 服务取用检查：一个服务取出来是什么类型，由它的「服务定义」说了算，取用方和提供方都用同一个定义。
// 定义和取用的写法都在 packages/composition/cordis-adapter/src/service-access.ts：
//   定义  `bindServiceType<T>(总表条目)`、`serviceKey<T>(id)`，取用方不能依赖提供方时用 `serviceView<T>(id)`
//   取用  `getService` / `requireService` / `getLeasedService`        注册  `provideService`
// 各处自己写 `ctx.get?.("某个 id") as 某个类型` 时，类型是取用方单方面写的，提供方改了以后编译器不会提醒。
// 扫描 packages/、apps/ 的 JS / TS 源码（不含测试和构建产物），按文本找四类写法：
//   1. 按 id 取出来再断言类型：`x.get?.(…) as T`，以及名字以 ctx / context 结尾的对象上的 `.get(…) as T`
//   2. 直接调用 `.getService(…)`：它的返回类型由调用方指定，等于一次没写出来的断言
//   3. 有定义的服务又按字符串 id 注册：`x.provide?.("id", …)`、`x.provide("id", …)`，或 `super(ctx, "id")`
//   4. 视图（`serviceView`）不是导出的常量，或在 packages/core/runtime/src/startup/service-views.ts 里没有对照行，
//      或对照行里的真实服务和视图不是同一个 id。Runtime 能同时看到取用方和提供方，那个文件的每一行
//      `Covers<真实服务, ServiceOf<typeof 视图>>` 由编译器核对真实服务满足视图；这里核对行在不在、对没对上
// 第 3、4 类要知道每个定义的 id。id 可以写成字符串、`ACTSPACE_SERVICE_IDS.x`、`ACTSPACE_SERVICE_DEFINITIONS.x`，
// 或一个全大写的字符串常量；别的写法这里读不出来，会直接报错。
// 只按文本匹配，整行都是注释的不算。认不出的：把取出来的值先存进变量、隔一行再断言；用变量拼出来的 id。
// 可以保留的文件和处数记在下面的 ALLOWED 里，每条写明理由。处数对不上就失败：
// 多了说明新增了这种写法；少了说明清单过期，要同步改掉，免得空出来的名额被新的写法占用。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["packages", "apps"];
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", "build", "out", "coverage", "test", "tests", "__tests__", "fixtures"]);
export const CATALOG_FILE = "packages/composition/cordis-adapter/src/service-contract.ts";
export const VIEWS_FILE = "packages/core/runtime/src/startup/service-views.ts";

export const ALLOWED = [
  { file: "packages/composition/cordis-adapter/src/service-access.ts", rule: "cast", count: 1, reason: "`getService` 的实现：按 id 取出后断言类型只在这里做一次。" },
  { file: "packages/composition/cordis-adapter/src/service-access.ts", rule: "lease", count: 1, reason: "`getLeasedService` 的实现：租约只在这里按 id 取。" },
  {
    file: "packages/composition/cordis-adapter/src/cordis-root.ts",
    rule: "cast",
    count: 2,
    reason: "两种根句柄各自的 `getService<T>(id)`：按 id 取的底层接口，业务代码经 `getLeasedService` 用它。",
  },
  { file: "packages/composition/cordis-adapter/src/cordis-tree.ts", rule: "cast", count: 1, reason: "Harness 子树句柄的 `getService<T>(id)`，同上。" },
  { file: "packages/composition/boot/src/harness-generations.ts", rule: "lease", count: 1, reason: "租约的 `getService<T>(id)` 转给子树句柄，同上。" },
  { file: "packages/composition/boot/src/dsh-boot.ts", rule: "lease", count: 1, reason: "只判断必需的服务有没有注册，不使用取出来的值。" },
  {
    file: "apps/cli/src/runtime-v2/profile-service.ts",
    rule: "cast",
    count: 1,
    reason: "CLI 只能动态加载 Runtime，拿不到服务定义这个值；类型查 Runtime 导出的 `ProfileServices`，全 CLI 只在这里断言一次。",
  },
  {
    file: "apps/desktop/src/main/runtime-v2/profile-service.ts",
    rule: "cast",
    count: 1,
    reason: "桌面端主进程同上，全主进程只在这里断言一次。",
  },
  {
    file: "packages/core/runtime/src/harness/agent-factory-plugin.ts",
    rule: "raw-provide",
    count: 1,
    reason: "`agent.run-factory` 的定义在 Host 一侧的包里，值引用会把那个包打进 Harness 内核；这一处用 `satisfies ServiceOf<typeof RUN_FACTORY>` 核对类型。",
  },
  {
    file: "packages/context/context-engine/src/assembly.ts",
    rule: "raw-provide",
    count: 1,
    reason: "为旧调用方留的 `ContextAssemblerService`，生产不挂载；`context.assembly` 现在由 context-assembly 包按定义注册。退役条件见该包 README。",
  },
];

const RULE_TEXT = {
  cast: "按 id 取出服务后自己断言了类型",
  lease: "直接调用了 .getService()",
  "raw-provide": "按字符串 id 注册了有定义的服务",
};

const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;
const LOOKUP = /\.get\?\.\(|\b\w*(?:ctx|context)\.get\(/gi;
const LEASE_CALL = /\.getService\s*[<(]/g;
const KEY_DECLARATION = /(?:(\bexport\s+)?\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*)?\b(serviceKey|serviceView|bindServiceType)\s*</g;
const VIEW_ALIAS = /\btype\s+(\w+)\s*=\s*ServiceOf<\s*typeof\s+(\w+)\s*>/g;
const VIEW_ROW = /\bCovers<\s*(?:ServiceOf<\s*typeof\s+(\w+)\s*>|(\w+))\s*,\s*ServiceOf<\s*typeof\s+(\w+)\s*>\s*>/g;
const PROVIDE_CALL = /\.provide(?:\?\.|!)?\(/g;
const SUPER_CALL = /\bsuper\(\s*[A-Za-z_$][\w$]*\s*,/g;
const STRING_CONSTANT = /\bconst\s+([A-Z][A-Z0-9_]*)\s*(?::[^=;\n]+)?=\s*(?:serviceId\(\s*)?(["'])([^"'\n]+)\2\s*\)?(?:\s*as\s+const)?\s*;/g;
const CATALOG_ID = /^\s*(\w+):\s*serviceId\(\s*"([^"]+)"\s*\)/gm;
const CATALOG_DEFINITION = /^\s*(\w+):\s*defineServiceDefinition\(\{\s*id:\s*ACTSPACE_SERVICE_IDS\.(\w+)/gm;

/** 整行注释换成空行，行号不变。 */
function withoutCommentLines(text) {
  return text.split("\n").map((line) => (COMMENT_LINE.test(line) ? "" : line)).join("\n");
}

function lineOf(text, index) {
  let line = 1;
  for (let at = text.indexOf("\n"); at !== -1 && at < index; at = text.indexOf("\n", at + 1)) line += 1;
  return line;
}

/** `start` 是引号的位置，返回配对引号的位置；单双引号不跨行，找不到配对就当普通字符。 */
function endOfString(text, start) {
  const quote = text[start];
  for (let at = start + 1; at < text.length; at += 1) {
    if (text[at] === "\\") { at += 1; continue; }
    if (text[at] === quote) return at;
    if (text[at] === "\n" && quote !== "`") return start;
  }
  return start;
}

/**
 * `open` 是左括号（或左尖括号）的位置，返回配对的右括号后面的位置，找不到返回 -1。
 * `angles` 为真时把尖括号也算作括号（用来跳过类型参数），这时 `=>` 里的 `>` 不算。
 */
function closeOf(text, open, angles) {
  const opening = angles ? "(<[{" : "([{";
  const closing = angles ? ")>]}" : ")]}";
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    const ch = text[at];
    if (ch === '"' || ch === "'" || ch === "`") { at = endOfString(text, at); continue; }
    if (angles && ch === "=" && text[at + 1] === ">") { at += 1; continue; }
    if (opening.includes(ch)) depth += 1;
    else if (closing.includes(ch)) { depth -= 1; if (depth === 0) return at + 1; }
  }
  return -1;
}

/** 一次调用的第一个参数的原文；`open` 是左括号的位置。 */
function firstArgument(text, open) {
  const end = closeOf(text, open, false);
  if (end < 0) return undefined;
  let depth = 0;
  for (let at = open + 1; at < end - 1; at += 1) {
    const ch = text[at];
    if (ch === '"' || ch === "'" || ch === "`") { at = endOfString(text, at); continue; }
    if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch)) depth -= 1;
    else if (ch === "," && depth === 0) return text.slice(open + 1, at).trim();
  }
  return text.slice(open + 1, end - 1).trim();
}

/** 按 id 取出后紧接着断言类型的行号。 */
export function findLookupCasts(text) {
  const code = withoutCommentLines(text);
  const found = [];
  for (const match of code.matchAll(LOOKUP)) {
    const end = closeOf(code, match.index + match[0].length - 1, false);
    if (end >= 0 && /^[\s!]*as\b/.test(code.slice(end, end + 200))) found.push(lineOf(code, match.index));
  }
  return found;
}

/** 直接调用 `.getService(…)` 的行号。 */
export function findLeaseCalls(text) {
  const code = withoutCommentLines(text);
  return [...code.matchAll(LEASE_CALL)].map((match) => lineOf(code, match.index));
}

/**
 * 源码里的服务定义：`serviceKey<T>(id)`、`serviceView<T>(id)`、`bindServiceType<T>(总表条目)`。
 * `name` 是它赋给的常量名（没有直接赋给常量时为空），`id` 是括号里的原文，还没解析成字符串。
 */
export function findKeyDeclarations(text) {
  const code = withoutCommentLines(text);
  const found = [];
  for (const match of code.matchAll(KEY_DECLARATION)) {
    if (/\bfunction\s+$/.test(code.slice(Math.max(0, match.index - 16), match.index))) continue;
    const afterTypes = closeOf(code, match.index + match[0].length - 1, true);
    if (afterTypes < 0) continue;
    const open = afterTypes + (/^\s*/.exec(code.slice(afterTypes))?.[0].length ?? 0);
    if (code[open] !== "(") continue;
    found.push({ kind: match[3], name: match[2] ?? "", exported: match[1] !== undefined, line: lineOf(code, match.index), id: firstArgument(code, open) ?? "" });
  }
  return found;
}

/** 对照文件里的每一行 `Covers<真实服务, ServiceOf<typeof 视图>>`：视图的常量名，和真实服务的定义的常量名。 */
export function findConformanceRows(text) {
  const code = withoutCommentLines(text);
  const aliases = new Map([...code.matchAll(VIEW_ALIAS)].map((match) => [match[1], match[2]]));
  return [...code.matchAll(VIEW_ROW)].map((match) => ({ line: lineOf(code, match.index), view: match[3], provider: match[1] ?? aliases.get(match[2]) ?? "" }));
}

/** 按 id 注册的地方：`x.provide?.(id, …)`、`x.provide(id, …)`、`super(ctx, id)`。`id` 是原文。 */
export function findRawProvides(text) {
  const code = withoutCommentLines(text);
  const found = [];
  for (const match of code.matchAll(PROVIDE_CALL)) {
    const id = firstArgument(code, match.index + match[0].length - 1);
    if (id) found.push({ line: lineOf(code, match.index), id });
  }
  for (const match of code.matchAll(SUPER_CALL)) {
    const rest = code.slice(match.index + match[0].length);
    const id = /^\s*([^,)]+)/.exec(rest)?.[1].trim();
    if (id) found.push({ line: lineOf(code, match.index), id });
  }
  return found.sort((left, right) => left.line - right.line);
}

/** 读出解析 id 要用的三张表：总表里的 id、总表里的定义指向哪个 id、各处的全大写字符串常量。 */
export function collectIdTables(sources) {
  const catalog = new Map();
  const definitions = new Map();
  const constants = new Map();
  for (const { path: file, text } of sources) {
    const code = withoutCommentLines(text);
    if (file === CATALOG_FILE) {
      for (const match of code.matchAll(CATALOG_ID)) catalog.set(match[1], match[2]);
      for (const match of code.matchAll(CATALOG_DEFINITION)) definitions.set(match[1], match[2]);
    }
    for (const match of code.matchAll(STRING_CONSTANT)) {
      if (!constants.has(match[1])) constants.set(match[1], new Set());
      constants.get(match[1]).add(match[3]);
    }
  }
  return { catalog, definitions, constants };
}

/** 把 id 的原文解析成字符串；读不出来返回 undefined。 */
export function resolveId(expression, tables) {
  const literal = /^(["'`])([^"'`$\n]+)\1$/.exec(expression);
  if (literal) return literal[2];
  const entry = /^ACTSPACE_SERVICE_(IDS|DEFINITIONS)\.(\w+)$/.exec(expression);
  if (entry) return tables.catalog.get(entry[1] === "IDS" ? entry[2] : tables.definitions.get(entry[2]));
  const values = /^[A-Z][A-Z0-9_]*$/.test(expression) ? tables.constants.get(expression) : undefined;
  return values?.size === 1 ? [...values][0] : undefined;
}

/**
 * @param {{ path: string, text: string }[]} sources `path` 相对仓库根目录，用 `/` 分隔
 * @param {{ file: string, rule: string, count: number }[]} allowed
 */
export function auditServiceAccess(sources, allowed = ALLOWED) {
  const tables = collectIdTables(sources);
  const errors = [];
  const typedIds = new Set();
  const idsByName = new Map();
  const views = [];
  for (const { path: file, text } of sources) {
    for (const declaration of findKeyDeclarations(text)) {
      const id = resolveId(declaration.id, tables);
      if (id === undefined) { errors.push(`${file}:${declaration.line} 读不出这个定义的 id（${declaration.id}）`); continue; }
      typedIds.add(id);
      if (declaration.name !== "") idsByName.set(declaration.name, (idsByName.get(declaration.name) ?? new Set()).add(id));
      if (declaration.kind === "serviceView") views.push({ file, ...declaration });
    }
  }
  const idOf = (name) => (idsByName.get(name)?.size === 1 ? [...idsByName.get(name)][0] : undefined);

  const rows = findConformanceRows(sources.find((source) => source.path === VIEWS_FILE)?.text ?? "");
  for (const view of views) {
    if (view.name === "") errors.push(`${view.file}:${view.line} serviceView 要先声明成导出的常量`);
    else if (!view.exported) errors.push(`${view.file}:${view.line} 视图 ${view.name} 没有导出`);
    else if (!rows.some((row) => row.view === view.name)) errors.push(`${view.file}:${view.line} 视图 ${view.name} 在 ${VIEWS_FILE} 里没有对照行`);
  }
  for (const row of rows) {
    const [viewId, providerId] = [idOf(row.view), idOf(row.provider)];
    if (viewId === undefined || providerId === undefined) errors.push(`${VIEWS_FILE}:${row.line} 读不出这一行两边的定义（${row.view} 和 ${row.provider || "真实服务"}）`);
    else if (viewId !== providerId) errors.push(`${VIEWS_FILE}:${row.line} 视图 ${row.view} 的 id 是 ${viewId}，对照的 ${row.provider} 却是 ${providerId}`);
  }

  const found = new Map();
  const add = (file, rule, line, detail = "") => {
    const key = `${file}\n${rule}`;
    if (!found.has(key)) found.set(key, []);
    found.get(key).push({ line, detail });
  };
  for (const { path: file, text } of sources) {
    for (const line of findLookupCasts(text)) add(file, "cast", line);
    for (const line of findLeaseCalls(text)) add(file, "lease", line);
    for (const provide of findRawProvides(text)) {
      const id = resolveId(provide.id, tables);
      if (id !== undefined && typedIds.has(id)) add(file, "raw-provide", provide.line, ` ${id}`);
    }
  }

  const limits = new Map(allowed.map((entry) => [`${entry.file}\n${entry.rule}`, entry.count]));
  for (const key of [...new Set([...found.keys(), ...limits.keys()])].sort()) {
    const [file, rule] = key.split("\n");
    const hits = found.get(key) ?? [];
    const limit = limits.get(key);
    const what = RULE_TEXT[rule] ?? rule;
    if (limit === undefined) {
      for (const hit of hits) errors.push(`${file}:${hit.line} ${what}${hit.detail}`);
    } else if (hits.length > limit) {
      errors.push(`${file}：${what}的有 ${hits.length} 处（第 ${hits.map((hit) => hit.line).join("、")} 行），清单只允许 ${limit} 处`);
    } else if (hits.length < limit) {
      errors.push(`${file}：清单记了 ${limit} 处「${what}」，现在只有 ${hits.length} 处，请同步修改 ALLOWED`);
    }
  }
  return errors.sort();
}

function isSourceFile(name) {
  return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(name) && !/\.d\.[cm]?ts$/.test(name) && !/\.(test|spec|bench|perf)\.[cm]?[jt]sx?$/.test(name);
}

function readSources(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(full); continue; }
      if (!entry.isFile() || !isSourceFile(entry.name)) continue;
      out.push({ path: path.relative(root, full).split(path.sep).join("/"), text: fs.readFileSync(full, "utf8") });
    }
  };
  for (const base of ROOTS) if (fs.existsSync(path.join(root, base))) walk(path.join(root, base));
  return out;
}

export function runCheck(root = repoRoot, allowed = ALLOWED) {
  const sources = readSources(root);
  return { files: sources.length, errors: auditServiceAccess(sources, allowed) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, errors } = runCheck();
  if (errors.length > 0) {
    console.error(`服务取用检查失败（${errors.length} 处）：`);
    for (const error of errors) console.error(`  - ${error}`);
    console.error("取用和注册服务的写法见 packages/composition/cordis-adapter/src/service-access.ts：按定义取（getService / requireService / getLeasedService），按定义注册（provideService）。");
    console.error("确实要保留的，把文件记进 scripts/check-service-access.mjs 的 ALLOWED，写明理由。");
    process.exit(1);
  }
  console.log(`服务取用检查通过：检查了 ${files} 个文件。`);
}
