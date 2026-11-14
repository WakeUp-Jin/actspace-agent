// 规模测试覆盖检查（docs/coding-standards/perf-memory-conventions.md §8）。
// 清单 scripts/scale-test-coverage.json 记两类东西：
//   entries  高频路径的入口文件 → 它的 `*.scale.test.ts`（1k 与 10k 事件会话上读取量相同的测试）；
//   pending  已知会整份读日志、但还没有规模测试的文件 → 为什么还没有（backlog 项或「低频」理由）。
// 失败的情况：
//   1. entries 里的源文件或测试文件不存在，测试文件名不是 `*.scale.test.ts`；
//   2. 规模测试不符合写法：没有同时比较 1k 和 10k、没有用读取计数（`@actspace/session-journal/testing`
//      或对 `@actspace/session-journal` 的计数 mock），或者断言了时间（`performance.now()` / `Date.now()` / `hrtime`）；
//   3. 仓库里有 `*.scale.test.ts` 没登记在 entries 里（清单要是规模测试的索引）；
//   4. hot-path-reads 基线里还有整份读日志写法的文件，既不在 entries 也不在 pending 里；
//   5. pending 里的文件已经有 entries，或者 hot-path-reads 基线里已经没有它的整份读写法（该从 pending 删掉）。
// 新增高频路径入口：补一个 entry 和对应的规模测试。确实做不了规模测试的，写进 pending 并说明原因。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBaseline } from "./check-hot-path-reads.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_PATH = path.join(repoRoot, "scripts/scale-test-coverage.json");
const ROOTS = ["packages", "apps"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out"]);

/** hot-path-reads 里「整份读日志」的规则；深拷贝规则另算，不要求规模测试。 */
export const JOURNAL_READ_RULES = ["full-iterate", "full-read", "journal-events", "inspect-events", "per-entry-read"];

const SCALE_TEST = /\.scale\.test\.[cm]?tsx?$/;
const COUNTING_IMPORT = /@actspace\/session-journal\/testing|vi\.mock\(\s*["']@actspace\/session-journal["']/;
const SMALL_SCALE = /\b1[_,]?000\b/;
const LARGE_SCALE = /\b10[_,]?000\b/;
const TIMING = /\bperformance\.now\(|\bDate\.now\(|\bhrtime\b/;
const ALLOW = /perf-allow:\s*\S/;

export function loadManifest(manifestPath = MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

/** 一份规模测试源码的问题列表（空数组 = 合格）。 */
export function checkScaleTestSource(source) {
  const problems = [];
  if (!SMALL_SCALE.test(source) || !LARGE_SCALE.test(source))
    problems.push("没有同时在 1k 和 10k 事件的会话上跑同一个操作");
  if (!COUNTING_IMPORT.test(source))
    problems.push(
      "没有用读取计数（@actspace/session-journal/testing 的 countingHistory / syntheticJournal，或对 @actspace/session-journal 的计数 mock）",
    );
  const timed = source
    .split("\n")
    .some(
      (line, index, lines) => TIMING.test(line) && !ALLOW.test(line) && !(index > 0 && ALLOW.test(lines[index - 1])),
    );
  if (timed) problems.push("断言或使用了时间（performance.now / Date.now / hrtime）；规模测试只计数，不计时");
  return problems;
}

/** 仓库里所有 `*.scale.test.ts` 的相对路径。 */
export function findScaleTests(root = repoRoot) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (SCALE_TEST.test(entry.name)) found.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  for (const base of ROOTS) if (fs.existsSync(path.join(root, base))) walk(path.join(root, base));
  return found.sort();
}

/** 基线里带「整份读日志」规则的文件。 */
export function journalReadingFiles(baseline) {
  return Object.keys(baseline)
    .filter((file) => JOURNAL_READ_RULES.some((rule) => (baseline[file][rule] ?? 0) > 0))
    .sort();
}

/**
 * 核对清单 → 问题列表。`readFile(relative)` 返回源码或 null（不存在）。
 * `scaleTests` 是仓库里实际存在的规模测试，`baseline` 是 hot-path-reads 的基线。
 */
export function checkCoverage(manifest, { readFile, scaleTests, baseline }) {
  const problems = [];
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const pending = manifest.pending && typeof manifest.pending === "object" ? manifest.pending : {};
  const covered = new Set();
  const registeredTests = new Set();
  for (const entry of entries) {
    if (typeof entry.source !== "string" || !Array.isArray(entry.tests) || entry.tests.length === 0) {
      problems.push(`entries 里有一项缺 source 或 tests：${JSON.stringify(entry)}`);
      continue;
    }
    if (readFile(entry.source) === null) problems.push(`${entry.source}：entries 里的源文件不存在`);
    covered.add(entry.source);
    for (const test of entry.tests) {
      registeredTests.add(test);
      if (!SCALE_TEST.test(test)) {
        problems.push(`${test}：规模测试的文件名要以 .scale.test.ts 结尾`);
        continue;
      }
      const source = readFile(test);
      if (source === null) {
        problems.push(`${test}：entries 里的规模测试不存在`);
        continue;
      }
      for (const problem of checkScaleTestSource(source)) problems.push(`${test}：${problem}`);
    }
  }
  for (const test of scaleTests)
    if (!registeredTests.has(test))
      problems.push(`${test}：规模测试没有登记在 scripts/scale-test-coverage.json 的 entries 里`);
  const reading = journalReadingFiles(baseline);
  for (const file of reading) {
    if (covered.has(file) || file in pending) continue;
    problems.push(
      `${file}：hot-path-reads 基线里还有整份读日志的写法，但没有规模测试。补一个 entry 和 *.scale.test.ts；确实低频就写进 pending 并说明原因`,
    );
  }
  for (const [file, reason] of Object.entries(pending)) {
    if (typeof reason !== "string" || !reason.trim()) problems.push(`${file}：pending 要写明还没有规模测试的原因`);
    if (covered.has(file)) problems.push(`${file}：已经有规模测试，从 pending 删掉`);
    else if (!reading.includes(file))
      problems.push(`${file}：hot-path-reads 基线里已经没有它的整份读写法，从 pending 删掉`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = loadManifest();
  const problems = checkCoverage(manifest, {
    readFile: (relative) => {
      const full = path.join(repoRoot, relative);
      return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    },
    scaleTests: findScaleTests(),
    baseline: loadBaseline(),
  });
  if (problems.length) {
    console.error("规模测试覆盖检查失败（docs/coding-standards/perf-memory-conventions.md §8）：");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `规模测试覆盖检查通过（${manifest.entries.length} 个入口，${Object.keys(manifest.pending ?? {}).length} 个待补）`,
  );
}
