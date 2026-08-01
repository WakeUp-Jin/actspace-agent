#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const SOURCE_EXTENSIONS = new Set([
  ".astro",
  ".c",
  ".cc",
  ".cjs",
  ".cpp",
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".mjs",
  ".py",
  ".rs",
  ".sh",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
]);

export function isTestFile(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const fileName = basename(normalized);

  return /\.(?:test|spec)\.[^/]+$/u.test(fileName)
    || /_test\.go$/u.test(fileName)
    || /(?:^|\/)tests\/[^/]+\.rs$/u.test(normalized);
}

export function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(extname(filePath).toLowerCase()) && !isTestFile(filePath);
}

export function isDocsFile(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  return normalized.startsWith("docs/") && normalized.endsWith(".md");
}

export function countPhysicalLines(text) {
  if (text.length === 0) return 0;
  const lineCount = text.split(/\r\n|\r|\n/u).length;
  return /(?:\r\n|\r|\n)$/u.test(text) ? lineCount - 1 : lineCount;
}

export function countNonWhitespaceCharacters(text) {
  return Array.from(text.replace(/\s/gu, "")).length;
}

export async function collectRepositoryStats({ repoRoot, trackedFiles }) {
  const stats = {
    sourceFiles: 0,
    sourceLines: 0,
    docsFiles: 0,
    docsCharacters: 0,
    testFiles: 0,
  };

  for (const filePath of trackedFiles) {
    if (isTestFile(filePath)) stats.testFiles += 1;

    if (!isSourceFile(filePath) && !isDocsFile(filePath)) continue;
    const contents = await readFile(resolve(repoRoot, filePath), "utf8");

    if (isSourceFile(filePath)) {
      stats.sourceFiles += 1;
      stats.sourceLines += countPhysicalLines(contents);
    }

    if (isDocsFile(filePath)) {
      stats.docsFiles += 1;
      stats.docsCharacters += countNonWhitespaceCharacters(contents);
    }
  }

  return stats;
}

export function formatRepositoryStats(stats) {
  const number = new Intl.NumberFormat("en-US");
  return [
    "仓库统计（Git 已跟踪文件）",
    `  源代码: ${number.format(stats.sourceFiles)} files / ${number.format(stats.sourceLines)} lines（不含测试）`,
    `  Docs: ${number.format(stats.docsFiles)} files / ${number.format(stats.docsCharacters)} 非空白字符`,
    `  测试: ${number.format(stats.testFiles)} files`,
  ].join("\n");
}

async function listTrackedFiles(repoRoot) {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.split("\0").filter(Boolean);
}

async function main() {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const trackedFiles = await listTrackedFiles(repoRoot);
  const stats = await collectRepositoryStats({ repoRoot, trackedFiles });
  process.stdout.write(`${formatRepositoryStats(stats)}\n`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error("仓库统计失败", error);
    process.exitCode = 1;
  });
}
