import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, realpath, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { grepExecutor, globExecutor } from "../index";

async function createWorkspace(): Promise<string> {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), "actspace-search-tools-test-")));
  await mkdir(join(workspace, "packages/agent-core/src/tools"), { recursive: true });
  await mkdir(join(workspace, "packages/desktop/src"), { recursive: true });
  await writeFile(join(workspace, "packages/agent-core/src/tools/alpha.ts"), "export const alpha = 'needle';\n");
  await writeFile(join(workspace, "packages/agent-core/src/tools/beta.test.ts"), "export const beta = 'needle';\n");
  await writeFile(join(workspace, "packages/desktop/src/view.tsx"), "export const view = 'needle';\n");
  return workspace;
}

function hasRipgrep(): boolean {
  try {
    execFileSync("rg", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("grepExecutor", () => {
  it("returns matching lines with workspace-relative paths", async () => {
    if (!hasRipgrep()) return;

    const workspace = await createWorkspace();
    const result = await grepExecutor({
      pattern: "needle",
      path: "packages/agent-core",
      glob: "*.ts",
    }, workspace);

    expect(result.success).toBe(true);
    const output = String(result.data);
    expect(output).toContain("packages/agent-core/src/tools/alpha.ts:1:");
    expect(output).toContain("packages/agent-core/src/tools/beta.test.ts:1:");
    expect(output).not.toContain("packages/desktop/src/view.tsx");
  });

  it("returns no matches as a successful result", async () => {
    if (!hasRipgrep()) return;

    const workspace = await createWorkspace();
    const result = await grepExecutor({ pattern: "not-present" }, workspace);

    expect(result.success).toBe(true);
    expect(String(result.data)).toContain("No matches found");
  });
});

describe("globExecutor", () => {
  it("returns paths with size and modified time, sorted newest first", async () => {
    if (!hasRipgrep()) return;

    const workspace = await createWorkspace();
    const olderFile = join(workspace, "packages/agent-core/src/tools/alpha.ts");
    const newerFile = join(workspace, "packages/agent-core/src/tools/beta.test.ts");
    const older = new Date("2024-01-01T00:00:00.000Z");
    const newer = new Date("2025-01-01T00:00:00.000Z");
    await utimes(olderFile, older, older);
    await utimes(newerFile, newer, newer);

    const result = await globExecutor({
      pattern: "src/**/*.ts",
      path: "packages/agent-core",
    }, workspace);

    expect(result.success).toBe(true);
    const output = String(result.data);
    expect(output).toContain("packages/agent-core/src/tools/alpha.ts");
    expect(output).toContain("packages/agent-core/src/tools/beta.test.ts");
    expect(output).toContain("packages/agent-core/src/tools/alpha.ts | size: 31 B | modified: 2024-01-01T00:00:00.000Z");
    expect(output).toContain("packages/agent-core/src/tools/beta.test.ts | size: 30 B | modified: 2025-01-01T00:00:00.000Z");
    expect(output.indexOf("packages/agent-core/src/tools/beta.test.ts")).toBeLessThan(
      output.indexOf("packages/agent-core/src/tools/alpha.ts"),
    );
    expect(output).not.toContain("packages/desktop/src/view.tsx");
  });

  it("expands simple file patterns recursively", async () => {
    if (!hasRipgrep()) return;

    const workspace = await createWorkspace();
    const result = await globExecutor({
      pattern: "*.tsx",
      path: "packages",
    }, workspace);

    expect(result.success).toBe(true);
    expect(String(result.data)).toContain("packages/desktop/src/view.tsx");
    expect(String(result.data)).toMatch(/packages\/desktop\/src\/view\.tsx \| size: \d+ B \| modified: \d{4}-\d{2}-\d{2}T/);
  });
});
