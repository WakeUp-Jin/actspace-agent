import { access, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");
const cliPath = resolve(__dirname, "../../dist/cli.js");
const execFileAsync = promisify(execFile);

beforeAll(async () => {
  await execFileAsync("pnpm", ["--filter", "@actspace/agent-cli", "build"], {
    cwd: repoRoot,
  });
});

describe("built CLI process", () => {
  it("keeps stdin text output and structured stdout machine-readable", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-cli-process-work-"));
    const dataRoot = join(workspace, "data-not-created");
    const text = await runProcess([
      "run", "--workspace", workspace, "--data-dir", dataRoot, "--mock",
    ], "say hi");
    expect(text).toMatchObject({ code: 0, stderr: "" });
    expect(text.stdout).toBe("Mock ActSpace Agent response.\n");
    await expect(access(dataRoot)).rejects.toThrow();

    const json = await runProcess([
      "run", "--input", "say hi", "--workspace", workspace, "--mock", "--json",
    ]);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: true, exitCode: 0 });

    const defaultWorkspace = await runProcess([
      "run", "--input", "say hi", "--mock", "--json",
    ], undefined, { cwd: workspace });
    expect(defaultWorkspace.code).toBe(0);
    const canonicalWorkspace = await realpath(workspace);
    expect(JSON.parse(defaultWorkspace.stdout)).toMatchObject({
      ok: true,
      exitCode: 0,
      workspace: canonicalWorkspace,
    });

    const jsonl = await runProcess([
      "run", "--input", "say hi", "--workspace", workspace, "--mock", "--jsonl",
    ]);
    expect(jsonl.code).toBe(0);
    const lines = jsonl.stdout.trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.at(-1)).toMatchObject({ type: "run_result", result: { exitCode: 0 } });
    expect(lines.filter((line) => line.type === "runtime_event")).toHaveLength(3);
  });

  it("uses stable usage and SIGINT exit codes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-cli-process-work-"));
    const usage = await runProcess(["run", "--workspace", workspace, "--json", "--jsonl"]);
    expect(usage.code).toBe(2);
    expect(usage.stdout).toBe("");
    expect(usage.stderr).toContain("USAGE_ERROR");

    const interrupted = await runProcess([
      "run", "--workspace", workspace, "--mock", "--json",
    ], "say hi after interrupt", { interruptBeforeInput: true });
    expect(interrupted.code).toBe(130);
    expect(JSON.parse(interrupted.stdout)).toMatchObject({ status: "aborted", exitCode: 130 });
  });
});

function runProcess(
  args: string[],
  input?: string,
  options: { interruptBeforeInput?: boolean; cwd?: string } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`CLI process timed out: ${args.join(" ")}`));
    }, 10_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolveResult({ code, stdout, stderr });
    });
    if (options.interruptBeforeInput) {
      setTimeout(() => {
        child.kill("SIGINT");
        setTimeout(() => child.stdin.end(input ?? ""), 25);
      }, 500);
    } else {
      child.stdin.end(input ?? "");
    }
  });
}
