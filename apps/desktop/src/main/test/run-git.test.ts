import * as childProcess from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isGitRunSuccess, runGitCommand, type GitRunResult } from "../git/run-git";

const calls = vi.hoisted(() => [] as unknown[][]);
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const execFile = (...args: unknown[]) => {
    calls.push(args);
    return (actual.execFile as (...input: unknown[]) => childProcess.ChildProcess)(...args);
  };
  return { ...actual, execFile, default: { ...actual, execFile } };
});

const roots: string[] = [];
let gitAvailable = true;
const options = (cwd: string, overrides: Partial<{ timeoutMs: number; maxOutputChars: number }> = {}) => ({ cwd, timeoutMs: 10_000, maxOutputChars: 64 * 1024, ...overrides });

beforeAll(() => {
  // 不用被测函数探测，免得它出错时相关用例被一起跳过。
  try {
    childProcess.execFileSync("git", ["--version"], { stdio: "ignore" });
  } catch {
    gitAvailable = false;
  }
});

afterEach(async () => {
  calls.length = 0;
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "actspace-run-git-")));
  roots.push(root);
  return root;
}

describe("runGitCommand", () => {
  it("runs git with -C cwd and without terminal prompts", async () => {
    const cwd = await tempDir();
    calls.length = 0;
    await runGitCommand(["--version"], options(cwd));
    const [file, args, execOptions] = calls[0] as [string, string[], { cwd: string; env: NodeJS.ProcessEnv }];
    expect(file).toBe("git");
    expect(args).toEqual(["-C", cwd, "--version"]);
    expect(execOptions.cwd).toBe(cwd);
    expect(execOptions.env.GIT_TERMINAL_PROMPT).toBe("0");
  });

  it("adds caller env vars but never lets them re-enable terminal prompts", async () => {
    const cwd = await tempDir();
    calls.length = 0;
    await runGitCommand(["--version"], { ...options(cwd), env: { LC_ALL: "C", GIT_TERMINAL_PROMPT: "1" } });
    const execOptions = calls[0]![2] as { env: NodeJS.ProcessEnv };
    expect(execOptions.env.LC_ALL).toBe("C");
    expect(execOptions.env.GIT_TERMINAL_PROMPT).toBe("0");
  });

  it("returns stdout and exit code 0 on success", async (context) => {
    if (!gitAvailable) context.skip();
    const result = await runGitCommand(["--version"], options(await tempDir()));
    expect(result).toMatchObject({ exitCode: 0, timedOut: false, truncated: false });
    expect(result.stdout).toMatch(/^git version /);
    expect(result.startError).toBeUndefined();
    expect(isGitRunSuccess(result)).toBe(true);
  });

  it("reports a non-zero exit with stderr and no start error", async (context) => {
    if (!gitAvailable) context.skip();
    const result = await runGitCommand(["definitely-not-a-git-command"], options(await tempDir()));
    expect(result.exitCode).toBe(1);
    // git 的提示随系统语言变化，只核对它带上了出错的子命令。
    expect(result.stderr).toContain("definitely-not-a-git-command");
    expect(result).toMatchObject({ timedOut: false, truncated: false });
    expect(result.startError).toBeUndefined();
    expect(isGitRunSuccess(result)).toBe(false);
  });

  it("reports a missing git executable as ENOENT with both code and message", async () => {
    vi.stubEnv("PATH", join(await tempDir(), "no-bin"));
    const result = await runGitCommand(["--version"], options(await tempDir()));
    expect(result.startError?.code).toBe("ENOENT");
    expect(result.startError?.message).toMatch(/spawn git ENOENT/);
    expect(result).toMatchObject({ exitCode: null, timedOut: false });
    expect(isGitRunSuccess(result)).toBe(false);
  });

  it("marks a command that exceeds the timeout as timed out", async (context) => {
    if (!gitAvailable) context.skip();
    // `hash-object --stdin` 等 stdin 关闭；execFile 不关 stdin，所以它会一直等到超时。
    const result = await runGitCommand(["hash-object", "--stdin"], options(await tempDir(), { timeoutMs: 200 }));
    expect(result).toMatchObject<Partial<GitRunResult>>({ exitCode: null, timedOut: true, truncated: false });
    expect(result.startError).toBeUndefined();
    expect(isGitRunSuccess(result)).toBe(false);
  });

  it("marks output over the limit as truncated, not timed out", async (context) => {
    if (!gitAvailable) context.skip();
    const result = await runGitCommand(["--version"], options(await tempDir(), { maxOutputChars: 4 }));
    expect(result).toMatchObject({ truncated: true, timedOut: false, exitCode: null });
    expect(result.stdout.length).toBeLessThanOrEqual(4);
    expect(result.startError?.code).toBe("ERR_CHILD_PROCESS_STDIO_MAXBUFFER");
    expect(isGitRunSuccess(result)).toBe(false);
  });

  it("treats a start error as failure even with exit code 0 from an injected runner", () => {
    const base: GitRunResult = { stdout: "", stderr: "", exitCode: 0, timedOut: false, truncated: false };
    expect(isGitRunSuccess(base)).toBe(true);
    expect(isGitRunSuccess({ ...base, startError: { code: "EACCES", message: "spawn git EACCES" } })).toBe(false);
    expect(isGitRunSuccess({ ...base, timedOut: true })).toBe(false);
  });
});
