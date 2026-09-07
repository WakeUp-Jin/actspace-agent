import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliEntry = join(repoRoot, "apps", "cli", "dist", "cli.js");

test("CLI run aborts an active headless Profile turn on SIGINT and exits 130", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "actspace-cli-sigint-"));
  let child;
  try {
    child = spawn(process.execPath, [
      cliEntry,
      "run",
      "--mock",
      "--jsonl",
      "--data-dir",
      join(temporaryRoot, "data"),
      "--workspace",
      repoRoot,
      "--input",
      "process signal smoke",
    ], {
      cwd: repoRoot,
      env: { ...process.env, HOME: join(temporaryRoot, "home") },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let signaled = false;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (signaled || !hasStartedEvent(stdout)) return;
      signaled = true;
      child.kill("SIGINT");
    });

    const { code, signal } = await waitForExit(child, 10_000);
    assert.equal(signaled, true, `CLI never emitted the active run boundary. stderr: ${stderr}`);
    assert.equal(signal, null);
    assert.equal(code, 130, `CLI exited unexpectedly. stdout: ${stdout}\nstderr: ${stderr}`);
    const result = jsonLines(stdout).find((value) => value.type === "run_result")?.result;
    assert.deepEqual(
      { status: result?.status, exitCode: result?.exitCode, ok: result?.ok },
      { status: "aborted", exitCode: 130, ok: false },
    );
  } finally {
    if (child?.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("a second SIGINT force-exits an already aborting CLI run with code 130", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "actspace-cli-double-sigint-"));
  let child;
  try {
    child = spawn(process.execPath, [
      cliEntry,
      "run",
      "--mock",
      "--jsonl",
      "--data-dir",
      join(temporaryRoot, "data"),
      "--workspace",
      repoRoot,
      "--input",
      "double signal smoke",
    ], {
      cwd: repoRoot,
      env: { ...process.env, HOME: join(temporaryRoot, "home") },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let firstSent = false;
    let secondSent = false;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!firstSent && hasRunState(stdout, "started")) {
        firstSent = child.kill("SIGINT");
        return;
      }
      if (firstSent && !secondSent && hasRunState(stdout, "aborted")) secondSent = child.kill("SIGINT");
    });

    const { code, signal } = await waitForExit(child, 10_000);
    assert.equal(firstSent, true, `CLI never reached the active run boundary. stderr: ${stderr}`);
    assert.equal(secondSent, true, `CLI exited before the second interrupt boundary. stdout: ${stdout}\nstderr: ${stderr}`);
    assert.equal(signal, null);
    assert.equal(code, 130);
  } finally {
    if (child?.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

function hasStartedEvent(output) {
  return hasRunState(output, "started");
}

function hasRunState(output, message) {
  return jsonLines(output).some((value) => value.type === "runtime_event"
    && value.event?.kind === "run-state"
    && value.event?.message === message);
}

function jsonLines(output) {
  return output.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`CLI process did not exit within ${timeoutMs}ms.`));
    }, timeoutMs);
    timer.unref?.();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolveExit({ code, signal });
    });
  });
}
