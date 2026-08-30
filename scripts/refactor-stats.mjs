#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  countNonWhitespaceCharacters,
  countPhysicalLines,
  isDocsFile,
  isSourceFile,
  isTestFile,
} from "./repo-stats.mjs";

const execFileAsync = promisify(execFile);
const DATA_MARKER = "refactor-stats-data";
const GENERATED_REPORT_PATTERN = /^docs\/exec-runs\/[^/]+\/refactor-stats-(?:before|after)\.md$/u;

const LANGUAGE_NAMES = new Map([
  [".astro", "Astro"],
  [".c", "C"],
  [".cc", "C++"],
  [".cjs", "JavaScript"],
  [".cpp", "C++"],
  [".css", "CSS"],
  [".go", "Go"],
  [".html", "HTML"],
  [".java", "Java"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".mjs", "JavaScript"],
  [".py", "Python"],
  [".rs", "Rust"],
  [".sh", "Shell"],
  [".svelte", "Svelte"],
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".vue", "Vue"],
]);

function emptyMetrics() {
  return {
    sourceFiles: 0,
    sourceLines: 0,
    testFiles: 0,
    testLines: 0,
    docsFiles: 0,
    docsCharacters: 0,
  };
}

function addMetric(target, key, value = 1) {
  target[key] += value;
}

function getBucket(record, key) {
  record[key] ??= emptyMetrics();
  return record[key];
}

function languageFor(filePath) {
  return LANGUAGE_NAMES.get(extname(filePath).toLowerCase()) ?? "Other";
}

function areaFor(filePath) {
  const parts = filePath.replaceAll("\\", "/").split("/");
  if ((parts[0] === "apps" || parts[0] === "packages" || parts[0] === "plugins") && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts.length > 1 ? parts[0] : "(root)";
}

function sortRecord(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

export function validatePlanSlug(plan) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(plan)) {
    throw new Error("--plan 只能包含小写字母、数字和连字符");
  }
  return plan;
}

export function parseCliArgs(argv) {
  const slot = argv[0];
  if (slot !== "before" && slot !== "after") {
    throw new Error("用法: pnpm refactor:stats <before|after> --plan <plan-slug> [--force]");
  }

  let plan;
  let force = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--plan") {
      plan = argv[index + 1];
      index += 1;
    } else if (argument === "--force") {
      force = true;
    } else {
      throw new Error(`未知参数: ${argument}`);
    }
  }

  if (!plan) throw new Error("缺少 --plan <plan-slug>");
  return { slot, plan: validatePlanSlug(plan), force };
}

export function shouldCountFile(filePath) {
  return !GENERATED_REPORT_PATTERN.test(filePath.replaceAll("\\", "/"));
}

