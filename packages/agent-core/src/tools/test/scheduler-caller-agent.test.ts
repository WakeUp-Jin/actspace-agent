import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolManager } from "../manager";
import { readFileDefinition } from "../tools/read-file/definition";
import { readFileExecutor } from "../tools/read-file/executor";

/**
 * 这一组测试覆盖 ToolScheduler 的 callerAgent="kairos" 守卫路径：
 * - allowedRoots 白名单
 * - blocklist glob 路径
 * - toolsDenied 工具名
 * - main 调用零回归（不传 options 时行为与历史一致）
 */

let workspace: string;
let secretDir: string;
let manager: ToolManager;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "kairos-scheduler-"));
  secretDir = join(workspace, "secret");
  await mkdir(secretDir, { recursive: true });
  await writeFile(join(workspace, "hello.txt"), "hello\n", "utf8");
  await writeFile(join(secretDir, "key.pem"), "----\n", "utf8");
  manager = new ToolManager({ workspaceRoot: workspace });
  manager.registerFromSpec(readFileDefinition, readFileExecutor);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("ToolScheduler callerAgent path", () => {
  it("main caller: no Kairos guard is applied (zero regression)", async () => {
    const result = await manager.execute("read_file", { path: "hello.txt" });
    expect(result.success).toBe(true);
  });

  it("kairos caller: allowedRoots accepts when path resolves inside any root", async () => {
    const result = await manager.execute(
      "read_file",
      { path: "hello.txt" },
      undefined,
      {
        callerAgent: "kairos",
        kairosGuard: {
          allowedRoots: [workspace],
          blocklistPaths: [],
          toolsDenied: [],
        },
      },
    );
    expect(result.success).toBe(true);
  });

  it("kairos caller: rejects path outside any allowedRoot", async () => {
    const result = await manager.execute(
      "read_file",
      { path: "../outside.txt" },
      undefined,
      {
        callerAgent: "kairos",
        kairosGuard: {
          allowedRoots: [workspace],
          blocklistPaths: [],
          toolsDenied: [],
        },
      },
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/allowedRoots/);
  });

  it("kairos caller: blocklist glob denies access to matching paths", async () => {
    const result = await manager.execute(
      "read_file",
      { path: "secret/key.pem" },
      undefined,
      {
        callerAgent: "kairos",
        kairosGuard: {
          allowedRoots: [workspace],
          blocklistPaths: ["**/secret/**"],
          toolsDenied: [],
        },
      },
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/blocklist/);
  });

  it("kairos caller: toolsDenied refuses tool regardless of path", async () => {
    const result = await manager.execute(
      "read_file",
      { path: "hello.txt" },
      undefined,
      {
        callerAgent: "kairos",
        kairosGuard: {
          allowedRoots: [workspace],
          blocklistPaths: [],
          toolsDenied: ["read_file"],
        },
      },
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/denied for Kairos/);
  });

  it("kairos caller: refuses when guard context is missing", async () => {
    const result = await manager.execute(
      "read_file",
      { path: "hello.txt" },
      undefined,
      { callerAgent: "kairos" },
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/guard missing/);
  });
});
