// 核心事件写入检查：Session 日志里归 core 所有的事件（来源是 "@actspace/core"）只从 `coreEvent` 写。
// `coreEvent(type, data)` 和它用来检查事件名、`data` 的那张表 `CoreEventDataMap`，都在
// packages/util/shared/src/runtime-v2/core-events.ts，从 shared 包的 runtime-v2 入口引入。
// 各处自己拼 `{ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface }` 时不经过这张表，
// 事件名写错、字段名写错、少了必填字段，都要到运行时才由 codec 拒绝。
// 扫描 packages/、apps/ 的 TypeScript 源码（不含测试和构建产物），找「只有 ownerPluginId 一个字段、值是 core」的对象：
//   { ownerPluginId: "@actspace/core" }     { ownerPluginId: CORE_EVENT_OWNER }
// 这是事件来源（`source`）的写法。codec 声明、提示词贡献者也有 `ownerPluginId`，但和别的字段写在同一个对象里，不算。
// 只查 TypeScript：这条规则守的是编译期的类型，纯 JS 的验证脚本和基准脚本用不上。
// 只按文本匹配，整行都是注释的不算。认不出的：core 的名字先存进别的常量再用；来源对象是展开或拼出来的。
// 可以保留的文件和处数记在下面的 ALLOWED 里，每条写明理由。处数对不上就失败：
// 多了说明新增了手写的事件；少了说明清单过期，要同步改掉，免得空出来的名额被新的手写事件占用。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["packages", "apps"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-electron",
  "build",
  "out",
  "coverage",
  "test",
  "tests",
  "__tests__",
  "fixtures",
]);

export const ALLOWED = [
  {
    file: "packages/util/shared/src/runtime-v2/core-events.ts",
    count: 1,
    reason: "`coreEvent` 的实现：core 的来源只在这里写一次。",
  },
  {
    file: "packages/session/session-journal/src/testing.ts",
    count: 1,
    reason:
      "给规模测试生成合成会话的辅助函数，直接往 Journal 里写；事件只带规模测试用得到的几个字段，不是 `CoreEventDataMap` 里的完整形状。",
  },
  {
    file: "apps/desktop/src/renderer/mock/mock-db.ts",
    count: 1,
    reason: "浏览器 mock 拼的是已经落盘的事件信封（带 seq 和时间），不是待写入的事件。",
  },
];

const CORE_SOURCE = /\{\s*ownerPluginId\s*:\s*(?:(["'`])@actspace\/core\1|CORE_EVENT_OWNER)\s*,?\s*\}/g;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

/** 整行注释换成空行，行号不变。 */
function withoutCommentLines(text) {
  return text
    .split("\n")
    .map((line) => (COMMENT_LINE.test(line) ? "" : line))
    .join("\n");
}

function lineOf(text, index) {
  let line = 1;
  for (let at = text.indexOf("\n"); at !== -1 && at < index; at = text.indexOf("\n", at + 1)) line += 1;
  return line;
}

/** 返回源码里手写 core 事件来源的行号，一处一个；对象跨行时取左花括号所在的行。 */
export function findCoreEventSources(text) {
  const code = withoutCommentLines(text);
  return [...code.matchAll(CORE_SOURCE)].map((match) => lineOf(code, match.index));
}

/**
 * @param {{ path: string, text: string }[]} sources `path` 相对仓库根目录，用 `/` 分隔
 * @param {{ file: string, count: number }[]} allowed
 */
export function auditCoreEventWrites(sources, allowed) {
  const limits = new Map(allowed.map((entry) => [entry.file, entry.count]));
  const found = new Map();
  for (const { path: file, text } of sources) {
    const lines = findCoreEventSources(text);
    if (lines.length > 0) found.set(file, lines);
  }
  const errors = [];
  for (const file of [...new Set([...found.keys(), ...limits.keys()])].sort()) {
    const lines = found.get(file) ?? [];
    const limit = limits.get(file);
    if (limit === undefined) {
      for (const line of lines) errors.push(`${file}:${line} 手写了 core 的事件来源`);
    } else if (lines.length > limit) {
      errors.push(
        `${file}：手写 core 事件来源的有 ${lines.length} 处（第 ${lines.join("、")} 行），清单只允许 ${limit} 处`,
      );
    } else if (lines.length < limit) {
      errors.push(`${file}：清单记了 ${limit} 处，现在只有 ${lines.length} 处，请同步修改 ALLOWED`);
    }
  }
  return errors;
}

function isSourceFile(name) {
  return (
    /\.(ts|tsx|mts|cts)$/.test(name) &&
    !/\.d\.[cm]?ts$/.test(name) &&
    !/\.(test|spec|bench|perf)\.[cm]?tsx?$/.test(name)
  );
}

function readSources(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (!entry.isFile() || !isSourceFile(entry.name)) continue;
      out.push({ path: path.relative(root, full).split(path.sep).join("/"), text: fs.readFileSync(full, "utf8") });
    }
  };
  for (const base of ROOTS) if (fs.existsSync(path.join(root, base))) walk(path.join(root, base));
  return out;
}

export function runCheck(root = repoRoot, allowed = ALLOWED) {
  const sources = readSources(root);
  return { files: sources.length, errors: auditCoreEventWrites(sources, allowed) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, errors } = runCheck();
  if (errors.length > 0) {
    console.error(`核心事件写入检查失败（${errors.length} 处）：`);
    for (const error of errors) console.error(`  - ${error}`);
    console.error(
      "归 core 所有的事件用 coreEvent(type, data) 写，新事件或新字段先加进 CoreEventDataMap；两者都在 packages/util/shared/src/runtime-v2/core-events.ts。",
    );
    console.error("写的不是待写入的事件的，把文件记进 scripts/check-core-event-writes.mjs 的 ALLOWED，写明理由。");
    process.exit(1);
  }
  console.log(`核心事件写入检查通过：检查了 ${files} 个文件。`);
}
