import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const electronExecutable = path.join(
  repoRoot,
  "packages/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
);
const spikeEntry = path.join(scriptDir, "spike.cjs");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "actspace-terminal-spike-"));
const resultPath = path.join(tempRoot, "result.json");

await access(electronExecutable);

const child = spawn(electronExecutable, [spikeEntry], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    ACTSPACE_TERMINAL_SPIKE_RESULT: resultPath,
    ACTSPACE_TERMINAL_SPIKE_CWD: repoRoot,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const exit = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new Error("terminal native spike timed out after 30 seconds"));
  }, 30_000);
  child.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once("exit", (code, signal) => {
    clearTimeout(timeout);
    resolve({ code, signal });
  });
});

let result;
try {
  result = JSON.parse(await readFile(resultPath, "utf8"));
} catch (error) {
  throw new Error(
    `terminal native spike did not produce a valid result (exit=${JSON.stringify(exit)} stdout=${stdout.slice(0, 500)} stderr=${stderr.slice(0, 1000)}): ${String(error)}`,
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({ ...result, electronExit: exit }, null, 2)}\n`);

if (!result.ok || exit.code !== 0) {
  process.exitCode = 1;
}
