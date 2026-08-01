import { execFile, spawn } from "node:child_process";
import { chmod, copyFile, mkdtemp, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = `${process.platform}-${process.arch}`;
const artifact = process.platform === "win32" ? "actspace-agent.exe" : "actspace-agent";
const binary = join(repoRoot, "artifacts", "agent-cli", target, artifact);
const manifest = JSON.parse(await readFile(join(dirname(binary), "manifest.json"), "utf8"));
const workspace = await mkdtemp(join(tmpdir(), "actspace-binary-work-"));
const smokeRoot = await mkdtemp(join(tmpdir(), "actspace-binary-smoke-"));
const cleanEnv = {
  ...process.env,
  PATH: minimalPath(),
  HOME: smokeRoot,
  ACTSPACE_DATA_DIR: join(smokeRoot, "data"),
  NO_COLOR: "1",
};

const version = await run(binary, ["--version"], { env: cleanEnv });
assert(version.code === 0, version.stderr);
assert(version.stdout.includes(`${manifest.version} ${target} build ${manifest.buildId}`), version.stdout);

const text = await run(binary, ["run", "--input", "reply with ok", "--workspace", workspace, "--mock"], { env: cleanEnv });
assert(text.code === 0, text.stderr);
assert(text.stdout === "Mock ActSpace Agent response.\n", text.stdout);

const json = await run(binary, ["run", "--input", "reply with ok", "--workspace", workspace, "--mock", "--json"], { env: cleanEnv });
assert(JSON.parse(json.stdout).exitCode === 0, json.stdout);

const defaultWorkspace = await run(binary, ["run", "--input", "reply with ok", "--mock", "--json"], {
  cwd: workspace,
  env: cleanEnv,
});
assert(JSON.parse(defaultWorkspace.stdout).workspace === await realpath(workspace), defaultWorkspace.stdout);

const jsonl = await run(binary, ["run", "--input", "reply with ok", "--workspace", workspace, "--mock", "--jsonl"], { env: cleanEnv });
const jsonlLines = jsonl.stdout.trim().split("\n").map((line) => JSON.parse(line));
assert(jsonlLines.at(-1)?.type === "run_result", jsonl.stdout);

const rgPath = join(
  cleanEnv.ACTSPACE_DATA_DIR,
  "runtime",
  manifest.version,
  target,
  process.platform === "win32" ? "rg.exe" : "rg",
);
const rg = await run(rgPath, ["--version"], { env: cleanEnv });
assert(rg.code === 0 && rg.stdout.includes("ripgrep"), `Embedded rg failed: ${rg.stderr}`);

const concurrentRoot = join(smokeRoot, "concurrent-data");
const concurrentEnv = { ...cleanEnv, ACTSPACE_DATA_DIR: concurrentRoot };
const concurrent = await Promise.all([
  run(binary, ["run", "--input", "one", "--workspace", workspace, "--mock", "--json"], { env: concurrentEnv }),
  run(binary, ["run", "--input", "two", "--workspace", workspace, "--mock", "--json"], { env: concurrentEnv }),
]);
assert(concurrent.every((result) => result.code === 0), concurrent.map((result) => result.stderr).join("\n"));

if (process.platform !== "win32") {
  const readonlyDir = join(smokeRoot, "readonly-binary");
  await mkdir(readonlyDir);
  const readonlyBinary = join(readonlyDir, basename(binary));
  await copyFile(binary, readonlyBinary);
  await chmod(readonlyBinary, 0o555);
  await chmod(readonlyDir, 0o555);
  try {
    const readonlyRun = await run(readonlyBinary, ["run", "--input", "readonly", "--workspace", workspace, "--mock"], {
      env: { ...cleanEnv, ACTSPACE_DATA_DIR: join(smokeRoot, "readonly-data") },
    });
    assert(readonlyRun.code === 0, readonlyRun.stderr);
  } finally {
    await chmod(readonlyDir, 0o755);
  }
}

const binaryMode = (await stat(binary)).mode;
if (process.platform !== "win32") assert((binaryMode & 0o111) !== 0, "Binary is not executable.");
process.stdout.write(`Agent CLI binary smoke passed: ${binary}\n`);

function run(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    execFile(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env,
      timeout: 20_000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    }, (error, stdout, stderr) => {
      if (error && error.killed) return reject(error);
      resolveResult({ code: error?.code ?? 0, stdout, stderr });
    });
  });
}

function minimalPath() {
  if (process.platform === "win32") return `${process.env.SystemRoot ?? "C:\\Windows"}\\System32`;
  return "/usr/bin:/bin";
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Binary smoke assertion failed.");
}
