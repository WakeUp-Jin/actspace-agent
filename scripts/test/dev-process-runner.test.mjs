import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { signalProcessTree, startManagedCommand } from "../dev-process-runner.mjs";

const testRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));

test("desktop dev startup does not call retired native preparation", async () => {
  const source = await readFile(resolve(testRoot, "..", "desktop-dev.mjs"), "utf8");
  assert.doesNotMatch(source, /native:prepare/);
});

test("signaling a process group that no longer exists is a no-op", { skip: process.platform === "win32" }, () => {
  assert.equal(signalProcessTree(2_000_000_000, "SIGTERM"), false);
});

for (const buildFails of [false, true]) {
  test(`desktop dev ${buildFails ? "stops on failed initial Electron build" : "rebuilds stale Electron artifacts before launching watchers"}`, { skip: process.platform === "win32", timeout: 10_000 }, async () => {
    const root = await mkdtemp(resolve(tmpdir(), "actspace-dev-barrier-"));
    try {
      await writeFile(resolve(root, "artifact"), "stale");
      await writeFile(resolve(root, "pnpm"), `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.ACTSPACE_TEST_ROOT;
const args = process.argv.slice(2);
if (args.includes("build:electron")) {
  fs.appendFileSync(path.join(root, "events"), "build-start\\n");
  setTimeout(() => {
    if (process.env.ACTSPACE_TEST_BUILD_FAILS === "true") process.exit(23);
    fs.writeFileSync(path.join(root, "artifact"), "fresh");
    fs.appendFileSync(path.join(root, "events"), "build-done\\n");
  }, 100);
} else if (args.includes("concurrently")) {
  fs.appendFileSync(path.join(root, "events"), "launch\\n");
  process.exit(fs.readFileSync(path.join(root, "artifact"), "utf8") === "fresh" ? 0 : 91);
}
`);
      // Stub only browser-component packaging; execute the real dev orchestrator below.
      await writeFile(resolve(root, "node"), `#!${process.execPath}\nprocess.exit(0);\n`);
      await Promise.all(["pnpm", "node"].map((name) => chmod(resolve(root, name), 0o755)));
      const cli = spawn(process.execPath, [resolve(testRoot, "..", "desktop-dev.mjs")], {
        env: { ...process.env, PATH: `${root}:${process.env.PATH ?? ""}`, ACTSPACE_TEST_ROOT: root, ACTSPACE_TEST_BUILD_FAILS: String(buildFails) },
        stdio: "ignore",
      });
      const [code] = await new Promise((resolveExit) => cli.once("exit", (...result) => resolveExit(result)));
      assert.equal(code, buildFails ? 23 : 0);
      assert.equal(await readFile(resolve(root, "events"), "utf8"), buildFails ? "build-start\n" : "build-start\nbuild-done\nlaunch\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function waitUntil(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  assert.fail("condition was not met before timeout");
}

test("SIGINT terminates the managed child process group", { skip: process.platform === "win32" }, async () => {
  let output = "";
  const managed = startManagedCommand({
    command: process.execPath,
    args: [resolve(testRoot, "fixtures", "dev-process-tree.mjs")],
    cwd: testRoot,
    captureOutput: true,
    onStdout: (chunk) => { output += chunk.toString(); },
  });

  while (!output.includes("\n")) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  const { childPid, grandchildPid } = JSON.parse(output.trim());
  assert.equal(isAlive(childPid), true);
  assert.equal(isAlive(grandchildPid), true);

  managed.signal("SIGINT");
  await managed.completed;
  await waitUntil(() => !isAlive(childPid) && !isAlive(grandchildPid));
});

test("desktop dev CLI forwards SIGINT and exits with the conventional code", { skip: process.platform === "win32" }, async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "actspace-dev-runner-"));
  const fakePnpm = resolve(temporaryRoot, "pnpm");
  const markerPath = resolve(temporaryRoot, "processes.json");
  await writeFile(fakePnpm, `#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync(process.env.ACTSPACE_TEST_MARKER, JSON.stringify({ childPid: process.pid, grandchildPid: grandchild.pid }));
setInterval(() => {}, 1000);
`);
  await chmod(fakePnpm, 0o755);

  try {
    const cli = spawn(process.execPath, [resolve(testRoot, "..", "desktop-dev.mjs")], {
      cwd: resolve(testRoot, "..", ".."),
      env: {
        ...process.env,
        ACTSPACE_TEST_MARKER: markerPath,
        PATH: `${temporaryRoot}:${process.env.PATH ?? ""}`,
      },
      stdio: "ignore",
    });

    await waitUntil(async () => {
      try {
        await readFile(markerPath, "utf8");
        return true;
      } catch {
        return false;
      }
    });
    const { childPid, grandchildPid } = JSON.parse(await readFile(markerPath, "utf8"));
    process.kill(cli.pid, "SIGINT");
    const [code, signal] = await new Promise((resolveExit) => cli.once("exit", (...result) => resolveExit(result)));

    assert.equal(signal, null);
    assert.equal(code, 130);
    await waitUntil(() => !isAlive(childPid) && !isAlive(grandchildPid));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("desktop dev CLI cleans up descendants when a managed phase exits with an error", { skip: process.platform === "win32" }, async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "actspace-dev-failure-"));
  const fakePnpm = resolve(temporaryRoot, "pnpm");
  const markerPath = resolve(temporaryRoot, "processes.json");
  await writeFile(fakePnpm, `#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync(process.env.ACTSPACE_TEST_MARKER, JSON.stringify({ grandchildPid: grandchild.pid }));
process.exit(1);
`);
  await chmod(fakePnpm, 0o755);

  try {
    const cli = spawn(process.execPath, [resolve(testRoot, "..", "desktop-dev.mjs")], {
      cwd: resolve(testRoot, "..", ".."),
      env: {
        ...process.env,
        ACTSPACE_TEST_MARKER: markerPath,
        PATH: `${temporaryRoot}:${process.env.PATH ?? ""}`,
      },
      stdio: "ignore",
    });
    const [code] = await new Promise((resolveExit) => cli.once("exit", (...result) => resolveExit(result)));
    const { grandchildPid } = JSON.parse(await readFile(markerPath, "utf8"));

    assert.equal(code, 1);
    await waitUntil(() => !isAlive(grandchildPid));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("pnpm dev returns after Ctrl+C and does not leave descendants", {
  skip: process.platform === "win32" || !process.env.npm_execpath,
}, async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "actspace-pnpm-dev-"));
  const fakePnpm = resolve(temporaryRoot, "pnpm");
  const markerPath = resolve(temporaryRoot, "processes.json");
  await writeFile(fakePnpm, `#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync(process.env.ACTSPACE_TEST_MARKER, JSON.stringify({ childPid: process.pid, grandchildPid: grandchild.pid }));
setInterval(() => {}, 1000);
`);
  await chmod(fakePnpm, 0o755);

  try {
    const pnpmDev = spawn(process.execPath, [process.env.npm_execpath, "dev"], {
      cwd: resolve(testRoot, "..", ".."),
      detached: true,
      env: {
        ...process.env,
        ACTSPACE_TEST_MARKER: markerPath,
        PATH: `${temporaryRoot}:${process.env.PATH ?? ""}`,
      },
      stdio: "ignore",
    });

    await waitUntil(async () => {
      try {
        await readFile(markerPath, "utf8");
        return true;
      } catch {
        return false;
      }
    });
    const { childPid, grandchildPid } = JSON.parse(await readFile(markerPath, "utf8"));
    process.kill(-pnpmDev.pid, "SIGINT");
    await new Promise((resolveExit) => pnpmDev.once("exit", resolveExit));
    await waitUntil(() => !isAlive(childPid) && !isAlive(grandchildPid));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
