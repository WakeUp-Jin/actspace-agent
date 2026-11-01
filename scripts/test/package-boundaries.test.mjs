import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("workspace package boundaries are acyclic and public-exported", () => {
  const output = execFileSync(process.execPath, ["scripts/check-package-boundaries.mjs"], { encoding: "utf8" });
  if (!output.includes("package boundary check passed")) throw new Error(output);
});

test("loadable plugin packages require a lifecycle contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-package-boundary-"));
  try {
    const pluginRoot = join(root, "packages", "example", "example-plugin");
    await mkdir(join(pluginRoot, "src"), { recursive: true });
    await writeFile(join(pluginRoot, "package.json"), JSON.stringify({
      name: "@actspace/example-plugin",
      private: true,
      type: "module",
      exports: {
        ".": "./dist/index.js",
        "./manifest": "./dist/manifest.js",
        "./plugin": "./dist/plugin.js",
      },
    }));
    await writeFile(join(pluginRoot, "src", "index.ts"), "export {};\n");
    await writeFile(join(pluginRoot, "src", "manifest.ts"), "export const manifest = {};\n");
    await writeFile(join(pluginRoot, "src", "plugin.ts"), "export const activate = () => ({ dispose() {} });\n");

    const result = spawnSync(process.execPath, ["scripts/check-package-boundaries.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, ACTSPACE_PACKAGE_BOUNDARY_ROOT: root },
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing a lifecycle\.test\/spec\.ts contract/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("packages must follow the two-level layout and directory-equals-name rule", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-package-layout-"));
  try {
    for (const [dir, name] of [["packages/flat", "@actspace/flat"], ["packages/group/mismatch", "@actspace/other-name"]]) {
      await mkdir(join(root, dir, "src"), { recursive: true });
      await writeFile(join(root, dir, "package.json"), JSON.stringify({ name, private: true, type: "module", exports: { ".": "./dist/index.js" } }));
    }
    const result = spawnSync(process.execPath, ["scripts/check-package-boundaries.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, ACTSPACE_PACKAGE_BOUNDARY_ROOT: root },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /packages must sit exactly at packages\/<capability>\/<package>/);
    assert.match(result.stderr, /directory name must equal the package name/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
