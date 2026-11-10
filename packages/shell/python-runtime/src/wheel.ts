import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readZipEntries } from "./zip.js";

/** Path segments never installed: test suites are a third of pandas, and stale bytecode would only mislead. */
const SKIPPED_SEGMENTS = new Set(["tests", "__pycache__"]);
const DATA_DIRECTORY = /^[^/]+\.data\/(purelib|platlib|scripts|data|headers)\//;

/**
 * Installs a wheel the way `pip install --no-deps --no-compile` would lay it out, minus console scripts:
 * `.data/purelib` and `.data/platlib` fold into site-packages, the other `.data/` trees are dropped.
 * Returns the number of files written.
 */
export function installWheel(archive: Buffer, sitePackages: string): number {
  let written = 0;
  for (const entry of readZipEntries(archive)) {
    const target = installPath(entry.name);
    if (target === undefined || entry.directory) continue;
    const destination = join(sitePackages, ...target.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, entry.read());
    if (process.platform !== "win32") chmodSync(destination, entry.mode !== undefined && (entry.mode & 0o111) !== 0 ? 0o755 : 0o644);
    written += 1;
  }
  return written;
}

/** The site-packages-relative path an archive entry installs to, or undefined when it is skipped. */
export function installPath(name: string): string | undefined {
  if (name.length === 0 || name.startsWith("/") || name.includes("\\") || name.includes("\0")) throw new Error(`Wheel entry has an unsafe path: ${JSON.stringify(name)}`);
  const data = DATA_DIRECTORY.exec(name);
  let relative = name;
  if (data !== null) {
    if (data[1] !== "purelib" && data[1] !== "platlib") return undefined;
    relative = name.slice(data[0].length);
  }
  const segments = relative.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return undefined;
  if (segments.some((segment) => segment === "..")) throw new Error(`Wheel entry escapes its directory: ${JSON.stringify(name)}`);
  if (segments.some((segment) => SKIPPED_SEGMENTS.has(segment))) return undefined;
  return segments.join("/");
}
