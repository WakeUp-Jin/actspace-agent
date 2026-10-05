import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { startAgentProvider } from "./fixtures/agent-provider.mjs";
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
  return jsonLines(output.slice(0, output.lastIndexOf("\n") + 1)).some((value) => value.type === "runtime_event"
    && value.event?.kind === "run-state"
    && value.event?.message === message);
}

function jsonLines(output) {
  return output.split("\n").filter(line => line.trim()).map(line => JSON.parse(line));
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
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveExit({ code, signal });
    });
  });
}

for (const format of ["json", "jsonl"]) for (const scenario of ["success", "terminal-error", "persistent-error"]) {
  test(`real HTTP CLI ${scenario} preserves ${format} protocol, settlement and resume`, async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-cli-http-"));
    const provider = await startAgentProvider({ scenario });
    try {
      const run = async (input, resume) => {
        const child = spawn(process.execPath, [cliEntry, "run", `--${format}`, "--persist", "--data-dir", join(root, "data"), "--workspace", root, "--model", "fixture-main", "--input", input, ...(resume ? ["--resume", resume] : [])], {
          cwd: repoRoot, env: { ...process.env, HOME: join(root, "home"), LLM_PROVIDER: "fixture", LLM_API: "openai-completions", FIXTURE_BASE_URL: provider.baseUrl, FIXTURE_API_KEY: "synthetic-credential-for-cli" }, stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "", stderr = "";
        child.stdout.on("data", chunk => { stdout += chunk; });
        child.stderr.on("data", chunk => { stderr += chunk; });
        const exit = await waitForExit(child, 20_000);
        assert.equal(exit.signal, null);
        assert.doesNotMatch(stdout + stderr, /synthetic-credential-for-cli/);
        const values = format === "json" ? [JSON.parse(stdout)] : jsonLines(stdout);
        if (format === "jsonl") assert.ok(values.every(value => ["runtime_event", "run_result"].includes(value.type)));
        const results = format === "json" ? values : values.filter(value => value.type === "run_result").map(value => value.result);
        assert.equal(results.length, 1, stderr);
        return { ...exit, result: results[0], stderr };
      };
      const first = await run("first fixture task");
      const code = scenario === "success" ? 0 : 1;
      assert.equal(first.code, code, first.stderr);
      assert.equal(first.result.status, scenario === "success" ? "completed" : "failed");
      assert.equal(first.result.exitCode, code);
      assert.equal(provider.requests.length, 1, "default policy performs exactly one wire attempt");
      const journalPath = join(root, "data/sessions-v2", first.result.sessionId, "journal.jsonl");
      const before = jsonLines(await readFile(journalPath, "utf8"));
      assert.equal(before.filter(event => event.type === "user/message").length, 1);
      assert.equal(before.filter(event => event.type === "plugin/actspace.agent-service/task" && event.data.op === "accept").length, 1);
      const settlements = before.filter(event => event.type === "plugin/actspace.agent-service/run" && event.data.op === "finish");
      assert.equal(settlements.length, 1);
      assert.equal(settlements[0].data.outcome, scenario === "success" ? "completed" : "failed");
      if (scenario !== "success") {
        const failure = before.find(event => event.type === "turn/end" && event.data.reason === "failed");
        assert.match(failure?.data.failure?.message ?? "", /fixture/);
        assert.match(first.result.error?.message ?? "", /fixture/);
        assert.match(first.stderr, /fixture/);
      }
      const second = await run("second fixture task", first.result.sessionId);
      assert.equal(second.code, code, second.stderr);
      assert.equal(second.result.sessionId, first.result.sessionId);
      assert.equal(provider.requests.length, 2, "resume must not replay settled work");
      const after = jsonLines(await readFile(journalPath, "utf8"));
      assert.equal(after.filter(event => event.type === "user/message").length, 2);
      assert.equal(after.filter(event => event.type === "plugin/actspace.agent-service/task" && event.data.op === "accept").length, 2);
    } finally { await provider.close(); await rm(root, { recursive: true, force: true }); }
  });
}

for (const scenario of ["retry-once", "persistent-error", "retry-wait"]) {
  test(`real Loop retry assembly: ${scenario}, cancellation and writer reacquisition`, async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-cli-retry-"));
    const provider = await startAgentProvider({ scenario });
    let child;
    try {
      const env = { ...process.env, HOME: join(root, "home"), LLM_PROVIDER: "fixture", LLM_API: "openai-completions", FIXTURE_BASE_URL: provider.baseUrl, FIXTURE_API_KEY: "synthetic-retry-credential", FIXTURE_RETRY_DELAY_MS: scenario === "retry-wait" ? "30000" : "10" };
      const args = ["run", "--jsonl", "--persist", "--data-dir", join(root, "data"), "--workspace", root, "--model", "fixture-main", "--input", "retry fixture task"];
      const launch = (entry, extra = []) => {
        child = spawn(process.execPath, [entry, ...args, ...extra], { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "", stderr = "";
        child.stdout.on("data", chunk => { stdout += chunk; });
        child.stderr.on("data", chunk => { stderr += chunk; });
        return { child, output: () => ({ stdout, stderr }), exit: waitForExit(child, 20_000) };
      };
      const first = launch(join(repoRoot, "scripts/test/fixtures/cli-with-retry.mjs"));
      let journalPath;
      if (scenario === "retry-wait") {
        // Wait for durable retry intent, not a timing guess after HTTP arrival.
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const { readdir } = await import("node:fs/promises");
          const ids = await readdir(join(root, "data/sessions-v2")).catch(() => []);
          for (const id of ids) {
            const candidate = join(root, "data/sessions-v2", id, "journal.jsonl");
            const data = await readFile(candidate, "utf8").catch(() => "");
            if (data.includes('"type":"llm/retry"')) journalPath = candidate;
          }
          if (journalPath) break;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.ok(journalPath, "never reached persisted retry wait");
        assert.equal(provider.requests.length, 1);
        first.child.kill("SIGINT");
      }
      const exit = await first.exit;
      const { stdout, stderr } = first.output();
      const code = scenario === "retry-once" ? 0 : scenario === "retry-wait" ? 130 : 1;
      assert.equal(exit.code, code, stderr);
      assert.equal(exit.signal, null);
      assert.doesNotMatch(stdout + stderr, /synthetic-retry-credential/);
      const values = jsonLines(stdout);
      assert.ok(values.every(value => ["runtime_event", "run_result"].includes(value.type)));
      const finals = values.filter(value => value.type === "run_result");
      assert.equal(finals.length, 1);
      const result = finals[0].result;
      assert.equal(result.status, code === 0 ? "completed" : code === 130 ? "aborted" : "failed");
      assert.equal(provider.requests.length, code === 130 ? 1 : 2);
      journalPath ??= join(root, "data/sessions-v2", result.sessionId, "journal.jsonl");
      const before = jsonLines(await readFile(journalPath, "utf8"));
      assert.equal(before.filter(event => event.type === "llm/retry").length, 1);
      assert.equal(before.filter(event => event.type === "user/message").length, 1);
      assert.equal(before.filter(event => event.type === "plugin/actspace.agent-service/task" && event.data.op === "accept").length, 1);
      const settled = before.filter(event => event.type === "plugin/actspace.agent-service/run" && event.data.op === "finish");
      assert.equal(settled.length, 1);
      assert.equal(settled[0].data.outcome, code === 130 ? "cancelled" : result.status);
      if (code === 1) { assert.match(result.error.message, /fixture/); assert.match(stderr, /fixture/); }
      const count = provider.requests.length;
      const second = launch(cliEntry, ["--resume", result.sessionId]);
      assert.equal((await second.exit).code, scenario === "retry-once" ? 0 : 1, second.output().stderr);
      assert.equal(provider.requests.length, count + 1, "settled task must not rerun on resume");
      const after = jsonLines(await readFile(journalPath, "utf8"));
      assert.equal(after.filter(event => event.type === "user/message").length, 2);
      assert.equal(after.filter(event => event.type === "plugin/actspace.agent-service/run" && event.data.op === "finish").length, 2);
    } finally {
      if (child?.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await provider.close(); await rm(root, { recursive: true, force: true });
    }
  });
}

test("acceptance hold emits SSE keepalive comments and preserves request IDs across provider restarts", async () => {
  const provider = await startAgentProvider({ heartbeatMs: 25, initialRequestId: 40 });
  const port = Number(new URL(provider.baseUrl).port);
  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture-main", stream: true, messages: [{ role: "user", content: "FIXTURE_HOLD" }] }),
      signal: AbortSignal.timeout(3000),
    });
    const reader = response.body.getReader();
    let text = "";
    while (!text.includes(": fixture keepalive")) {
      const part = await reader.read();
      assert.equal(part.done, false);
      text += new TextDecoder().decode(part.value);
    }
    assert.equal(provider.requests[0].id, 41);
    assert.ok(!text.includes("[DONE]"));
    provider.control("release");
    while (true) { const part = await reader.read(); if (part.done) break; text += new TextDecoder().decode(part.value); }
    assert.match(text, /Fixture completed/);
    assert.match(text, /\[DONE\]/);
  } finally { await provider.close(); }
  const restarted = await startAgentProvider({ port, initialRequestId: 41 });
  try { assert.equal(Number(new URL(restarted.baseUrl).port), port); }
  finally { await restarted.close(); }
});
