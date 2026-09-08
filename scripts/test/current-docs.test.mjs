import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCurrentDocs, checkDocumentationLinks, checkMarkdownFiles } from "../check-current-docs.mjs";

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
    assert.equal(failures.length, 2);
    assert.match(failures[0], /packages\/agent-runtime/);
    assert.match(failures[1], /broken Markdown link/);
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
