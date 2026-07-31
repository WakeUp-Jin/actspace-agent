#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, realpath, rm, rename } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const desktopRoot = join(repositoryRoot, "packages", "desktop");
const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
const electronExecutable = requireFromDesktop("electron");
const electronVersion = requireFromDesktop("electron/package.json").version;
const prepareOnly = process.argv.includes("--prepare-only");
const appEntryArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const appEntry = resolve(process.cwd(), appEntryArgument ?? "dist-electron/main/index.js");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    const detail = options.capture ? result.stderr?.trim() : undefined;
    throw new Error(`${command} exited with ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout?.trim();
}

function createDevIdentity() {
  const workspaceHash = createHash("sha256").update(repositoryRoot).digest("hex").slice(0, 8);
  const parentDirectory = dirname(repositoryRoot);
  const insideCodexWorktree = basename(dirname(parentDirectory)) === "worktrees";
  const rawLabel = insideCodexWorktree ? basename(parentDirectory) : basename(repositoryRoot);
  const label = rawLabel.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "local";
  const shortLabel = label.slice(0, 20);

  return {
    appName: `Actspace Dev ${shortLabel}-${workspaceHash.slice(0, 4)}`,
    appId: `com.actspace.desktop.dev.w${workspaceHash}`,
    executableName: `ActspaceDev-${workspaceHash}`,
    workspaceHash,
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareMacRuntime(identity) {
  const sourceApp = resolve(dirname(electronExecutable), "../..");
  const canonicalTempRoot = await realpath(tmpdir());
  const cacheRoot = join(canonicalTempRoot, "actspace-electron-dev", `${identity.workspaceHash}-${electronVersion}-v1`);
  const devApp = join(cacheRoot, `${identity.appName}.app`);
  const devExecutable = join(devApp, "Contents", "MacOS", identity.executableName);

  const registerWithLaunchServices = async () => {
    const launchServices = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
    if (await pathExists(launchServices)) {
      run(launchServices, ["-f", devApp]);
    }
  };

  if (await pathExists(devExecutable)) {
    await registerWithLaunchServices();
    return { devApp, devExecutable };
  }

  await mkdir(cacheRoot, { recursive: true });
  const stagingApp = join(cacheRoot, `.staging-${process.pid}.app`);
  await rm(stagingApp, { recursive: true, force: true });

  const copyResult = spawnSync("/bin/cp", ["-cR", sourceApp, stagingApp], { stdio: "inherit" });
  if (copyResult.status !== 0) {
    await rm(stagingApp, { recursive: true, force: true });
    run("/bin/cp", ["-R", sourceApp, stagingApp]);
  }

  const sourceExecutable = join(stagingApp, "Contents", "MacOS", "Electron");
  const stagedExecutable = join(stagingApp, "Contents", "MacOS", identity.executableName);
  await rename(sourceExecutable, stagedExecutable);

  const infoPlist = join(stagingApp, "Contents", "Info.plist");
  const plistBuddy = "/usr/libexec/PlistBuddy";
  run(plistBuddy, ["-c", `Set :CFBundleName ${identity.appName}`, infoPlist]);
  run(plistBuddy, ["-c", `Set :CFBundleDisplayName ${identity.appName}`, infoPlist]);
  run(plistBuddy, ["-c", `Set :CFBundleIdentifier ${identity.appId}`, infoPlist]);
  run(plistBuddy, ["-c", `Set :CFBundleExecutable ${identity.executableName}`, infoPlist]);

  run("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", stagedExecutable]);
  run("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", stagingApp]);

  await rm(devApp, { recursive: true, force: true });
  await rename(stagingApp, devApp);

  await registerWithLaunchServices();

  return { devApp, devExecutable };
}

async function main() {
  const identity = createDevIdentity();
  let executable = electronExecutable;
  let appPath;

  if (process.platform === "darwin") {
    const prepared = await prepareMacRuntime(identity);
    executable = prepared.devExecutable;
    appPath = prepared.devApp;
  }

  const launchConfig = {
    appName: identity.appName,
    appId: identity.appId,
    appPath,
    electronVersion,
    workspace: repositoryRoot,
  };
  console.log(`[dev-runtime] ${JSON.stringify(launchConfig)}`);

  if (prepareOnly) return;

  const child = spawn(executable, [appEntry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ACTSPACE_DEV_APP_NAME: identity.appName,
      ACTSPACE_DEV_APP_ID: identity.appId,
    },
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  child.once("error", (error) => {
    console.error(`[dev-runtime] failed to launch Electron: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

main().catch((error) => {
  console.error(`[dev-runtime] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
