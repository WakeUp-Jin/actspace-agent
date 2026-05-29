import { describe, expect, it } from "vitest";
import { mkdtemp, realpath, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashExecutor, bashCheckPermissions, createToolManager, renderBashResult } from "../index";
import type { BashResult } from "../index";
import { loadEnv } from "../../env";

async function createWorkspace(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), "actspace-bash-test-")));
}

describe("Bash tool permissions", () => {
  it("allows simple development commands and sanitizes args", async () => {
    const workspace = await createWorkspace();
    const result = await bashCheckPermissions({
      command: "pwd",
      timeoutMs: 999_999,
    }, workspace);

    expect(result.decision).toBe("allow");
    expect(result.sanitizedArgs).toMatchObject({
      command: "pwd",
      cwd: workspace,
      timeoutMs: 120_000,
    });
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
    expect(data.timedOut).toBe(false);
  });

  it("returns structured output for non-zero exit code", async () => {
    const workspace = await createWorkspace();
    const result = await bashExecutor({ command: "exit 2", cwd: workspace }, workspace);

    expect(result.success).toBe(false);
    expect(result.error).toContain("code 2");
    const data = result.data as BashResult;
    expect(data.exitCode).toBe(2);
  });

  it("times out long-running commands", async () => {
    const workspace = await createWorkspace();
    const result = await bashExecutor({ command: "sleep 2", cwd: workspace, timeoutMs: 100 }, workspace);

    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
    const data = result.data as BashResult;
    expect(data.timedOut).toBe(true);
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
