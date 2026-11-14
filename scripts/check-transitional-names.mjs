// 过渡期命名检查：v1 Runtime 退役之后只剩一套 Runtime，标识符不再带 `RuntimeV2` 这类版本后缀。
// 旧名字仍然是合法的标识符，过期分支合并进来、或者照着旧代码再写一处，编译器在别的文件里才报错，这里先拦住。
//
// 查两类名字：
//   1. 含 `RuntimeV2` / `runtimeV2` / `RUNTIME_V2` 的标识符，例如 `RuntimeV2JsonValue`、`bootDesktopRuntimeV2`、
//      `RUNTIME_V2_FIXED_RENDERER_CHANNELS`；
//   2. RENAMES 里逐个列出的名字。
// 不查的：
//   - `runtime-v2` 这个目录名、文件名和引入路径（`@actspace/shared/runtime-v2`），IPC channel（`runtime-v2:*`），
//     契约 id（`actspace.runtime.v2`），落盘目录（`sessions-v2`）。这些是落盘或跨进程可见的字符串，不跟着标识符改；
//   - 设置和 Session 事件的格式版本（`SettingsV4`、`AppSettingsV2`、`SessionEventEnvelopeV1` 等），它们是真实的版本号；
//   - 说的是旧数据和迁移的 `legacy*`（`migrateLegacyRemoteModels`、`legacyCallArgs` 等）。
// 扫描 apps/、packages/、scripts/、browser-bridge/ 下的 TypeScript 和 JavaScript 源码，含测试，不含构建产物。
// 只按文本找「整个标识符」，不区分代码、注释和字符串：注释和字符串里写旧名字也会报。
// 确实要保留的记在下面的 ALLOWED 里，按「文件、名字、处数」记，每条写明理由；处数多了少了都失败。
//
// 加 `--write` 按同一张表直接改名（跳过 ALLOWED 里的）。分支落后于改名的提交时，合并之后跑一次，再跑 `pnpm typecheck`。
// `--write` 后面可以跟路径，只改这些文件或目录，这时 Markdown 也改：
//   node scripts/check-transitional-names.mjs --write docs/design-docs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["apps", "packages", "scripts", "browser-bridge"];
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", "build", "out", "coverage", "release"]);
/** 这份脚本和它的用例要把旧名字写出来。 */
const SELF = new Set(["scripts/check-transitional-names.mjs", "scripts/test/transitional-names-check.test.mjs"]);

/** 名字里的这三段去掉 `V2`，其余不动。 */
const FAMILY = [
  ["RuntimeV2", "Runtime"],
  ["runtimeV2", "runtime"],
  ["RUNTIME_V2", "RUNTIME"],
];

/** 整个名字照这张表改；不在表里的再按 FAMILY 改。 */
export const RENAMES = new Map([
  // 只去掉 `V2` 会变成 `RuntimeRuntimeState`。它是 `RuntimeStateController.view()` 给出的只读视图。
  ["RuntimeV2RuntimeState", "RuntimeStateView"],
  // 只去掉 `V2` 会和 `@actspace/runtime/loader` 导出的 `loadRuntime` 重名，CLI 的这个函数正是包着它的。
  ["loadRuntimeV2", "loadRuntimeModule"],
  // CLI 里的 `V2` 不挨着 `Runtime`，上面的规则认不出。
  ["runV2Command", "runCommand"],
  ["RunV2Io", "RunIo"],
  ["bootCliV2", "bootCli"],
  ["CliV2ApprovalBroker", "CliApprovalBroker"],
]);

export const ALLOWED = [
  {
    file: "browser-bridge/test-fixtures/acceptance/agent-approval-smoke.cjs",
    name: "APPROVED_BY_RUNTIME_V2",
    count: 3,
    reason: "验收脚本填进页面输入框、再从页面读回来比对的一段文本，不是标识符。",
  },
];

const WORD = "[A-Za-z0-9_$]";
const CANDIDATE = new RegExp(
  `(?<!${WORD})(?:${WORD}*(?:${FAMILY.map(([from]) => from).join("|")})${WORD}*|${[...RENAMES.keys()].join("|")})(?!${WORD})`,
  "g",
);

/** 旧名字该改成什么；不是旧名字返回 `null`。 */
export function replacementFor(name) {
  const exact = RENAMES.get(name);
  if (exact !== undefined) return exact;
  let next = name;
  for (const [from, to] of FAMILY) next = next.split(from).join(to);
  return next === name ? null : next;
}

function lineOf(text, index) {
  let line = 1;
  for (let at = text.indexOf("\n"); at !== -1 && at < index; at = text.indexOf("\n", at + 1)) line += 1;
  return line;
}

/** 返回文本里的旧名字，一处一个：`{ name, line, replacement }`。 */
export function findTransitionalNames(text) {
  const found = [];
  for (const match of text.matchAll(CANDIDATE)) {
    const replacement = replacementFor(match[0]);
    if (replacement !== null) found.push({ name: match[0], line: lineOf(text, match.index), replacement });
  }
  return found;
}

