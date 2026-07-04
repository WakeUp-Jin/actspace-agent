/**
 * bash 沙盒执行层测试（E5 第一期）
 *
 * - profile 生成器单测：纯函数，任何平台都跑。
 * - 沙盒集成测试：仅 darwin 且运行时探测通过才跑（嵌套沙盒环境下
 *   sandbox_apply 会失败，探测不通过自动 skip）。
 *
 * 断言注意：不使用「命令文本自身包含的子串」做输出断言，
 * 见 docs/learnings/2026-07/testing-assertion-poisoned-by-command-echo.md。
 */
import { describe, expect, it, afterEach, beforeAll } from "vitest";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import {
  buildSandboxProfile,
  buildSandboxSpawn,
  findSandboxViolationEvidence,
  formatSandboxViolationHint,
  probeSandbox,
} from "../tools/bash/sandbox";
import { bashExecutor } from "../tools/bash/executor";
import { bashTaskRegistry } from "../tools/bash/task-registry";
import type { BashResult } from "../tools/bash/executor";

describe("buildSandboxProfile", () => {
  const input = {
    workspaceRoot: "/ws/root",
    sessionTmp: "/tmp/session",
    darwinTmp: "/var/folders/xx",
    sensitiveReadDenyPaths: ["/home/user/.ssh", "/home/user/.aws"],
  };

  it("uses a deny-default baseline", () => {
    const { profileSource } = buildSandboxProfile(input);
    expect(profileSource).toContain("(deny default");
    expect(profileSource.indexOf("(version 1)")).toBe(0);
  });

  it("never embeds paths in the profile source (injection surface)", () => {
    const { profileSource, params } = buildSandboxProfile(input);
    for (const value of Object.values(params)) {
      expect(profileSource).not.toContain(value);
    }
    // 路径经 -D 参数注入
    expect(params.WORKSPACE_ROOT).toBe("/ws/root");
    expect(params.SESSION_TMP).toBe("/tmp/session");
    expect(params.DARWIN_TMP).toBe("/var/folders/xx");
    expect(params.SENSITIVE_0).toBe("/home/user/.ssh");
    expect(params.SENSITIVE_1).toBe("/home/user/.aws");
  });

  it("restricts writes to the three regions via params", () => {
    const { profileSource } = buildSandboxProfile(input);
    expect(profileSource).toContain('(subpath (param "WORKSPACE_ROOT"))');
    expect(profileSource).toContain('(subpath (param "SESSION_TMP"))');
    expect(profileSource).toContain('(subpath (param "DARWIN_TMP"))');
  });

  it("places sensitive read denies after the broad read allow (last-match-wins)", () => {
    const { profileSource } = buildSandboxProfile(input);
    const allowIndex = profileSource.indexOf("(allow file-read*)");
    const denyIndex = profileSource.indexOf('(deny file-read*\n  (subpath (param "SENSITIVE_0"))');
    expect(allowIndex).toBeGreaterThan(-1);
    expect(denyIndex).toBeGreaterThan(allowIndex);
  });

  it("omits the sensitive deny block when the list is empty", () => {
    const { profileSource } = buildSandboxProfile({ ...input, sensitiveReadDenyPaths: [] });
    expect(profileSource).not.toContain("SENSITIVE_");
    expect(profileSource).toContain("(allow file-read*)");
  });

  it("denies workspace .git/hooks and .git/config writes after the write allow (last-match-wins)", () => {
    const { profileSource, params } = buildSandboxProfile(input);
    expect(params.WORKSPACE_GIT_HOOKS).toBe("/ws/root/.git/hooks");
    expect(params.WORKSPACE_GIT_CONFIG).toBe("/ws/root/.git/config");

    const writeAllowIndex = profileSource.indexOf('(allow file-write*\n  (subpath (param "WORKSPACE_ROOT"))');
    const hooksDenyIndex = profileSource.indexOf('(subpath (param "WORKSPACE_GIT_HOOKS"))');
    const configDenyIndex = profileSource.indexOf('(literal (param "WORKSPACE_GIT_CONFIG"))');
    expect(writeAllowIndex).toBeGreaterThan(-1);
    expect(hooksDenyIndex).toBeGreaterThan(writeAllowIndex);
    expect(configDenyIndex).toBeGreaterThan(writeAllowIndex);
  });
});

