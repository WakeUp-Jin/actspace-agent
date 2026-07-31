#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { lstat, mkdir, readdir, readlink, stat, symlink, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exitCodeForSignal, startManagedCommand } from "./dev-process-runner.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const desktopRoot = join(repoRoot, "packages", "desktop");
const logEnabled = process.argv.includes("--log");
const FORCE_KILL_AFTER_MS = 4_000;
const EXIT_CLEANUP_GRACE_MS = 250;

let activeCommand;
let requestedSignal;
let forceKillTimer;
let logStream;

function timestampForFile(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function timestampForLog(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, "0")}${String(absoluteOffset % 60).padStart(2, "0")}`;
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${offset}`;
}

async function removeExpiredLogs(logDir) {
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1_000;
  for (const entry of await readdir(logDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".log")) continue;
    const path = join(logDir, entry.name);
    if ((await stat(path)).mtimeMs < cutoff) await unlink(path);
  }
}

async function replaceLatestLogLink(latestLog, logFile) {
  try {
    const existing = await lstat(latestLog);
    if (existing.isSymbolicLink() && await readlink(latestLog) === basename(logFile)) return;
    await unlink(latestLog);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await symlink(basename(logFile), latestLog);
}

async function initializeLogging() {
  if (!logEnabled) return;
  const logDir = join(repoRoot, "logs");
  const logFile = join(logDir, `dev-${timestampForFile()}.log`);
  await mkdir(logDir, { recursive: true });
  await removeExpiredLogs(logDir);
  await replaceLatestLogLink(join(logDir, "latest-dev.log"), logFile);
  logStream = createWriteStream(logFile, { flags: "a" });
  logStream.write(`actspace dev log\nstarted_at=${timestampForLog()}\ncommand=pnpm dev\n\n`);
}

function writeOutput(target, chunk) {
  target.write(chunk);
  logStream?.write(chunk);
}

function requestStop(signal) {
  if (requestedSignal) {
    activeCommand?.signal("SIGKILL");
    return;
  }
  requestedSignal = signal;
  activeCommand?.signal(signal);
  forceKillTimer = setTimeout(() => activeCommand?.signal("SIGKILL"), FORCE_KILL_AFTER_MS);
  forceKillTimer.unref();
}

process.on("SIGINT", () => requestStop("SIGINT"));
process.on("SIGTERM", () => requestStop("SIGTERM"));

async function run(command, args, cwd = repoRoot) {
  if (requestedSignal) return { code: exitCodeForSignal(requestedSignal), signal: requestedSignal };
  activeCommand = startManagedCommand({
    command,
    args,
    cwd,
    captureOutput: logEnabled,
    onStdout: (chunk) => writeOutput(process.stdout, chunk),
    onStderr: (chunk) => writeOutput(process.stderr, chunk),
  });
  const completedCommand = activeCommand;
  const result = await completedCommand.completed;
  if (completedCommand.signal("SIGTERM")) {
    await new Promise((resolveWait) => setTimeout(resolveWait, EXIT_CLEANUP_GRACE_MS));
    completedCommand.signal("SIGKILL");
  }
  activeCommand = undefined;
  return result;
}

async function closeLog() {
  if (!logStream) return;
  await new Promise((resolveClose) => logStream.end(resolveClose));
}

async function main() {
  await initializeLogging();
  const phases = [
    ["pnpm", ["--filter", "@actspace/desktop", "native:prepare"], repoRoot],
    ["pnpm", ["--filter", "@actspace/desktop", "run", "build:deps"], repoRoot],
    ["pnpm", [
      "exec",
      "concurrently",
      "-k",
      "pnpm:dev:shared",
      "pnpm:dev:agent-core",
      "pnpm:dev:renderer",
      "pnpm:dev:electron:build",
      "pnpm:dev:electron:run",
    ], desktopRoot],
  ];

  let exitCode = 0;
  for (const [command, args, cwd] of phases) {
    const result = await run(command, args, cwd);
    if (requestedSignal) {
      exitCode = exitCodeForSignal(requestedSignal);
      break;
    }
    if (result.code !== 0) {
      exitCode = result.code ?? 1;
      break;
    }
  }

  if (forceKillTimer) clearTimeout(forceKillTimer);
  await closeLog();
  process.exitCode = exitCode;
}

void main().catch(async (error) => {
  writeOutput(process.stderr, `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  await closeLog();
  process.exitCode = 1;
});
