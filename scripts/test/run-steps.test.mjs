import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runSteps } from "../run-steps.mjs";

const node = JSON.stringify(process.execPath);
const exitWith = (code) => `${node} -e "process.exit(${code})"`;
const touch = (file) => `${node} -e "require('node:fs').writeFileSync('${file}', '')"`;

async function withScratch(run) {
  const cwd = await mkdtemp(join(tmpdir(), "actspace-run-steps-"));
  try { return await run(cwd); } finally { await rm(cwd, { recursive: true, force: true }); }
}

test("a failed step does not stop the steps after it, and the run exits non-zero", async () => {
  await withScratch(async (cwd) => {
    const lines = [];
    const steps = [{ name: "first", command: exitWith(3) }, { name: "second", command: touch("second-ran") }, { name: "third", command: exitWith(1) }];
    assert.equal(await runSteps(steps, { cwd, log: (line) => lines.push(line) }), 1);
    assert.equal(existsSync(join(cwd, "second-ran")), true);
    const summary = lines.slice(lines.indexOf("\n== 汇总") + 1);
    assert.equal(summary.length, 3);
    assert.match(summary[0], /^失败 {2}first（.*，退出码 3）$/);
    assert.match(summary[1], /^通过 {2}second（.* s）$/);
    assert.match(summary[2], /^失败 {2}third（.*，退出码 1）$/);
  });
});

test("the run exits zero only when every step passes", async () => {
  await withScratch(async (cwd) => {
    const quiet = { cwd, log: () => {} };
    assert.equal(await runSteps([{ name: "a", command: exitWith(0) }, { name: "b", command: exitWith(0) }], quiet), 0);
    assert.equal(await runSteps([{ name: "a", command: exitWith(0) }, { name: "b", command: exitWith(2) }], quiet), 1);
    assert.equal(await runSteps([{ name: "a", command: exitWith(2) }, { name: "b", command: exitWith(0) }], quiet), 1);
  });
});

// `kill -KILL $$` kills the shell that runs the step, so the step ends with a signal and no exit code.
test("a step killed by a signal counts as failed and the next step still runs", { skip: process.platform === "win32" }, async () => {
  await withScratch(async (cwd) => {
    const lines = [];
    const steps = [{ name: "killed", command: "kill -KILL $$" }, { name: "after", command: touch("after-ran") }];
    assert.equal(await runSteps(steps, { cwd, log: (line) => lines.push(line) }), 1);
    assert.equal(existsSync(join(cwd, "after-ran")), true);
    assert.match(lines.at(-2), /^失败 {2}killed（.*，被 SIGKILL 终止）$/);
    assert.match(lines.at(-1), /^通过 {2}after（/);
  });
});