describe("findSandboxViolationEvidence", () => {
  it("matches EPERM-style failures", () => {
    const evidence = findSandboxViolationEvidence(
      "npm ERR! Error: EPERM: operation not permitted, open '/usr/local/lib/x'",
    );
    expect(evidence).toContain("EPERM");
  });

  it("returns undefined for unrelated failures", () => {
    expect(findSandboxViolationEvidence("Error: Cannot find module 'left-pad'")).toBeUndefined();
  });

  it("formats a hint that mentions escalation", () => {
    const hint = formatSandboxViolationHint("some evidence");
    expect(hint).toContain("no_sandbox");
    expect(hint).toContain("some evidence");
  });
});

// ─── 沙盒集成测试（darwin + 运行时探测通过才跑） ───

let sandboxAvailable = false;
beforeAll(async () => {
  sandboxAvailable = await probeSandbox();
});

describe("sandboxed bash execution (darwin only)", () => {
  afterEach(() => {
    bashTaskRegistry.harvestAll();
    bashTaskRegistry.clear();
  });

  async function createWorkspace(): Promise<string> {
    return mkdtemp(join(tmpdir(), "actspace-sbx-ws-"));
  }

  it("allows writes inside the workspace", async (ctx) => {
    if (!sandboxAvailable) return ctx.skip();
    const workspace = await createWorkspace();
    const tmpRoot = await mkdtemp(join(tmpdir(), "actspace-sbx-tmp-"));
    try {
      const result = await bashExecutor(
        { command: "printf 'marker-%s' 'inside' > sbx-write-test.txt" },
        workspace,
        { sandbox: true, tmpRoot, sessionId: "sbx-test" },
      );
      expect(result.success).toBe(true);
      expect((result.data as BashResult).sandboxed).toBe(true);
      const written = await readFile(join(workspace, "sbx-write-test.txt"), "utf8");
      expect(written).toBe("marker-inside");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("blocks writes outside the workspace and annotates the violation", async (ctx) => {
    if (!sandboxAvailable) return ctx.skip();
    const workspace = await createWorkspace();
    const tmpRoot = await mkdtemp(join(tmpdir(), "actspace-sbx-tmp-"));
    // home 不在写白名单（workspace / session tmp / darwin tmp）内
    const outsideTarget = join(homedir(), `.actspace-sbx-test-${Date.now()}`);
    try {
      const result = await bashExecutor(
        { command: `touch ${outsideTarget}` },
        workspace,
        { sandbox: true, tmpRoot, sessionId: "sbx-test" },
      );
      expect(result.success).toBe(false);
      const data = result.data as BashResult;
      expect(data.sandboxed).toBe(true);
      expect(data.sandboxViolationHint).toContain("no_sandbox");
      // 文件不应真的被创建
      await expect(stat(outsideTarget)).rejects.toThrow();
    } finally {
      await rm(outsideTarget, { force: true });
      await rm(workspace, { recursive: true, force: true });
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("denies reads of sensitive paths (injected stand-in)", async (ctx) => {
    if (!sandboxAvailable) return ctx.skip();
    const workspace = await createWorkspace();
    const tmpRoot = await mkdtemp(join(tmpdir(), "actspace-sbx-tmp-"));
    // 临时目录替身模拟 ~/.ssh，避免测试依赖真实敏感目录
    const sensitiveDir = await mkdtemp(join(tmpdir(), "actspace-sbx-sensitive-"));
    const secretFile = join(sensitiveDir, "secret.txt");
    await writeFile(secretFile, "super-secret-value", "utf8");
    try {
      const result = await bashExecutor(
        { command: `cat ${secretFile}` },
        workspace,
        { sandbox: true, tmpRoot, sessionId: "sbx-test", sandboxSensitivePaths: [sensitiveDir] },
      );
      expect(result.success).toBe(false);
      const data = result.data as BashResult;
      expect(data.output).not.toContain("super-secret-value");
      expect(data.sandboxViolationHint).toBeDefined();
    } finally {
      await rm(sensitiveDir, { recursive: true, force: true });
      await rm(workspace, { recursive: true, force: true });
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("blocks writes to the workspace root repo's .git/hooks and .git/config", async (ctx) => {
    if (!sandboxAvailable) return ctx.skip();
    const workspace = await createWorkspace();
    const tmpRoot = await mkdtemp(join(tmpdir(), "actspace-sbx-tmp-"));
    try {
      // .git 目录本身可写（不影响 mkdir .git 等常规操作）
      const mkdirResult = await bashExecutor(
        { command: "mkdir .git" },
        workspace,
        { sandbox: true, tmpRoot, sessionId: "sbx-test" },
      );
      expect(mkdirResult.success).toBe(true);

      // hooks 子树与 config 文件是延迟执行点，定向禁写
      const hooksResult = await bashExecutor(
        { command: "mkdir -p .git/hooks" },
        workspace,
        { sandbox: true, tmpRoot, sessionId: "sbx-test" },
      );
      expect(hooksResult.success).toBe(false);
      expect((hooksResult.data as BashResult).sandboxViolationHint).toBeDefined();

      const configResult = await bashExecutor(
        { command: "touch .git/config" },
        workspace,
        { sandbox: true, tmpRoot, sessionId: "sbx-test" },
      );
      expect(configResult.success).toBe(false);
      await expect(stat(join(workspace, ".git", "config"))).rejects.toThrow();
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("runs in the real environment when no_sandbox was approved", async (ctx) => {
    if (!sandboxAvailable) return ctx.skip();
    const workspace = await createWorkspace();
    const tmpRoot = await mkdtemp(join(tmpdir(), "actspace-sbx-tmp-"));
    const outsideDir = await mkdtemp(join(homedir(), ".actspace-sbx-real-"));
    const outsideTarget = join(outsideDir, "escalated.txt");
    try {
      const result = await bashExecutor(
        {
          command: `printf 'marker-%s' 'escalated' > ${outsideTarget}`,
          requiredPermissions: ["no_sandbox"],
        },
        workspace,
        { sandbox: true, tmpRoot, sessionId: "sbx-test" },
      );
      expect(result.success).toBe(true);
      expect((result.data as BashResult).sandboxed).toBe(false);
      const written = await readFile(outsideTarget, "utf8");
      expect(written).toBe("marker-escalated");
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
      await rm(workspace, { recursive: true, force: true });
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("points TMPDIR at the session sandbox tmp", async (ctx) => {
    if (!sandboxAvailable) return ctx.skip();
    const workspace = await createWorkspace();
    const tmpRoot = await mkdtemp(join(tmpdir(), "actspace-sbx-tmp-"));
    try {
      const result = await bashExecutor(
        { command: "printf 'tmpdir-is-%s' \"$TMPDIR\"" },
        workspace,
        { sandbox: true, tmpRoot, sessionId: "sbx-test" },
      );
      expect(result.success).toBe(true);
      const data = result.data as BashResult;
      expect(data.output).toContain("tmpdir-is-");
      expect(data.output).toContain(join("sandbox", "sbx-test"));
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("buildSandboxSpawn writes the profile and injects paths via -D", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "actspace-sbx-spawn-"));
    const workspace = await mkdtemp(join(tmpdir(), "actspace-sbx-ws2-"));
    try {
      const spec = await buildSandboxSpawn({
        command: "true",
        workspaceRoot: workspace,
        tmpRoot,
        sessionId: "spawn-test",
      });
      expect(spec.command).toBe("/usr/bin/sandbox-exec");
      expect(spec.args[0]).toBe("-f");
      expect(spec.args[1]).toBe(spec.profilePath);
      expect(spec.args.slice(-3)).toEqual(["bash", "-lc", "true"]);
      expect(spec.env.TMPDIR).toBe(spec.sessionTmp);

      const profile = await readFile(spec.profilePath, "utf8");
      expect(profile).toContain("(deny default");
      // profile 源码不含任何注入路径
      expect(profile).not.toContain(workspace);
      const dIndex = spec.args.indexOf("-D");
      expect(dIndex).toBeGreaterThan(-1);
      expect(spec.args.join(" ")).toContain("WORKSPACE_ROOT=");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
