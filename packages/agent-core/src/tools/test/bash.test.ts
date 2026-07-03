import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, realpath, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashExecutor, bashCheckPermissions, createToolManager, renderBashResult, bashTaskRegistry } from "../index";
import type { BashResult, BashBackgroundedResult } from "../index";
import { loadEnv } from "../../env";

async function createWorkspace(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), "actspace-bash-test-")));
}

describe("Bash tool permissions", () => {
  it("allows simple development commands and sanitizes args", async () => {
    const workspace = await createWorkspace();
    const result = await bashCheckPermissions({
      command: "pwd",
      blockMs: 999_999,
    }, workspace);

    expect(result.decision).toBe("allow");
    expect(result.sanitizedArgs).toMatchObject({
      command: "pwd",
      cwd: workspace,
      blockMs: 600_000,
    });
  });

  it("keeps blockMs 0 as explicit immediate-background", async () => {
    const workspace = await createWorkspace();
    const result = await bashCheckPermissions({ command: "pwd", blockMs: 0 }, workspace);

    expect(result.decision).toBe("allow");
    expect(result.sanitizedArgs).toMatchObject({ blockMs: 0 });
  });

  it("denies empty commands", async () => {
    const workspace = await createWorkspace();
    const result = await bashCheckPermissions({ command: "   " }, workspace);

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("command is required");
  });

  it("denies dangerous delete commands", async () => {
    const workspace = await createWorkspace();
    const result = await bashCheckPermissions({ command: "rm -rf /" }, workspace);

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("dangerous delete");
  });

  it("denies cwd outside workspace", async () => {
    const workspace = await createWorkspace();
    const result = await bashCheckPermissions({ command: "pwd", cwd: "/" }, workspace);

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("workspace boundary");
  });

  it("asks for commands outside the allowlist", async () => {
    const workspace = await createWorkspace();
    const result = await bashCheckPermissions({ command: "pnpm install" }, workspace);

    expect(result.decision).toBe("ask");
    expect(result.reason).toContain("not in the Bash allowlist");
    expect(result.sanitizedArgs).toMatchObject({ command: "pnpm install" });
  });

  it("ACTSPACE_BASH_ALWAYS_ASK forces ask even for allowlisted commands", async () => {
    const workspace = await createWorkspace();
    const original = process.env.ACTSPACE_BASH_ALWAYS_ASK;
    process.env.ACTSPACE_BASH_ALWAYS_ASK = "1";
    try {
      loadEnv();
      const result = await bashCheckPermissions({ command: "pwd" }, workspace);
      expect(result.decision).toBe("ask");
      expect(result.reason).toContain("always-ask");
    } finally {
      if (original === undefined) {
        delete process.env.ACTSPACE_BASH_ALWAYS_ASK;
      } else {
        process.env.ACTSPACE_BASH_ALWAYS_ASK = original;
      }
      loadEnv();
    }
  });

  it("ACTSPACE_BASH_ALWAYS_ASK still respects hard reject", async () => {
    const workspace = await createWorkspace();
    const original = process.env.ACTSPACE_BASH_ALWAYS_ASK;
    process.env.ACTSPACE_BASH_ALWAYS_ASK = "1";
    try {
      loadEnv();
      const result = await bashCheckPermissions({ command: "rm -rf /" }, workspace);
      expect(result.decision).toBe("deny");
    } finally {
      if (original === undefined) {
        delete process.env.ACTSPACE_BASH_ALWAYS_ASK;
      } else {
        process.env.ACTSPACE_BASH_ALWAYS_ASK = original;
      }
      loadEnv();
    }
  });
});