/** 把文本里的旧名字换成新名字；`keep` 里的名字不动。 */
export function renameTransitionalNames(text, keep = new Set()) {
  return text.replace(CANDIDATE, (name) => (keep.has(name) ? name : (replacementFor(name) ?? name)));
}

function keptNames(file, allowed) {
  return new Set(allowed.filter((entry) => entry.file === file).map((entry) => entry.name));
}

/**
 * @param {{ path: string, text: string }[]} sources `path` 相对仓库根目录，用 `/` 分隔
 * @param {{ file: string, name: string, count: number }[]} allowed
 */
export function auditTransitionalNames(sources, allowed) {
  const key = (file, name) => `${file}\n${name}`;
  const limits = new Map(allowed.map((entry) => [key(entry.file, entry.name), entry.count]));
  const counts = new Map();
  const errors = [];
  for (const { path: file, text } of [...sources].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    for (const { name, line, replacement } of findTransitionalNames(text)) {
      const id = key(file, name);
      if (limits.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
      else errors.push(`${file}:${line} ${name} 是过渡期的名字，改成 ${replacement}`);
    }
  }
  for (const { file, name, count } of allowed) {
    const actual = counts.get(key(file, name)) ?? 0;
    if (actual > count) errors.push(`${file}：${name} 有 ${actual} 处，清单只允许 ${count} 处`);
    else if (actual < count) errors.push(`${file}：清单记了 ${count} 处 ${name}，现在只有 ${actual} 处，请同步修改 ALLOWED`);
  }
  return errors;
}

function isSourceFile(name) {
  return /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(name);
}

function isTextFile(name) {
  return isSourceFile(name) || name.endsWith(".md");
}

function addFile(start, accept, out) {
  const file = start.split(path.sep).join("/");
  if (accept(path.basename(start)) && !SELF.has(file)) out.push(file);
}

function walk(root, dir, accept, out) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(root, next, accept, out); continue; }
    if (entry.isFile()) addFile(next, accept, out);
  }
}

/** `targets` 为空时列出四个根目录下的源码；否则列出这些文件和目录里的源码和 Markdown，路径相对 `root`。 */
function listFiles(root, targets) {
  const out = [];
  for (const base of targets.length === 0 ? ROOTS : []) if (fs.existsSync(path.join(root, base))) walk(root, base, isSourceFile, out);
  for (const target of targets) {
    const start = path.relative(root, path.resolve(root, target));
    if (start === "") throw new Error("不能整个仓库一起改：历史记录里的旧名字要保留。请给出具体的文件或目录");
    if (start.startsWith("..") || path.isAbsolute(start)) throw new Error(`${target} 不在仓库里`);
    const stat = fs.statSync(path.join(root, start), { throwIfNoEntry: false });
    if (stat === undefined) throw new Error(`找不到 ${target}`);
    if (stat.isDirectory()) walk(root, start, isTextFile, out);
    else addFile(start, isTextFile, out);
  }
  return [...new Set(out)].sort();
}

export function runCheck(root = repoRoot, allowed = ALLOWED) {
  const sources = listFiles(root, []).map((file) => ({ path: file, text: fs.readFileSync(path.join(root, file), "utf8") }));
  return { files: sources.length, errors: auditTransitionalNames(sources, allowed) };
}

/** 直接改名，返回改到的文件。`targets` 为空时改 `runCheck` 扫描的那些文件；不为空时路径相对 `root`，找不到就抛错。 */
export function runWrite(root = repoRoot, allowed = ALLOWED, targets = []) {
  const changed = [];
  for (const file of listFiles(root, targets)) {
    const full = path.join(root, file);
    const text = fs.readFileSync(full, "utf8");
    const next = renameTransitionalNames(text, keptNames(file, allowed));
    if (next === text) continue;
    fs.writeFileSync(full, next);
    changed.push(file);
  }
  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === "--write") {
    const changed = runWrite(repoRoot, ALLOWED, args.slice(1).map((target) => path.resolve(target)));
    for (const file of changed) console.log(file);
    console.log(`过渡期命名：改了 ${changed.length} 个文件。接着跑 pnpm typecheck。`);
  } else {
    const { files, errors } = runCheck();
    if (errors.length > 0) {
      console.error(`过渡期命名检查失败（${errors.length} 处）：`);
      for (const error of errors) console.error(`  - ${error}`);
      console.error("这些名字已经改掉。运行 node scripts/check-transitional-names.mjs --write 按同一张表改名，再跑 pnpm typecheck。");
      console.error("确实要保留的，记进 scripts/check-transitional-names.mjs 的 ALLOWED，写明理由。");
      process.exit(1);
    }
    console.log(`过渡期命名检查通过：检查了 ${files} 个文件。`);
  }
}
