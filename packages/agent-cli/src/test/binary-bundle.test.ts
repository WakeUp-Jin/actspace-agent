import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(__dirname, "../../../..");
const target = `${process.platform}-${process.arch}`;
const bundleDir = resolve(repoRoot, "artifacts", "agent-cli", target, ".build");

beforeAll(async () => {
  await execFileAsync(process.execPath, [
    resolve(repoRoot, "scripts/build-agent-cli-binary.mjs"),
    "--bundle-only",
  ], { cwd: repoRoot });
});

describe("Agent CLI standalone bundle", () => {
  it("contains no unresolved package imports outside the managed ripgrep fallback", async () => {
    const metadata = JSON.parse(await readFile(resolve(bundleDir, "bundle-meta.json"), "utf8"));
    const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
    const external = Object.values(metadata.outputs as Record<string, { imports?: Array<{ path: string; external?: boolean }> }>)
      .flatMap((output) => output.imports ?? [])
      .filter((item) => item.external && !builtins.has(item.path) && !item.path.startsWith("node:") && item.path !== "@vscode/ripgrep")
      .map((item) => item.path);
    expect(external).toEqual([]);
    await expect(access(resolve(bundleDir, "agent-cli.cjs"))).resolves.toBeUndefined();
  });

  it("runs without workspace package resolution", async () => {
    const result = await execFileAsync(process.execPath, [resolve(bundleDir, "agent-cli.cjs"), "--version"], {
      cwd: "/tmp",
    });
    expect(result.stdout).toContain(`actspace-agent 0.1.0 ${target}`);
  });
});