describe("Bash executor", () => {
  afterEach(() => {
    // 回收测试遗留后台任务，防止跨用例进程泄漏
    bashTaskRegistry.harvestAll();
    bashTaskRegistry.clear();
  });

  it("runs a successful command", async () => {
    const workspace = await createWorkspace();
    const result = await bashExecutor({ command: "printf hello", cwd: workspace }, workspace);

    expect(result.success).toBe(true);
    const data = result.data as BashResult;
    expect(data.cwd).toBe(workspace);
    expect(data.output).toBe("hello");
    expect(data.totalChars).toBe(5);
    expect(data.outputTruncated).toBe(false);
    expect(data.exitCode).toBe(0);
  });

  it("returns structured output for non-zero exit code", async () => {
    const workspace = await createWorkspace();
    const result = await bashExecutor({ command: "exit 2", cwd: workspace }, workspace);

    expect(result.success).toBe(false);
    expect(result.error).toContain("code 2");
    const data = result.data as BashResult;
    expect(data.exitCode).toBe(2);
  });

  it("moves long-running commands to background instead of killing them", async () => {
    const workspace = await createWorkspace();
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), "actspace-bash-tmp-")));
    const result = await bashExecutor(
      { command: "sleep 5", cwd: workspace, blockMs: 1_000 },
      workspace,
      { tmpRoot, sessionId: "sess-bg" },
    );

    expect(result.success).toBe(true);
    const data = result.data as BashBackgroundedResult;
    expect(data.status).toBe("backgrounded");
    expect(data.reason).toBe("block_timeout");
    expect(data.taskId).toMatch(/^bash_/);
    expect(data.outputFilePath).toBeTruthy();
    expect(bashTaskRegistry.get(data.taskId)?.status).toBe("running");

    const rendered = renderBashResult(result);
    expect(rendered).toContain("backgrounded");
    expect(rendered).toContain(data.taskId);
  });

  it("backgrounds immediately when blockMs is 0", async () => {
    const workspace = await createWorkspace();
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), "actspace-bash-tmp-")));
    const result = await bashExecutor(
      { command: "sleep 5", cwd: workspace, blockMs: 0 },
      workspace,
      { tmpRoot, sessionId: "sess-bg" },
    );

    expect(result.success).toBe(true);
    const data = result.data as BashBackgroundedResult;
    expect(data.status).toBe("backgrounded");
    expect(data.reason).toBe("explicit");
  });

  it("returns foreground result when the process exits right at the blockMs boundary", async () => {
    const workspace = await createWorkspace();
    // blockMs 与命令时长同量级：无论谁先到，都必须拿到确定结果（前台或后台，不允许挂起/报错）
    const result = await bashExecutor(
      { command: "sleep 1", cwd: workspace, blockMs: 1_000 },
      workspace,
    );

    expect(result.success).toBe(true);
    const data = result.data as BashResult | BashBackgroundedResult;
    if ("status" in data && data.status === "backgrounded") {
      expect(data.taskId).toMatch(/^bash_/);
    } else {
      expect((data as BashResult).exitCode).toBe(0);
    }
  });

  it("renders Bash results for model context", async () => {
    const workspace = await createWorkspace();
    const result = await bashExecutor({ command: "printf hello", cwd: workspace }, workspace);
    const rendered = renderBashResult(result);

    expect(rendered).toContain("$ printf hello");
    expect(rendered).toContain("exitCode: 0");
    expect(rendered).toContain("output:");
  });

  it("streams large output to disk and returns head + truncation marker + path", async () => {
    const workspace = await createWorkspace();
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), "actspace-bash-tmp-")));
    // 10000 'a' chars > inlineThreshold(4000) → 落盘 + 头部截断
    const result = await bashExecutor(
      { command: "printf 'a%.0s' $(seq 1 10000)", cwd: workspace },
      workspace,
      { tmpRoot, sessionId: "sess-1", inlineThreshold: 4000 },
    );

    expect(result.success).toBe(true);
    const data = result.data as BashResult;
    expect(data.outputTruncated).toBe(true);
    expect(data.output.length).toBe(4000);
    expect(data.totalChars).toBe(10000);
    expect(data.stdoutFilePath).toBeTruthy();
    expect(result.outputRef).toEqual({ kind: "file", value: data.stdoutFilePath });

    // 落盘文件应包含完整 10000 字符
    const persisted = await readFile(data.stdoutFilePath!, "utf8");
    expect(persisted.length).toBe(10000);

    const rendered = renderBashResult(result);
    expect(rendered).toContain("[输出截断：显示前 4000/共 10000 字符");
    expect(rendered).toContain(data.stdoutFilePath!);
  });

  it("treats truncation as success and includes retrieval guidance", async () => {
    const workspace = await createWorkspace();
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), "actspace-bash-tmp-")));
    const result = await bashExecutor(
      { command: "printf 'a%.0s' $(seq 1 10000)", cwd: workspace },
      workspace,
      { tmpRoot, sessionId: "sess-1", inlineThreshold: 4000 },
    );

    // 截断不是失败：输出管道正常工作状态
    expect(result.success).toBe(true);
    const rendered = renderBashResult(result);
    expect(rendered).toContain("read_file");
    expect(rendered).toContain("grep");
    expect(rendered).toContain("不要重跑命令");
  });

  it("keeps disk file on non-zero exit with large output", async () => {
    const workspace = await createWorkspace();
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), "actspace-bash-tmp-")));
    const result = await bashExecutor(
      { command: "printf 'a%.0s' $(seq 1 10000); exit 3", cwd: workspace },
      workspace,
      { tmpRoot, sessionId: "sess-1", inlineThreshold: 4000 },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("code 3");
    const data = result.data as BashResult;
    expect(data.stdoutFilePath).toBeTruthy();
    expect(result.outputRef).toEqual({ kind: "file", value: data.stdoutFilePath });
  });

  it("reports command and cwd when the command fails to start", async () => {
    const workspace = await createWorkspace();
    const missingCwd = join(workspace, "does-not-exist");
    const result = await bashExecutor({ command: "pwd", cwd: missingCwd }, workspace);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to start");
    expect(result.error).toContain(missingCwd);
    expect(result.error).toContain("pwd");
  });

  it("keeps small output inline without creating a file", async () => {
    const workspace = await createWorkspace();
    const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), "actspace-bash-tmp-")));
    const result = await bashExecutor(
      { command: "printf hello", cwd: workspace },
      workspace,
      { tmpRoot, sessionId: "sess-1", inlineThreshold: 4000 },
    );

    expect(result.success).toBe(true);
    const data = result.data as BashResult;
    expect(data.outputTruncated).toBe(false);
    expect(data.stdoutFilePath).toBeUndefined();
    expect(result.outputRef).toBeUndefined();
  });
});

describe("Bash tool registration", () => {
  it("is registered by createToolManager", () => {
    const manager = createToolManager({ workspaceRoot: "/tmp" });

    expect(manager.has("bash")).toBe(true);
    expect(manager.getToolDefinitions().some((tool) => tool.name === "bash")).toBe(true);
  });
});
