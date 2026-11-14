// 高频路径读写检查（docs/coding-standards/perf-memory-conventions.md §2、§3、§8）。
// 扫描 packages/ 和 apps/ 的产品代码（不含测试），找出几种「工作量随会话长度增长」或「整份深拷贝」的写法：
//   full-iterate        journal.iterateEvents() 不带范围，遍历整份日志
//   full-read           journal.readEvents() 不带范围，读出整份日志
//   journal-events      journal.events，读出整份日志的兼容入口
//   inspect-events      inspectSessionEvents(id)，读出整个会话的全部事件
//   per-entry-read      readEvents(x, x + 1)，为找几条事件逐条读（在循环里就是逐条从文件解析）
//   json-roundtrip      JSON.parse(JSON.stringify(x))，整份深拷贝
//   structured-clone    structuredClone(x)，整份深拷贝
// 已有的出现次数记在 scripts/hot-path-reads-baseline.json（按文件、按规则）。超过基线就失败：
// 新代码不要这样写；确实在低频路径上（打开会话、导出、恢复、用户点一次的操作），在同一行或上一行写
// `perf-allow: <理由>` 注释，就不计数。改掉旧写法后基线变小，运行时会提示可以更新基线。
// 按整份源码匹配，不按行：一次调用被格式化工具折成几行（括号后换行、末尾补逗号）照样认得出来。
// 折成几行的调用，「同一行」指调用开头到匹配结束之间的任意一行；注释写在调用的上一行最稳妥。
// 更新基线：node scripts/check-hot-path-reads.mjs --update-baseline（只在确实删掉了旧写法时用）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BASELINE_PATH = path.join(repoRoot, "scripts/hot-path-reads-baseline.json");
const ROOTS = ["packages", "apps"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "test",
  "tests",
  "__tests__",
  "testing",
  "fixtures",
  "mock",
  "mocks",
  "e2e",
]);

export const RULES = [
  { id: "full-iterate", pattern: /\.iterateEvents\(\s*\)/g },
  { id: "full-read", pattern: /\.readEvents\(\s*\)/g },
  { id: "journal-events", pattern: /\bjournal\.events(?![\w$(])/g },
  // 方法定义和接口声明（参数带类型标注）不算调用。
  { id: "inspect-events", pattern: /\binspectSessionEvents\((?!\s*[\w$]+\s*:)/g },
  { id: "per-entry-read", pattern: /\breadEvents\(\s*([\w$.]+)\s*,\s*\1\s*\+\s*1\s*,?\s*\)/g },
  { id: "json-roundtrip", pattern: /JSON\.parse\(\s*JSON\.stringify\(/g },
  { id: "structured-clone", pattern: /\bstructuredClone\(/g },
];

const ALLOW = /perf-allow:\s*\S/;

/** 一个文件的源码 → { 规则: 次数 }。匹配到的那几行或开头的上一行带 `perf-allow: 理由` 的不计。 */
export function countSource(source) {
  const lines = source.split("\n");
  const allowed = lines.map((line) => ALLOW.test(line));
  const lineStarts = [0];
  for (const line of lines) lineStarts.push(lineStarts.at(-1) + line.length + 1);
  /** 第几行（从 0 起）包含源码的第 `offset` 个字符。 */
  const lineAt = (offset) => {
    let low = 0;
    let high = lines.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (lineStarts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  };
  const counts = {};
  for (const rule of RULES) {
    for (const match of source.matchAll(rule.pattern)) {
      const first = lineAt(match.index);
      const last = lineAt(match.index + match[0].length - 1);
      if (allowed.slice(Math.max(0, first - 1), last + 1).includes(true)) continue;
      counts[rule.id] = (counts[rule.id] ?? 0) + 1;
    }
  }
  return counts;
}

function isSourceFile(name) {
  return (
    /\.(ts|tsx|mts|cts)$/.test(name) &&
    !name.endsWith(".d.ts") &&
    !/\.(test|spec|bench|perf)\.[cm]?tsx?$/.test(name) &&
    !/^testing\.tsx?$/.test(name)
  );
}

/** 扫描整个仓库 → { "相对路径": { 规则: 次数 } }，只记有出现的文件。 */
export function collectCounts(root = repoRoot) {
  const result = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (!isSourceFile(entry.name)) continue;
      const counts = countSource(fs.readFileSync(full, "utf8"));
      if (Object.keys(counts).length) result[path.relative(root, full).split(path.sep).join("/")] = counts;
    }
  };
  for (const base of ROOTS) if (fs.existsSync(path.join(root, base))) walk(path.join(root, base));
  return result;
}

/** 和基线比较 → { problems: 超出基线（失败）, notices: 少于基线（可以收紧） }。 */
export function compareWithBaseline(counts, baseline) {
  const problems = [];
  const notices = [];
  const files = new Set([...Object.keys(counts), ...Object.keys(baseline)]);
  for (const file of [...files].sort()) {
    const now = counts[file] ?? {};
    const allowed = baseline[file] ?? {};
    for (const rule of RULES.map((item) => item.id)) {
      const current = now[rule] ?? 0;
      const limit = allowed[rule] ?? 0;
      if (current > limit) problems.push(`${file}：${rule} 有 ${current} 处，基线 ${limit}`);
      else if (current < limit)
        notices.push(`${file}：${rule} 从 ${limit} 降到 ${current}，可以运行 --update-baseline 收紧基线`);
    }
  }
  return { problems, notices };
}

export function loadBaseline(baselinePath = BASELINE_PATH) {
  return fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : {};
}

function sortedBaseline(counts) {
  return Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((file) => [file, Object.fromEntries(Object.entries(counts[file]).sort())]),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const counts = collectCounts();
  if (process.argv.includes("--update-baseline")) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(sortedBaseline(counts), null, 2)}\n`);
    console.log(`已写入基线 ${path.relative(repoRoot, BASELINE_PATH)}（${Object.keys(counts).length} 个文件）`);
  } else {
    const { problems, notices } = compareWithBaseline(counts, loadBaseline());
    for (const notice of notices) console.log(`提示：${notice}`);
    if (problems.length) {
      console.error("高频路径读写检查失败：新增了整份读日志或整份深拷贝的写法。");
      console.error(
        "改成增量读 / 引用已有视图（docs/coding-standards/perf-memory-conventions.md）；确实在低频路径上，就在同一行或上一行写 `perf-allow: 理由`。",
      );
      for (const problem of problems) console.error(`  ${problem}`);
      process.exit(1);
    }
    console.log("高频路径读写检查通过");
  }
}
