import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, realpath } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runProcess } from "../subprocess/run-process";
import { getRipgrepFailureMessage, runRipgrep } from "../subprocess/ripgrep";
import { clearRipgrepCommandCache, resolveRipgrepCommand } from "../subprocess/ripgrep-path";

async function createWorkspace(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), "actspace-subprocess-test-")));
}

describe("runProcess", () => {
  it("captures stdout, stderr, and exit code", async () => {
    const cwd = await createWorkspace();
    const result = await runProcess({
      command: process.execPath,
      args: ["-e", "process.stdout.write('out'); process.stderr.write('err'); process.exit(3);"],
      cwd,
      timeoutMs: 5_000,
      maxOutputChars: 1_000,
    });

    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
    expect(result.exitCode).toBe(3);
    expect(result.timedOut).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it("marks output as truncated", async () => {
    const cwd = await createWorkspace();
    const result = await runProcess({
      command: process.execPath,
      args: ["-e", "process.stdout.write('abcdef');"],
      cwd,
      timeoutMs: 5_000,
      maxOutputChars: 3,
    });

    expect(result.stdout).toBe("abc");
    expect(result.truncated).toBe(true);
  });

  it("marks timed out processes", async () => {
    const cwd = await createWorkspace();
    const result = await runProcess({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 1000);"],
      cwd,
      timeoutMs: 50,
      maxOutputChars: 1_000,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  it("captures process start errors", async () => {
    const cwd = await createWorkspace();
    const result = await runProcess({
      command: "actspace-command-that-does-not-exist",
      args: [],
      cwd,
      timeoutMs: 5_000,
      maxOutputChars: 1_000,
    });

    expect(result.startError).toContain("ENOENT");
    expect(result.exitCode).toBeNull();
  });
});

describe("runRipgrep", () => {
  it("uses ACTSPACE_RG_PATH when it points to a runnable ripgrep binary", async () => {
    let rgPath: string;
    try {
      rgPath = execFileSync("which", ["rg"], { encoding: "utf8" }).trim();
    } catch {
      return;
    }

    const cwd = await createWorkspace();
    clearRipgrepCommandCache();
    const command = await resolveRipgrepCommand({
      cwd,
      env: {
        ...process.env,
        ACTSPACE_RG_PATH: rgPath,
        PATH: "",
      },
    });

    expect(command).toMatchObject({ command: rgPath, source: "env" });
  });

  it("falls back to bundled ripgrep when PATH does not contain rg", async () => {
    const cwd = await createWorkspace();
    clearRipgrepCommandCache();
    const command = await resolveRipgrepCommand({
      cwd,
      env: {
        ...process.env,
        PATH: "",
      },
    });

    expect(command?.source).toBe("bundled");
    expect(command?.command).toContain("rg");
  });

  it("maps missing rg to a clear failure message", async () => {
    const cwd = await createWorkspace();
    const oldPath = process.env.PATH;
    const oldRgPath = process.env.ACTSPACE_RG_PATH;

    process.env.ACTSPACE_RG_PATH = join(cwd, "missing-rg");
    process.env.PATH = "";
    try {
      clearRipgrepCommandCache();
      const result = await runRipgrep({
        args: ["--version"],
        cwd,
        timeoutMs: 5_000,
      });

      expect(result.notFound).toBe(true);
      expect(getRipgrepFailureMessage(result)).toContain("ripgrep (rg) is required");
    } finally {
      process.env.PATH = oldPath;
      if (oldRgPath === undefined) {
        delete process.env.ACTSPACE_RG_PATH;
      } else {
        process.env.ACTSPACE_RG_PATH = oldRgPath;
      }
      clearRipgrepCommandCache();
    }
  });

  it("preserves ripgrep exit code 1 as a process result when rg is available", async () => {
    try {
      execFileSync("rg", ["--version"], { stdio: "ignore" });
    } catch {
      return;
    }

    const cwd = await createWorkspace();
    const result = await runRipgrep({
      args: ["definitely-not-present", cwd],
      cwd,
      timeoutMs: 5_000,
    });

    expect(result.exitCode).toBe(1);
    expect(result.notFound).toBe(false);
  });
});
