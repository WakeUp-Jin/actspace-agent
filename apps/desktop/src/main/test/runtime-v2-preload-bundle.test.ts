// @vitest-environment node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("runtime v2 preload packaging", () => {
  it("loads a sandbox-compatible single-file preload in development and production", async () => {
    const manifest = JSON.parse(await readFile(resolve(desktopRoot, "package.json"), "utf8")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    const mainSource = await readFile(resolve(desktopRoot, "src/main/index.ts"), "utf8");

    expect(manifest.scripts["build:electron"]).toContain("--bundle");
    expect(manifest.scripts["dev:electron:build"]).toContain("--bundle");
    expect(mainSource).toContain('"index.bundle.js"');

    const result = await build({
      absWorkingDir: desktopRoot,
      entryPoints: ["src/preload/index.ts"],
      bundle: true,
      external: ["electron"],
      format: "cjs",
      platform: "node",
      write: false,
    });
    const bundled = result.outputFiles[0]?.text ?? "";
    expect(bundled).toContain('require("electron")');
    expect(bundled).not.toMatch(/require\(["']@actspace\//);
  });
});
