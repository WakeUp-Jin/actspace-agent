import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCurrentDocs, checkDocumentationLinks, checkLearningsIndex, checkMarkdownFiles, maskCode } from "../check-current-docs.mjs";

test("current documentation truth zone is v2-first and link-complete", async () => {
  const failures = await checkCurrentDocs(process.cwd());
  assert.deepEqual(failures, []);
});

test("current documentation check rejects stale v1 claims and broken links", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(
      join(root, "docs", "current.md"),
      "# Current\n\nUse `packages/agent-runtime/src/index.ts`. See [missing](./missing.md).\n",
    );

    const failures = await checkMarkdownFiles(root, ["docs/current.md"]);
    assert.equal(failures.length, 3);
    assert.match(failures[0], /packages\/agent-runtime/);
    assert.match(failures[1], /code path does not exist: packages\/agent-runtime\/src\/index\.ts/);
    assert.match(failures[2], /broken Markdown link/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("current documentation check accepts valid relative links", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "target.md"), "# Target\n");
    await writeFile(join(root, "docs", "current.md"), "# Current\n\nSee [target](./target.md).\n");

    const failures = await checkMarkdownFiles(root, ["docs/current.md"]);
    assert.deepEqual(failures, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("current navigation rejects retired APIs and unlabeled archive defaults", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await mkdir(join(root, "docs/archive/v1"), { recursive: true });
    await writeFile(join(root, "docs/archive/v1/runtime.md"), "# Historical Runtime\n");
    await writeFile(join(root, "docs/current.md"), [
      "# Current",
      "[Runtime](archive/v1/runtime.md)",
      "Run `actspace-agent chat`.",
      "Use `Promise<RuntimeHandle>` or `RuntimeHandle.runTurn()`.",
      "Read `docs/design-docs/v1-legacy/README.md`.",
    ].join("\n"));
    const failures = await checkMarkdownFiles(root, ["docs/current.md"]);
    assert.ok(failures.some((line) => line.includes("must label v1 archive")));
    assert.ok(failures.some((line) => line.includes("CLI chat")));
    assert.ok(failures.some((line) => line.includes("RuntimeHandle API")));
    assert.ok(failures.some((line) => line.includes("v1 归档路径")));

    await writeFile(join(root, "docs/current.md"), "# Current\n\n[v1 历史归档](archive/v1/runtime.md)\nSession Format v1 is current.\n");
    assert.deepEqual(await checkMarkdownFiles(root, ["docs/current.md"]), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recursive link checks cover unlisted documents and archive assets without policing historical claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await mkdir(join(root, "docs/design-docs/topic"), { recursive: true });
    await mkdir(join(root, "docs/archive/v1"), { recursive: true });
    await writeFile(join(root, "docs/archive/v1/old.md"), "# Old\n\nHistorical `actspace-agent chat` and `RuntimeHandle.runTurn()`.\n[Current](../../design-docs/topic/current.md)\n![asset](missing.png)\n");
    await writeFile(join(root, "docs/design-docs/topic/current.md"), "# Current\n\n[v1 归档](../../archive/v1/old.md)\n[Plan](../../exec-plans/active/retired.md)\n");
    await writeFile(join(root, "docs/archive/v1/preview.html"), '<img src="missing.png"><a href="../../design-docs/topic/current.md">Current</a>');
    const failures = await checkDocumentationLinks(root, ["docs/design-docs", "docs/archive"]);
    assert.equal(failures.length, 3);
    assert.ok(failures.some((line) => line.includes("retired.md")));
    assert.ok(failures.some((line) => line.includes("broken HTML asset/link")));
    assert.ok(failures.every((line) => line.includes("broken")));

    await writeFile(join(root, "docs/archive/v1/missing.png"), "fixture");
    await writeFile(join(root, "docs/design-docs/topic/current.md"), "# Current\n\n[v1 归档](../../archive/v1/old.md)\n");
    assert.deepEqual(await checkDocumentationLinks(root, ["docs/design-docs", "docs/archive"]), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("link checks accept angle-wrapped filenames with spaces, parentheses and titles", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs/image (1).png"), "fixture");
    await writeFile(join(root, "docs/current.md"), '# Current\n\n![Image](<image (1).png> "Title")\n[Encoded](image%20%281%29.png)\n');
    assert.deepEqual(await checkMarkdownFiles(root, ["docs/current.md"]), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retired Host and Task APIs require explicit historical labels on their own lines", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-api-"));
  try {
    const examples = ["bootProfile()", "BootedProfile", "RunAgentInput", "context:compact", "engine/streaming-preview-extractors.ts"];
    await writeFile(join(root, "current.md"), "历史背景\n\n" + examples.map(api => `Use \`${api}\`.`).join("\n"));
    assert.equal((await checkMarkdownFiles(root, ["current.md"])).length, examples.length);
    await writeFile(join(root, "current.md"), examples.map(api => `历史：已退役 \`${api}\`。`).join("\n") + "\nUse bootProfileRuntime().");
    assert.deepEqual(await checkMarkdownFiles(root, ["current.md"]), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("link syntax shown inside code is not checked, real links next to it still are", async () => {
  const source = "Example `[文字](url)` here.\n\n```md\n[demo](./nowhere.md)\n```\n\nSee [missing](./missing.md).\n";
  assert.equal(maskCode(source).length, source.length);
  assert.equal(maskCode(source).split("\n").length, source.split("\n").length);
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "current.md"), source);
    const failures = await checkMarkdownFiles(root, ["docs/current.md"], { checkClaims: false });
    assert.deepEqual(failures, ["docs/current.md:7: broken Markdown link: ./missing.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("current docs must name code paths that exist, unless the line marks them as removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "packages", "real", "src"), { recursive: true });
    await writeFile(join(root, "packages", "real", "src", "index.ts"), "");
    await writeFile(
      join(root, "docs", "current.md"),
      "Entry: `packages/real/src/index.ts:12`.\nMissing: `packages/gone/src/index.ts`.\n不再使用 `packages/legacy/`。\nPattern `packages/*/README.md`.\n",
    );
    const failures = await checkMarkdownFiles(root, ["docs/current.md"]);
    assert.deepEqual(failures, ["docs/current.md:2: code path does not exist: packages/gone/src/index.ts"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("learnings check code and doc paths without policing claims; placeholders and labelled history are exempt", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await mkdir(join(root, "docs/learnings/2026-05"), { recursive: true });
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "scripts", "real.sh"), "");
    await writeFile(join(root, "docs/learnings/2026-05/lesson.md"), [
      "Still uses `packages/agent-runtime/src/index.ts`.",
      "Script: `scripts/real.sh`; gone: `scripts/gone.sh`.",
      "Spec moved: `docs/design-docs/gone.md`.",
      "Monthly dirs: `docs/learnings/YYYY-MM/`.",
      "`packages/shared/src/session.ts`（历史：已移除，现为 `packages/util/shared`）。",
    ].join("\n"));
    const failures = await checkMarkdownFiles(root, ["docs/learnings/2026-05/lesson.md"], { checkClaims: false, checkCodePaths: true });
    assert.deepEqual(failures, [
      "docs/learnings/2026-05/lesson.md:1: code path does not exist: packages/agent-runtime/src/index.ts",
      "docs/learnings/2026-05/lesson.md:2: code path does not exist: scripts/gone.sh",
      "docs/learnings/2026-05/lesson.md:3: code path does not exist: docs/design-docs/gone.md",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("drifted facts (old event names, schema 9, billingMode, personal paths) need historical labels", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await writeFile(join(root, "current.md"), [
      "Emit `request/snapshot` and `llm/usage`.",
      "SQLite read model is schema 9.",
      "Connections carry `billingMode`.",
      "Notes live in /Users/someone/Desktop/notes.md.",
    ].join("\n"));
    const failures = await checkMarkdownFiles(root, ["current.md"]);
    assert.equal(failures.length, 5);
    assert.equal(failures.filter((line) => line.includes("事件词汇")).length, 2);
    assert.ok(failures.some((line) => line.includes("schema 9")));
    assert.ok(failures.some((line) => line.includes("billingMode")));
    assert.ok(failures.some((line) => line.includes("绝对路径")));

    await writeFile(join(root, "current.md"), [
      "- `request/snapshot`（已删除）；",
      "schema 9（历史版本号）已被后续版本取代。",
      "连接级 `billingMode` 已删除。",
    ].join("\n"));
    assert.deepEqual(await checkMarkdownFiles(root, ["current.md"]), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("identifiers renamed out of the RuntimeV2 era need a historical label; paths, channels and format versions do not", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await writeFile(join(root, "current.md"), [
      "投影类型是 `RuntimeV2DesktopSessionProjection`。",
      "```ts",
      "const channels = RUNTIME_V2_FIXED_RENDERER_CHANNELS;",
      "```",
      "CLI 入口是 runV2Command。",
    ].join("\n"));
    const failures = await checkMarkdownFiles(root, ["current.md"]);
    assert.deepEqual(failures.map((line) => line.replace(/（.*$/u, "")), [
      "current.md:1: 仍使用改名前的标识符",
      "current.md:3: 仍使用改名前的标识符",
      "current.md:5: 仍使用改名前的标识符",
    ]);
    assert.ok(failures.every((line) => line.includes("check-transitional-names.mjs --write")));

    await writeFile(join(root, "current.md"), [
      "投影类型是 `RuntimeDesktopSessionProjection`（旧名 `RuntimeV2DesktopSessionProjection`）。",
      "契约在 `@actspace/shared/runtime-v2`，channel 以 `runtime-v2:` 开头，契约 id 是 `actspace.runtime.v2`。",
      "设置的格式版本是 `SettingsV4`，Session 事件信封是 `SessionEventEnvelopeV1`。",
    ].join("\n"));
    assert.deepEqual(await checkMarkdownFiles(root, ["current.md"]), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("learnings index counts, coverage and duplicates are verified", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-current-docs-"));
  try {
    await mkdir(join(root, "docs/learnings/2026-05"), { recursive: true });
    await writeFile(join(root, "docs/learnings/2026-05/a.md"), "# A\n");
    await writeFile(join(root, "docs/learnings/2026-05/b.md"), "# B\n");
    await writeFile(join(root, "docs/learnings/2026-05/orphan.md"), "# Orphan\n");
    await writeFile(join(root, "docs/learnings/README.md"), [
      "# 索引",
      "",
      "## 主题一（3）",
      "",
      "- 2026-05 [A](2026-05/a.md)",
      "- 2026-05 [B](2026-05/b.md)",
      "",
      "## 主题二（1）",
      "",
      "- 2026-05 [A again](2026-05/a.md)",
      "",
    ].join("\n"));
    const failures = await checkLearningsIndex(root);
    assert.equal(failures.length, 3);
    assert.ok(failures.some((line) => line.includes("「主题一」声明 3 篇，实际列出 2 篇")));
    assert.ok(failures.some((line) => line.includes("2026-05/a.md」在索引里出现了 2 次")));
    assert.ok(failures.some((line) => line.includes("缺少对 2026-05/orphan.md 的索引条目")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