export async function collectRefactorStats({ repoRoot, files }) {
  const totals = emptyMetrics();
  const areas = {};
  const languages = {};

  for (const filePath of files) {
    if (!shouldCountFile(filePath)) continue;

    const source = isSourceFile(filePath);
    const test = isTestFile(filePath);
    const docs = isDocsFile(filePath);
    if (!source && !test && !docs) continue;

    let contents;
    try {
      contents = await readFile(resolve(repoRoot, filePath), "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    const area = getBucket(areas, areaFor(filePath));
    if (source || test) {
      const language = getBucket(languages, languageFor(filePath));
      const lines = countPhysicalLines(contents);
      const fileKey = test ? "testFiles" : "sourceFiles";
      const lineKey = test ? "testLines" : "sourceLines";
      for (const bucket of [totals, area, language]) {
        addMetric(bucket, fileKey);
        addMetric(bucket, lineKey, lines);
      }
    }

    if (docs) {
      const characters = countNonWhitespaceCharacters(contents);
      for (const bucket of [totals, area]) {
        addMetric(bucket, "docsFiles");
        addMetric(bucket, "docsCharacters", characters);
      }
    }
  }

  return {
    totals,
    areas: sortRecord(areas),
    languages: sortRecord(languages),
  };
}

async function git(repoRoot, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function listRepositoryFiles(repoRoot) {
  const stdout = await git(repoRoot, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  return stdout.split("\0").filter(Boolean);
}

async function collectGitState(repoRoot) {
  const [commit, branch, status] = await Promise.all([
    git(repoRoot, ["rev-parse", "HEAD"]),
    git(repoRoot, ["branch", "--show-current"]),
    git(repoRoot, ["status", "--short", "--untracked-files=normal"]),
  ]);
  const statusLines = status.split("\n").filter(Boolean);
  return {
    commit: commit.trim(),
    branch: branch.trim() || "(detached)",
    dirty: statusLines.length > 0,
    changedEntries: statusLines.length,
    untrackedEntries: statusLines.filter((line) => line.startsWith("??")).length,
  };
}

async function collectGitDiff(repoRoot, beforeCommit) {
  const [numstat, names] = await Promise.all([
    git(repoRoot, ["diff", "--numstat", "--find-renames", beforeCommit, "--", "."]),
    git(repoRoot, ["diff", "--name-status", "--find-renames", beforeCommit, "--", "."]),
  ]);

  let addedLines = 0;
  let deletedLines = 0;
  for (const line of numstat.split("\n").filter(Boolean)) {
    const [added, deleted] = line.split("\t");
    if (added !== "-") addedLines += Number.parseInt(added, 10);
    if (deleted !== "-") deletedLines += Number.parseInt(deleted, 10);
  }

  const result = { changedFiles: 0, addedFiles: 0, deletedFiles: 0, renamedFiles: 0, addedLines, deletedLines };
  for (const line of names.split("\n").filter(Boolean)) {
    result.changedFiles += 1;
    const status = line.split("\t", 1)[0];
    if (status === "A") result.addedFiles += 1;
    else if (status === "D") result.deletedFiles += 1;
    else if (status.startsWith("R")) result.renamedFiles += 1;
  }
  return result;
}

async function createSnapshot({ repoRoot, plan, slot }) {
  const [gitState, files] = await Promise.all([
    collectGitState(repoRoot),
    listRepositoryFiles(repoRoot),
  ]);
  return {
    schemaVersion: 1,
    plan,
    slot,
    generatedAt: new Date().toISOString(),
    git: gitState,
    metrics: await collectRefactorStats({ repoRoot, files }),
  };
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function signed(value) {
  return `${value > 0 ? "+" : ""}${number(value)}`;
}

function renderInfo(snapshot) {
  return [
    "## 基本信息",
    "",
    `- **计划**：\`${snapshot.plan}\``,
    `- **统计阶段**：\`${snapshot.slot}\``,
    `- **统计时间**：${snapshot.generatedAt}`,
    `- **Git 分支**：\`${snapshot.git.branch}\``,
    `- **Git commit**：\`${snapshot.git.commit}\``,
    `- **工作区**：${snapshot.git.dirty ? `有 ${snapshot.git.changedEntries} 项未提交变化` : "clean"}`,
  ].join("\n");
}

function renderMetricsTable(metrics) {
  return [
    "| 指标 | 数量 |",
    "|---|---:|",
    `| 源代码文件 | ${number(metrics.sourceFiles)} |`,
    `| 源代码行 | ${number(metrics.sourceLines)} |`,
    `| 测试文件 | ${number(metrics.testFiles)} |`,
    `| 测试代码行 | ${number(metrics.testLines)} |`,
    `| Docs 文件 | ${number(metrics.docsFiles)} |`,
    `| Docs 非空白字符 | ${number(metrics.docsCharacters)} |`,
  ].join("\n");
}

function renderBreakdown(title, record) {
  const rows = Object.entries(record)
    .filter(([, metrics]) => metrics.sourceFiles > 0 || metrics.testFiles > 0)
    .map(([name, metrics]) => `| ${name} | ${number(metrics.sourceFiles)} | ${number(metrics.sourceLines)} | ${number(metrics.testFiles)} | ${number(metrics.testLines)} |`);
  return [
    `## ${title}`,
    "",
    "| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |",
    "|---|---:|---:|---:|---:|",
    ...rows,
  ].join("\n");
}

function embedSnapshot(snapshot) {
  return `<!-- ${DATA_MARKER}\n${JSON.stringify(snapshot)}\n-->`;
}

export function formatBeforeMarkdown(snapshot) {
  return [
    `# ${snapshot.plan} 重构前统计`,
    "",
    "> 由 `pnpm refactor:stats before` 生成。重构完成后运行对应的 `after` 命令生成差异报告。",
    "",
    renderInfo(snapshot),
    "",
    "## 仓库总览",
    "",
    renderMetricsTable(snapshot.metrics.totals),
    "",
    renderBreakdown("按主要目录", snapshot.metrics.areas),
    "",
    renderBreakdown("按语言", snapshot.metrics.languages),
    "",
    embedSnapshot(snapshot),
    "",
  ].join("\n");
}

export function extractSnapshot(markdown) {
  const pattern = new RegExp(`<!-- ${DATA_MARKER}\\n([\\s\\S]*?)\\n-->`, "u");
  const match = markdown.match(pattern);
  if (!match) throw new Error("重构前统计文档缺少可读取的快照数据");
  return JSON.parse(match[1]);
}

function renderComparisonTable(before, after) {
  const labels = [
    ["sourceFiles", "源代码文件"],
    ["sourceLines", "源代码行"],
    ["testFiles", "测试文件"],
    ["testLines", "测试代码行"],
    ["docsFiles", "Docs 文件"],
    ["docsCharacters", "Docs 非空白字符"],
  ];
  return [
    "| 指标 | 重构前 | 重构后 | 变化 |",
    "|---|---:|---:|---:|",
    ...labels.map(([key, label]) => `| ${label} | ${number(before[key])} | ${number(after[key])} | ${signed(after[key] - before[key])} |`),
  ].join("\n");
}

function renderAreaComparison(before, after) {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return [
    "| 目录 | 重构前源代码行 | 重构后源代码行 | 变化 | 测试行变化 |",
    "|---|---:|---:|---:|---:|",
    ...names.map((name) => {
      const left = before[name] ?? emptyMetrics();
      const right = after[name] ?? emptyMetrics();
      return `| ${name} | ${number(left.sourceLines)} | ${number(right.sourceLines)} | ${signed(right.sourceLines - left.sourceLines)} | ${signed(right.testLines - left.testLines)} |`;
    }),
  ].join("\n");
}

export function formatAfterMarkdown({ before, after, gitDiff }) {
  return [
    `# ${after.plan} 重构后统计`,
    "",
    "> 由 `pnpm refactor:stats after` 生成。代码行变化只用于观察，不代表单独的质量评分。",
    "",
    "## 前后对比",
    "",
    renderComparisonTable(before.metrics.totals, after.metrics.totals),
    "",
    "## 主要目录变化",
    "",
    renderAreaComparison(before.metrics.areas, after.metrics.areas),
    "",
    "## Git 变化摘要",
    "",
    `- 变化文件：${number(gitDiff.changedFiles)}`,
    `- 新增 / 删除 / 重命名文件：${number(gitDiff.addedFiles)} / ${number(gitDiff.deletedFiles)} / ${number(gitDiff.renamedFiles)}`,
    `- 新增 / 删除行：${number(gitDiff.addedLines)} / ${number(gitDiff.deletedLines)}`,
    `- 未跟踪项：${number(after.git.untrackedEntries)}（会计入规模统计，但 Git diff 摘要不含其行变化）`,
    "",
    renderInfo(after),
    "",
    "## 重构后仓库总览",
    "",
    renderMetricsTable(after.metrics.totals),
    "",
    renderBreakdown("重构后按语言", after.metrics.languages),
    "",
    embedSnapshot(after),
    "",
  ].join("\n");
}

async function writeReport(path, contents, force) {
  if (!force) {
    try {
      await readFile(path, "utf8");
      throw new Error(`统计文档已存在: ${path}。需要覆盖时显式添加 --force`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  await writeFile(path, contents, "utf8");
}

async function main() {
  const { slot, plan, force } = parseCliArgs(process.argv.slice(2));
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const outputDir = resolve(repoRoot, "docs", "exec-runs", plan);
  const beforePath = resolve(outputDir, "refactor-stats-before.md");
  const afterPath = resolve(outputDir, "refactor-stats-after.md");
  await mkdir(outputDir, { recursive: true });

  const snapshot = await createSnapshot({ repoRoot, plan, slot });
  if (slot === "before") {
    await writeReport(beforePath, formatBeforeMarkdown(snapshot), force);
    process.stdout.write(`已生成重构前统计: ${beforePath}\n`);
    return;
  }

  const before = extractSnapshot(await readFile(beforePath, "utf8"));
  if (before.plan !== plan || before.slot !== "before") {
    throw new Error("重构前统计与当前 plan 不匹配");
  }
  const gitDiff = await collectGitDiff(repoRoot, before.git.commit);
  await writeReport(afterPath, formatAfterMarkdown({ before, after: snapshot, gitDiff }), force);
  process.stdout.write(`已生成重构后统计: ${afterPath}\n`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error("重构统计失败", error.message);
    process.exitCode = 1;
  });
}
