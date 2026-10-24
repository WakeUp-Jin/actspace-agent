import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { startAgentProvider } from "./fixtures/agent-provider.mjs";

const cli = resolve("apps/cli/dist/cli.js");
function launch(root, provider, extra = [], key = "fixture_NONSTANDARD_secret_42", input = "safety fixture") {
  const child = spawn(process.execPath, [cli, "run", "--jsonl", "--persist", "--workspace", root, "--data-dir", join(root, "data"), "--model", "fixture-main", "--input", input, ...extra], {
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, HOME: join(root, "home"), LLM_PROVIDER: "fixture", LLM_API: "openai-completions", FIXTURE_BASE_URL: provider.baseUrl, FIXTURE_API_KEY: key },
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
  const exit = new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("CLI safety fixture timed out")); }, 15_000);
    child.once("close", (code, signal) => { clearTimeout(timer); resolveExit({ code, signal }); });
    child.once("error", reject);
  });
  return { child, exit, output: () => ({ stdout, stderr }) };
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`${signal} drains background descendants and resumes without replaying the cancelled task`, { skip: process.platform === "win32" }, async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-background-recovery-"));
    await writeFile(join(root, "worker.cjs"), `const fs = require('node:fs'); const cp = require('node:child_process');
      process.on('SIGTERM', () => {});
      if (process.argv[2] !== 'grandchild') {
        fs.appendFileSync('starts.txt', 'start\\n');
        cp.spawn(process.execPath, [__filename, 'grandchild'], {stdio: 'ignore'});
      }
      fs.writeFileSync(process.argv[2] === 'grandchild' ? 'grandchild.pid' : 'child.pid', String(process.pid));
      setInterval(() => {}, 1000);`);
    const provider = await startAgentProvider({ toolCommand: "node worker.cjs", toolBlockMs: 0 });
    provider.control("hold");
    let resumedInputSeen = false;
    const recoveredProvider = await startAgentProvider({ onRequest: (_entry, body) => {
      resumedInputSeen ||= body.messages.some(message => message.role === "user" && JSON.stringify(message.content).includes("fresh recovery task"));
    } });
    let run, resumed;
    const pids = [];
    try {
      run = launch(root, provider, ["--permission-mode", "full-access"]);
      await until(async () => { try {
        const ids = await Promise.all(["child.pid", "grandchild.pid"].map(p => readFile(join(root, p), "utf8")));
        pids.splice(0, pids.length, ...ids.map(Number));
        return pids.every(alive) && provider.requests.some(request => request.toolResults === 1);
      } catch { return false; } }, "background descendants or post-tool request never started");
      const paths = (await files(join(root, "data/sessions-v2"))).filter(path => path.endsWith("journal.jsonl"));
      assert.equal(paths.length, 1);
      const journalPath = paths[0];
      assert.match(await readFile(journalPath, "utf8"), /background-task/,
        "must reach a durably returned background tool result before interrupting");
      run.child.kill(signal);
      const exit = await run.exit;
      assert.deepEqual(exit, { code: signal === "SIGINT" ? 130 : 143, signal: null }, run.output().stderr);
      await until(() => pids.every(pid => !alive(pid)), "background descendants survived shutdown");
      const resultEvents = run.output().stdout.trim().split("\n").map(JSON.parse).filter(event => event.type === "run_result");
      assert.equal(resultEvents.length, 1);
      const result = resultEvents[0].result;
      assert.equal(result.status, "aborted");
      const before = (await readFile(journalPath, "utf8")).trim().split("\n").map(JSON.parse);
      const finishes = before.filter(event => event.type === "plugin/actspace.agent-service/run" && event.data.op === "finish");
      assert.equal(finishes.length, 1);
      assert.equal(finishes[0].data.outcome, "cancelled");
      assert.equal(await readFile(join(root, "starts.txt"), "utf8"), "start\n");

      resumed = launch(root, recoveredProvider, ["--resume", result.sessionId], undefined, "fresh recovery task");
      assert.deepEqual(await resumed.exit, { code: 0, signal: null }, resumed.output().stderr);
      const next = resumed.output().stdout.trim().split("\n").map(JSON.parse).filter(event => event.type === "run_result");
      assert.equal(next.length, 1);
      assert.equal(next[0].result.status, "completed");
      assert.equal(next[0].result.sessionId, result.sessionId);
      assert.equal(recoveredProvider.requests.length, 1, "resume must issue only the fresh task request");
      assert.ok(resumedInputSeen, "the resumed provider request must contain the fresh human task");
      assert.equal(await readFile(join(root, "starts.txt"), "utf8"), "start\n", "old background command was replayed");
      const after = (await readFile(journalPath, "utf8")).trim().split("\n").map(JSON.parse);
      assert.equal(after.filter(event => event.type === "user/message").length, 2);
      assert.deepEqual(after.filter(event => event.type === "plugin/actspace.agent-service/run" && event.data.op === "finish").map(event => event.data.outcome), ["cancelled", "completed"]);
    } finally {
      for (const owned of [run, resumed]) if (owned?.child.exitCode === null && owned.child.signalCode === null) owned.child.kill("SIGKILL");
      for (const pid of pids) if (alive(pid)) process.kill(pid, "SIGKILL");
      await provider.close();
      await recoveredProvider.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
async function until(check, message) {
  for (let i = 0; i < 300; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 20)); }
  assert.fail(message);
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)]))).flat();
}

