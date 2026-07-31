import { execFile } from "node:child_process";
import { access, chmod, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const desktopDir = path.join(repoRoot, "packages/desktop");
const electronApp = path.join(desktopDir, "node_modules/electron/dist/Electron.app");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "actspace-terminal-package-spike-"));
const deployDir = path.join(tempRoot, "deploy");
const packagedApp = path.join(tempRoot, "ActspaceTerminalSpike.app");
const packagedResources = path.join(packagedApp, "Contents/Resources");
const packagedAppDir = path.join(packagedResources, "app");
const resultPath = path.join(tempRoot, "result.json");
const spikeEntry = path.join(scriptDir, "spike.cjs");

function commandError(command, error) {
  const stdout = error && typeof error.stdout === "string" ? error.stdout.slice(-2000) : "";
  const stderr = error && typeof error.stderr === "string" ? error.stderr.slice(-4000) : "";
  return new Error(`${command} failed: ${String(error)}\n${stdout}\n${stderr}`);
}

async function run(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      cwd: repoRoot,
      maxBuffer: 16 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    throw commandError(`${command} ${args.join(" ")}`, error);
  }
}

try {
  await access(electronApp);
  try {
    await run("pnpm", ["--filter", "@actspace/desktop", "--prod", "deploy", "--legacy", "--offline", deployDir]);
  } catch (offlineError) {
    await rm(deployDir, { recursive: true, force: true });
    await run("pnpm", ["--filter", "@actspace/desktop", "--prod", "deploy", "--legacy", deployDir], {
      env: { ...process.env, ACTSPACE_TERMINAL_SPIKE_OFFLINE_ERROR: String(offlineError).slice(0, 500) },
    });
  }

  await run("/usr/bin/ditto", [electronApp, packagedApp]);
  await rm(packagedAppDir, { recursive: true, force: true });
  await cp(deployDir, packagedAppDir, { recursive: true, preserveTimestamps: true });
  await cp(spikeEntry, path.join(packagedAppDir, "terminal-spike-main.cjs"));

  const packageJsonPath = path.join(packagedAppDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.main = "terminal-spike-main.cjs";
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const nodePtyRoot = path.dirname(
    path.join(packagedAppDir, "node_modules/node-pty/package.json"),
  );
  const nativeDir = path.join(nodePtyRoot, "prebuilds", `${process.platform}-${process.arch}`);
  const ptyNodePath = path.join(nativeDir, "pty.node");
  const spawnHelperPath = path.join(nativeDir, "spawn-helper");
  await Promise.all([access(ptyNodePath), access(spawnHelperPath)]);
  await chmod(spawnHelperPath, 0o755);

  await run("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", ptyNodePath]);
  await run("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", spawnHelperPath]);
  await run("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", packagedApp]);
  await run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", ptyNodePath]);
  await run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", spawnHelperPath]);
  await run("/usr/bin/codesign", ["--verify", "--no-strict", "--verbose=2", packagedApp]);

  const executable = path.join(packagedApp, "Contents/MacOS/Electron");
  const packagedDesktopPackage = path.join(packagedAppDir, "package.json");
  const { stdout, stderr } = await run(executable, [], {
    env: {
      ...process.env,
      ACTSPACE_TERMINAL_SPIKE_RESULT: resultPath,
      ACTSPACE_TERMINAL_SPIKE_CWD: repoRoot,
      ACTSPACE_TERMINAL_SPIKE_DESKTOP_PACKAGE: packagedDesktopPackage,
    },
  });
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  const [ptyFile, helperFile, executableFile] = await Promise.all([
    run("/usr/bin/file", [ptyNodePath]),
    run("/usr/bin/file", [spawnHelperPath]),
    run("/usr/bin/file", [executable]),
  ]);

  process.stdout.write(
    `${JSON.stringify(
      {
        ...result,
        packaged: true,
        signatureVerified: true,
        artifacts: {
          electron: executableFile.stdout.trim(),
          ptyNode: ptyFile.stdout.trim(),
          spawnHelper: helperFile.stdout.trim(),
        },
        packagedStdoutBytes: Buffer.byteLength(stdout),
        packagedStderrBytes: Buffer.byteLength(stderr),
      },
      null,
      2,
    )}\n`,
  );
  if (!result.ok) process.exitCode = 1;
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
