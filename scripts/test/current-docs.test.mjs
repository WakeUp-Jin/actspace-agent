import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCurrentDocs, checkMarkdownFiles } from "../check-current-docs.mjs";

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