test("provider credential echo is removed from protocol, diagnostics, Journal and exported artifacts", async () => {
  const secret = "fixture_NONSTANDARD_secret_42";
  const echoed = `400 fixture credential echo ${secret}`;
  assert.ok(echoed.includes(secret));
  const provider = await startAgentProvider({ scenario: "terminal-error", errorMessage: echoed });
  const root = await mkdtemp(join(tmpdir(), "actspace-redaction-"));
  try {
    const run = launch(root, provider, ["--out", join(root, "out")], secret);
    assert.equal((await run.exit).code, 1);
    const { stdout, stderr } = run.output();
    assert.ok(provider.requests.length > 0);
    assert.match(stdout + stderr, /\[REDACTED\]/);
    const results = stdout.trim().split("\n").map(JSON.parse).filter(e => e.type === "run_result");
    assert.equal(results.length, 1);
    assert.equal(results[0].result.status, "failed");
    const text = [stdout, stderr, ...(await Promise.all((await files(root)).filter(p => /\.(jsonl?|md|txt)$/.test(p)).map(p => readFile(p, "utf8"))))].join("\n");
    assert.ok(!text.includes(secret), "credential survived in a public output");
  } finally { await provider.close(); await rm(root, { recursive: true, force: true }); }
});

for (const signal of ["SIGINT", "SIGTERM"]) for (const repeat of [false, true]) {
  test(`${signal}${repeat ? " repeated" : ""} cleans silent owned child and grandchild`, { skip: process.platform === "win32" }, async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-owned-process-"));
    await writeFile(join(root, "worker.cjs"), `const fs = require('node:fs'); const cp = require('node:child_process');
      process.on('SIGTERM', () => {});
      if (process.argv[2] !== 'grandchild') cp.spawn(process.execPath, [__filename, 'grandchild'], {stdio: 'ignore'});
      fs.writeFileSync(process.argv[2] === 'grandchild' ? 'grandchild.pid' : 'child.pid', String(process.pid));
      setInterval(() => {}, 1000);`);
    const provider = await startAgentProvider({ toolCommand: "node worker.cjs" });
    let run; const pids = [];
    try {
      run = launch(root, provider, ["--permission-mode", "full-access"]);
      await until(async () => { try {
        const ids = await Promise.all(["child.pid", "grandchild.pid"].map(p => readFile(join(root, p), "utf8")));
        pids.splice(0, pids.length, ...ids.map(Number)); return pids.every(alive);
      } catch { return false; } }, "owned descendants never started");
      run.child.kill(signal);
      if (repeat) { await new Promise(r => setTimeout(r, 30)); run.child.kill(signal); }
      const exit = await run.exit;
      assert.deepEqual(exit, { code: signal === "SIGINT" ? 130 : 143, signal: null }, run.output().stderr);
      await until(() => pids.every(pid => !alive(pid)), "owned descendants survived CLI exit");
      if (!repeat) {
        const results = run.output().stdout.trim().split("\n").map(JSON.parse).filter(e => e.type === "run_result");
        assert.equal(results.length, 1);
        assert.equal(results[0].result.status, "aborted");
        assert.equal(results[0].result.exitCode, exit.code);
      }
    } finally {
      if (run?.child.exitCode === null && run.child.signalCode === null) run.child.kill("SIGKILL");
      for (const pid of pids) if (alive(pid)) process.kill(pid, "SIGKILL");
      await provider.close(); await rm(root, { recursive: true, force: true });
    }
  });
}
