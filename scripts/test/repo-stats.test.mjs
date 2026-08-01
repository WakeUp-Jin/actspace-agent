import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  collectRepositoryStats,
  countNonWhitespaceCharacters,
  countPhysicalLines,
  formatRepositoryStats,
  isDocsFile,
  isSourceFile,
  isTestFile,
} from "../repo-stats.mjs";

test("classifies source, docs, and conventional test files", () => {
  assert.equal(isSourceFile("packages/app/src/index.ts"), true);
  assert.equal(isSourceFile("packages/app/src/index.test.ts"), false);
  assert.equal(isDocsFile("docs/ARCHITECTURE.md"), true);
  assert.equal(isDocsFile("README.md"), false);
  assert.equal(isTestFile("packages/app/src/index.test.ts"), true);
  assert.equal(isTestFile("plugins/bridge/command_test.go"), true);
  assert.equal(isTestFile("plugins/plugin/tests/integration.rs"), true);
});

test("counts physical lines and non-whitespace Unicode characters", () => {
  assert.equal(countPhysicalLines("one\ntwo\n"), 2);
  assert.equal(countPhysicalLines("one\ntwo"), 2);
  assert.equal(countPhysicalLines(""), 0);
  assert.equal(countNonWhitespaceCharacters("中 文\nagent 42"), 9);
});

test("collects deterministic repository statistics from a tracked-file list", async () => {
  const repoRoot = await mkdtemp(resolve(tmpdir(), "actspace-repo-stats-"));
  const files = [
    "packages/app/src/index.ts",
    "packages/app/src/index.test.ts",
    "docs/guide.md",
    "README.md",
  ];

  try {
    await mkdir(resolve(repoRoot, "packages/app/src"), { recursive: true });
    await mkdir(resolve(repoRoot, "docs"), { recursive: true });
    await writeFile(resolve(repoRoot, files[0]), "export const value = 1;\n\n");
    await writeFile(resolve(repoRoot, files[1]), "test('value', () => {});\n");
    await writeFile(resolve(repoRoot, files[2]), "# 标题\nDocs text\n");
    await writeFile(resolve(repoRoot, files[3]), "ignored\n");

    const stats = await collectRepositoryStats({ repoRoot, trackedFiles: files });

    assert.deepEqual(stats, {
      sourceFiles: 1,
      sourceLines: 2,
      docsFiles: 1,
      docsCharacters: 11,
      testFiles: 1,
    });
    assert.match(formatRepositoryStats(stats), /源代码: 1 files \/ 2 lines/u);
    assert.match(formatRepositoryStats(stats), /Docs: 1 files \/ 11 非空白字符/u);
    assert.match(formatRepositoryStats(stats), /测试: 1 files/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
