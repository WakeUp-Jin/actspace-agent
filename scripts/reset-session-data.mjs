#!/usr/bin/env node

import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ALLOWED_DIRECTORY_NAMES = ["sessions", "cache-audit"];

export function parseResetSessionDataArgs(argv) {
  let dataRoot;
  let confirm = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--confirm") {
      confirm = true;
      continue;
    }
    if (arg === "--data-root") {
      dataRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--data-root=")) {
      dataRoot = arg.slice("--data-root=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!dataRoot) {
    throw new Error("Missing required --data-root /absolute/path");
  }
  if (!isAbsolute(dataRoot)) {
    throw new Error("--data-root must be an absolute path");
  }

  const normalizedRoot = resolve(dataRoot);
  if (normalizedRoot === parse(normalizedRoot).root) {
    throw new Error("Refusing to use a filesystem root as --data-root");
  }

  return { dataRoot: normalizedRoot, confirm };
}

export async function resetSessionData({ dataRoot, confirm }) {
  const canonicalRoot = await realpath(dataRoot).catch(() => null);
  if (!canonicalRoot) {
    throw new Error(`Data root does not exist: ${dataRoot}`);
  }
  if (canonicalRoot === parse(canonicalRoot).root) {
    throw new Error("Refusing to use a data root that resolves to a filesystem root");
  }

  const targets = [];
  for (const name of ALLOWED_DIRECTORY_NAMES) {
    const target = join(canonicalRoot, name);
    const stats = await lstat(target).catch(() => null);
    if (!stats) {
      targets.push({ name, target, exists: false, entries: 0 });
      continue;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to remove symbolic-link target: ${target}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`Expected an allowlisted directory but found another file type: ${target}`);
    }
    const entries = await readdir(target);
    targets.push({ name, target, exists: true, entries: entries.length });
  }

  console.log(confirm ? "Resetting ActSpace session data:" : "Dry run — ActSpace session data targets:");
  for (const target of targets) {
    const detail = target.exists ? `${target.entries} direct entries` : "not present";
    console.log(`- ${target.target} (${detail})`);
  }

  if (!confirm) {
    console.log("No files were removed. Re-run with --confirm to delete only the targets above.");
    return { removed: [] };
  }

  const removed = [];
  for (const target of targets) {
    if (!target.exists) continue;
    await rm(target.target, { recursive: true, force: false });
    removed.push(target.target);
  }
  console.log(`Removed ${removed.length} allowlisted director${removed.length === 1 ? "y" : "ies"}.`);
  return { removed };
}

async function main() {
  try {
    const options = parseResetSessionDataArgs(process.argv.slice(2));
    await resetSessionData(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
