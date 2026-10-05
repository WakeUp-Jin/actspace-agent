import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("cutover ignores generated Astro caches but rejects retired production imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-cutover-"));
  const check = () => spawnSync(process.execPath, [join(root, "scripts/check-package-cutover.mjs"), "--strict"], { encoding: "utf8" });
  try {
    await mkdir(join(root, "scripts"));
    await copyFile("scripts/check-package-cutover.mjs", join(root, "scripts/check-package-cutover.mjs"));
    await mkdir(join(root, "apps/site/.astro"), { recursive: true });
    await writeFile(join(root, "apps/site/.astro/content.json"), '{"path":"/eval"}');
    await writeFile(join(root, "apps/site/migration.json"), '{"asset":"/evaluation/image.png"}');
    assert.equal(check().status, 0);
    for (const [name, source] of [
      ["command.ts", 'const command = "/eval";'],
      ["retired.ts", 'import "@actspace/agent-core";'],
      ["monolith.mjs", 'import "@actspace/agent-runtime";'],
      ["deep.ts", 'import "../../packages/agent-runtime/src/index";'],
    ]) {
      const path = join(root, "apps/site", name);
      await writeFile(path, source);
      const result = check();
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, new RegExp(name.replace('.', '\\.')));
      await rm(path);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
