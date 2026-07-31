const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const desktopPackagePath =
  process.env.ACTSPACE_TERMINAL_SPIKE_DESKTOP_PACKAGE || path.join(repoRoot, "packages/desktop/package.json");
const desktopRequire = createRequire(desktopPackagePath);
const pty = desktopRequire("node-pty");
const resultPath = process.env.ACTSPACE_TERMINAL_SPIKE_RESULT;
const cwd = process.env.ACTSPACE_TERMINAL_SPIKE_CWD || repoRoot;
const startedAt = Date.now();
const assertions = [];

function assert(name, pass, details = {}) {
  assertions.push({ name, pass, ...details });
  if (!pass) {
    throw new Error(`assertion failed: ${name}`);
  }
}

function processTable() {
  const output = execFileSync("/bin/ps", ["-axo", "pid=,ppid="], { encoding: "utf8" });
  const rows = [];
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (match) rows.push({ pid: Number(match[1]), ppid: Number(match[2]) });
  }
  return rows;
}

function descendantsOf(rootPid) {
  const rows = processTable();
  const byParent = new Map();
  for (const row of rows) {
    const current = byParent.get(row.ppid) || [];
    current.push(row.pid);
    byParent.set(row.ppid, current);
  }
  const result = [];
  const visit = (pid) => {
    for (const child of byParent.get(pid) || []) {
      visit(child);
      result.push(child);
    }
  };
  visit(rootPid);
  return result;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function outputLines(output) {
  return output
    .replaceAll("\r", "")
    .split("\n")
    .map((line) =>
      line
        .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ""),
    );
}

function hasOutputLine(output, expected) {
  return outputLines(output).some((line) => line === expected);
}

async function main() {
  const shell = process.env.SHELL && process.env.SHELL.startsWith("/") ? process.env.SHELL : "/bin/zsh";
  const terminal = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });

  let output = "";
  let outputBytes = 0;
  let paused = false;
  let resumed = false;
  const dataDisposable = terminal.onData((data) => {
    output += data;
    outputBytes += Buffer.byteLength(data);
    if (!paused && outputBytes >= 32 * 1024) {
      paused = true;
      terminal.pause();
      setTimeout(() => {
        terminal.resume();
        resumed = true;
      }, 50);
    }
  });

  terminal.write("printf 'SPIKE_PWD:%s\\n' \"$PWD\"; printf '\\033[31mSPIKE_ANSI\\033[0m 中文\\n'; stty size; echo SPIKE_INITIAL_DONE\n");
  await waitUntil(() => hasOutputLine(output, "SPIKE_INITIAL_DONE"), 4_000, "initial shell output");
  const cwdCandidates = outputLines(output)
    .filter((line) => line.includes("SPIKE_PWD:") && !line.includes("SPIKE_PWD:%s"))
    .map((line) => line.slice(line.indexOf("SPIKE_PWD:") + "SPIKE_PWD:".length));
  assert("cwd", cwdCandidates.includes(cwd), { cwd, cwdCandidates: cwdCandidates.slice(-3) });
  assert("ansi-and-unicode", output.includes("SPIKE_ANSI") && output.includes("中文"));

  terminal.resize(101, 37);
  terminal.write("stty size; echo SPIKE_RESIZE_DONE\n");
  await waitUntil(() => hasOutputLine(output, "SPIKE_RESIZE_DONE"), 4_000, "resize output");
  assert("resize", outputLines(output).some((line) => /^37\s+101$/.test(line)));

  terminal.write("sleep 30\n");
  await new Promise((resolve) => setTimeout(resolve, 150));
  terminal.write("\x03");
  terminal.write("echo SPIKE_INTERRUPT_DONE\n");
  await waitUntil(() => hasOutputLine(output, "SPIKE_INTERRUPT_DONE"), 4_000, "interrupt marker");
  assert("ctrl-c", hasOutputLine(output, "SPIKE_INTERRUPT_DONE"));

  terminal.write("i=0; while [ $i -lt 5000 ]; do printf 'SPIKE_LINE_%04d_abcdefghijklmnopqrstuvwxyz\\n' $i; i=$((i+1)); done; echo SPIKE_PRESSURE_DONE\n");
  await waitUntil(() => hasOutputLine(output, "SPIKE_PRESSURE_DONE"), 8_000, "pressure output");
  assert("pressure-output", outputBytes >= 150_000, { outputBytes });
  assert("pause-resume", paused && resumed, { paused, resumed });

  terminal.write("/bin/sh -c 'sleep 120' & echo SPIKE_CHILD:$!; echo SPIKE_CHILD_DONE\n");
  await waitUntil(() => hasOutputLine(output, "SPIKE_CHILD_DONE"), 4_000, "child marker");
  const childLine = outputLines(output).findLast((line) => /^SPIKE_CHILD:\d+$/.test(line));
  const childPid = Number(childLine?.slice("SPIKE_CHILD:".length));
  assert("child-pid", Number.isInteger(childPid) && childPid > 1, { childPid });
  assert("child-running", isAlive(childPid), { childPid });

  const rootPid = terminal.pid;
  const descendants = descendantsOf(rootPid);
  for (const pid of descendants) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  try {
    terminal.kill("SIGTERM");
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 200));
  for (const pid of [...descendants, rootPid]) {
    if (!isAlive(pid)) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  await waitUntil(() => !isAlive(childPid), 3_000, "child process cleanup");
  assert("process-tree-cleanup", !isAlive(childPid), { rootPid, childPid, descendants });

  dataDisposable.dispose();
  return {
    ok: assertions.every((item) => item.pass),
    runtime: {
      electron: process.versions.electron,
      node: process.versions.node,
      modules: process.versions.modules,
      napi: process.versions.napi,
      platform: process.platform,
      arch: process.arch,
      shell,
    },
    assertions,
    outputBytes,
    durationMs: Date.now() - startedAt,
  };
}

main()
  .then((result) => {
    writeFileSync(resultPath, JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    writeFileSync(
      resultPath,
      JSON.stringify(
        {
          ok: false,
          runtime: {
            electron: process.versions.electron,
            node: process.versions.node,
            modules: process.versions.modules,
            napi: process.versions.napi,
            platform: process.platform,
            arch: process.arch,
          },
          assertions,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  });
