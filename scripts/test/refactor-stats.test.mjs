import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  collectRefactorStats,
  extractSnapshot,
  formatAfterMarkdown,
  formatBeforeMarkdown,
  parseCliArgs,
  shouldCountFile,
  validatePlanSlug,
} from "../refactor-stats.mjs";

test("parses the compact before/after CLI", () => {
  assert.deepEqual(parseCliArgs(["before", "--plan", "agent-runtime-v2"]), {
    slot: "before",
    plan: "agent-runtime-v2",
    force: false,
  });
  assert.deepEqual(parseCliArgs(["after", "--force", "--plan", "agent-runtime-v2"]), {
    slot: "after",
    plan: "agent-runtime-v2",
    force: true,
  });
  assert.throws(() => validatePlanSlug("../escape"), /只能包含/u);
  assert.throws(() => parseCliArgs(["before"]), /缺少 --plan/u);
});

test("excludes generated refactor reports from their own statistics", () => {
  assert.equal(shouldCountFile("docs/exec-runs/demo/refactor-stats-before.md"), false);
  assert.equal(shouldCountFile("docs/exec-runs/demo/execution-summary.md"), true);
});

test("collects source, test, docs, language, and area metrics", async () => {
  const repoRoot = await mkdtemp(resolve(tmpdir(), "actspace-refactor-stats-"));
  const files = [
    "packages/app/src/index.ts",
    "packages/app/src/index.test.ts",
    "plugins/bridge/main.go",
    "plugins/bridge/main_test.go",
    "docs/guide.md",
    "docs/exec-runs/demo/refactor-stats-before.md",
  ];

  try {
    for (const file of files) {
      await mkdir(resolve(repoRoot, file, ".."), { recursive: true });
    }
    await writeFile(resolve(repoRoot, files[0]), "export const value = 1;\n");
    await writeFile(resolve(repoRoot, files[1]), "test('value', () => {});\n");
    await writeFile(resolve(repoRoot, files[2]), "package main\n\nfunc main() {}\n");
    await writeFile(resolve(repoRoot, files[3]), "package main\n\nfunc TestMain() {}\n");
    await writeFile(resolve(repoRoot, files[4]), "# 标题\nDocs text\n");
    await writeFile(resolve(repoRoot, files[5]), "ignored\n");

    const stats = await collectRefactorStats({ repoRoot, files });
    assert.deepEqual(stats.totals, {
      sourceFiles: 2,
      sourceLines: 4,
      testFiles: 2,
      testLines: 4,
      docsFiles: 1,
      docsCharacters: 11,
    });
    assert.equal(stats.languages.TypeScript.sourceFiles, 1);
    assert.equal(stats.languages.Go.testFiles, 1);
    assert.equal(stats.areas["packages/app"].testLines, 1);
    assert.equal(stats.areas["plugins/bridge"].sourceLines, 3);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("round-trips the embedded snapshot and renders deltas", () => {
  const metrics = {
    totals: { sourceFiles: 1, sourceLines: 10, testFiles: 1, testLines: 5, docsFiles: 1, docsCharacters: 20 },
    areas: { "packages/app": { sourceFiles: 1, sourceLines: 10, testFiles: 1, testLines: 5, docsFiles: 0, docsCharacters: 0 } },
    languages: { TypeScript: { sourceFiles: 1, sourceLines: 10, testFiles: 1, testLines: 5, docsFiles: 0, docsCharacters: 0 } },
  };
  const before = {
    schemaVersion: 1,
    plan: "demo",
    slot: "before",
    generatedAt: "2026-08-22T00:00:00.000Z",
    git: { branch: "main", commit: "abc", dirty: false, changedEntries: 0, untrackedEntries: 0 },
    metrics,
  };
  const after = structuredClone(before);
  after.slot = "after";
  after.metrics.totals.sourceLines = 8;

  assert.deepEqual(extractSnapshot(formatBeforeMarkdown(before)), before);
  const report = formatAfterMarkdown({
    before,
    after,
    gitDiff: { changedFiles: 1, addedFiles: 0, deletedFiles: 0, renamedFiles: 0, addedLines: 2, deletedLines: 4 },
  });
  assert.match(report, /\| 源代码行 \| 10 \| 8 \| -2 \|/u);
  assert.deepEqual(extractSnapshot(report), after);
});

