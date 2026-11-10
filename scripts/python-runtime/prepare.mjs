#!/usr/bin/env node
// Prepares the bundled Python runtime for one target from packages/shell/python-runtime/lock.json:
//   node scripts/python-runtime/prepare.mjs [--target mac-arm64|mac-x64|linux-x64|linux-arm64|win-x64]
//                                           [--output <dir>] [--layer core|extension] [--cache <dir>] [--python <pip-capable python>]
// core (default): downloads python-build-standalone, verifies its sha256, unpacks it to <output>, installs the core wheels
//   into site-packages, trims what the app never needs (tests, tkinter, pip, headers), writes shim/actspace-python,
//   sitecustomize.py and runtime.json.
// extension: installs the extension wheels into <output>/site-packages and writes extension.json — the same layout the
//   app produces when it downloads the layer, for offline machines and for verify-python-runtime.mjs.
// Defaults: target = this machine, output = dist/python-runtime/<target> (core) or dist/python-runtime/<target>-ext,
// cache = .cache/python-runtime. Downloads use the same URL + sha256 pins the app does; nothing else is trusted.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const lock = JSON.parse(await readFile(join(repoRoot, "packages", "shell", "python-runtime", "lock.json"), "utf8"));

const options = parseArgs(process.argv.slice(2));
const target = lock.targets[options.target];
if (!target) throw new Error(`lock.json has no target ${options.target}; known: ${Object.keys(lock.targets).join(", ")}.`);
const windows = target.platform === "win32";
const layout = windows
  ? { executable: "python.exe", sitePackages: "Lib/site-packages", stdlib: "Lib" }
  : { executable: `bin/python${minor(lock.python.version)}`, sitePackages: `lib/python${minor(lock.python.version)}/site-packages`, stdlib: `lib/python${minor(lock.python.version)}` };
const output = resolve(options.output ?? join(repoRoot, "dist", "python-runtime", options.layer === "core" ? options.target : `${options.target}-ext`));
const cache = resolve(options.cache ?? join(repoRoot, ".cache", "python-runtime"));
await mkdir(cache, { recursive: true });


async function prepareCore() {
  log(`core layer for ${options.target} -> ${output}`);
  const archive = await download(target.python.url, target.python.sha256);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  // The archive has a single top-level `python/` directory.
  execFileSync(tarCommand(), ["-xzf", archive, "-C", output, "--strip-components=1"], { stdio: "inherit" });
  const sitePackages = join(output, ...layout.sitePackages.split("/"));
  await installWheels(target.core, sitePackages, pickPip(join(output, ...layout.executable.split("/"))));
  await prune(output);
  await writeShims(output);
  await writeFile(join(sitePackages, "sitecustomize.py"), SITECUSTOMIZE);
  const manifest = {
    schemaVersion: 1,
    target: options.target,
    python: { version: lock.python.version, release: lock.python.release },
    executable: layout.executable,
    sitePackages: layout.sitePackages,
    shimDirectory: "shim",
    core: target.core.map(({ name, version }) => ({ name, version })),
    extension: { digest: extensionDigest(target.extension), packages: lock.extension, wheels: target.extension },
  };
  await writeFile(join(output, "runtime.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  log(`runtime.json written; ${target.core.length} core wheels, extension digest ${manifest.extension.digest}`);
}

async function prepareExtension() {
  log(`extension layer for ${options.target} -> ${output}`);
  await rm(output, { recursive: true, force: true });
  const sitePackages = join(output, "site-packages");
  await mkdir(sitePackages, { recursive: true });
  await installWheels(target.extension, sitePackages, pickPip(undefined));
  await prune(output);
  const digest = extensionDigest(target.extension);
  await writeFile(join(output, "extension.json"), `${JSON.stringify({ digest, python: { version: lock.python.version, release: lock.python.release }, wheels: target.extension.map(({ name, version, sha256 }) => ({ name, version, sha256 })), installedAt: new Date().toISOString() }, null, 2)}\n`);
  log(`extension.json written; digest ${digest}`);
}

/** A pip to install wheels with: the unpacked interpreter when it runs here, otherwise `--python` / python3 on PATH. */
function pickPip(unpackedExecutable) {
  if (options.python) return { command: options.python, foreign: true };
  if (unpackedExecutable && hostTarget() === options.target) return { command: unpackedExecutable, foreign: false };
  return { command: process.platform === "win32" ? "python" : "python3", foreign: true };
}

async function installWheels(wheels, sitePackages, pip) {
  const files = [];
  for (const wheel of wheels) files.push(await download(wheel.url, wheel.sha256, wheel.file));
  // A foreign pip must be told the target's tags; the unpacked interpreter installs for itself.
  const tags = pip.foreign
    ? ["--python-version", minor(lock.python.version), "--implementation", "cp", "--abi", `cp${minor(lock.python.version).replace(".", "")}`, "--abi", "abi3", "--abi", "none", ...PIP_PLATFORMS[options.target].flatMap((platform) => ["--platform", platform])]
    : [];
  execFileSync(pip.command, ["-m", "pip", "install", "--quiet", "--no-deps", "--no-index", "--no-compile", "--only-binary=:all:", "--upgrade", "--target", sitePackages, ...tags, ...files], { stdio: "inherit", env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: "1", PIP_NO_CACHE_DIR: "1" } });
  // Console scripts pip generated for the target; the app never calls them.
  await rm(join(sitePackages, "bin"), { recursive: true, force: true });
  await rm(join(sitePackages, "Scripts"), { recursive: true, force: true });
}

/** Drops what the agent never uses; `prune` is idempotent so a half-finished run can be redone. */
async function prune(root) {
  const stdlib = join(root, ...layout.stdlib.split("/"));
  const sitePackages = join(root, ...layout.sitePackages.split("/"));
  const removals = options.layer === "core" ? [
    join(stdlib, "test"), join(stdlib, "idlelib"), join(stdlib, "tkinter"), join(stdlib, "turtledemo"), join(stdlib, "ensurepip"), join(stdlib, "turtle.py"),
    join(root, "include"), join(root, "share"), join(root, "libs"), join(root, "tcl"), join(root, "Scripts"),
    join(sitePackages, "_distutils_hack"), join(sitePackages, "distutils-precedence.pth"),
  ] : [];
  for (const path of removals) await rm(path, { recursive: true, force: true });
  if (options.layer === "core") {
    // Not on Windows: there `lib` is the standard library itself (`Lib`, case-insensitive), and this would take `threading.py`.
    if (!windows) await removeMatching(join(root, "lib"), (name) => /^(tcl|tk|itcl|thread|tdbc|Tix|libtcl|libtk|pkgconfig)/.test(name));
    // The Linux interpreter is statically linked; the 32 MB shared library only serves embedders. macOS links it.
    if (target.platform === "linux") await removeMatching(join(root, "lib"), (name) => /^libpython3.*\.so/.test(name));
    await removeMatching(join(stdlib, "lib-dynload"), (name) => name.startsWith("_tkinter"));
    await removeMatching(join(root, "DLLs"), (name) => /^(_tkinter|tcl8|tk8)/.test(name));
    await removeMatching(join(root, "bin"), (name) => /^(pip|idle|2to3|pydoc|python3?(\.\d+)?-config)/.test(name));
    await removeMatching(sitePackages, (name) => /^(pip|setuptools|wheel)(-|$)/.test(name));
  }
  await removeTests(sitePackages);
  await removeMatching(sitePackages, (name) => name === "__pycache__");
}

/** `tests/` and `__pycache__/` anywhere under site-packages: pandas alone ships ~40 MB of tests. */
async function removeTests(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(directory, entry.name);
    if (entry.name === "tests" || entry.name === "__pycache__") await rm(path, { recursive: true, force: true });
    else await removeTests(path);
  }
}

async function removeMatching(directory, matches) {
  let entries;
  try { entries = await readdir(directory); } catch { return; }
  for (const name of entries) if (matches(name)) await rm(join(directory, name), { recursive: true, force: true });
}

async function writeShims(root) {
  const shim = join(root, "shim");
  await mkdir(shim, { recursive: true });
  // -E/-s keep the user's PYTHON* variables and user site-packages away from the bundled interpreter;
  // ACTSPACE_PYTHON_EXT is not a PYTHON* variable, so sitecustomize.py still sees it.
  await writeFile(join(shim, "actspace-python"), `#!/bin/sh\n# ActSpace's bundled Python ${lock.python.version}.\nhere=$(cd "$(dirname "$0")" && pwd)\nexec "$here/../${layout.executable}" -E -s -X utf8 "$@"\n`);
  await chmod(join(shim, "actspace-python"), 0o755);
  if (windows) await writeFile(join(shim, "actspace-python.cmd"), `@echo off\r\n"%~dp0..\\${layout.executable.replaceAll("/", "\\")}" -E -s -X utf8 %*\r\n`);
}

async function download(url, sha256, fileName = url.slice(url.lastIndexOf("/") + 1)) {
  const path = join(cache, fileName);
  if (existsSync(path) && (await digestFile(path)) === sha256) return path;
  log(`downloading ${fileName}`);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== sha256) throw new Error(`${fileName}: sha256 ${actual} does not match the pinned ${sha256}.`);
      const partial = `${path}.partial`;
      await writeFile(partial, bytes);
      await rename(partial, path);
      return path;
    } catch (error) {
      lastError = error;
      if (String(error).includes("does not match the pinned")) throw error;
      log(`attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw lastError;
}

async function digestFile(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

/** Mirrors `extensionLayerDigest` in @actspace/python-runtime. */
function extensionDigest(wheels) {
  return createHash("sha256").update(wheels.map((wheel) => wheel.sha256).sort().join("\n")).digest("hex").slice(0, 16);
}

function hostTarget() {
  const { platform, arch } = process;
  if (platform === "darwin") return arch === "arm64" ? "mac-arm64" : "mac-x64";
  if (platform === "linux") return arch === "arm64" ? "linux-arm64" : "linux-x64";
  if (platform === "win32") return "win-x64";
  return undefined;
}

/**
 * On a Windows host `tar` on PATH is usually Git Bash's GNU tar, which reads `D:\…` as a remote `host:path`;
 * the bsdtar Windows ships takes native paths.
 */
function tarCommand() {
  return process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
}

function minor(version) { return version.split(".").slice(0, 2).join("."); }
function log(message) { console.error(`[python-runtime] ${message}`); }

function parseArgs(argv) {
  const parsed = { target: hostTarget(), layer: "core" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => { const next = argv[++index]; if (next === undefined) throw new Error(`${flag} needs a value.`); return next; };
    if (flag === "--target") parsed.target = value();
    else if (flag === "--output") parsed.output = value();
    else if (flag === "--layer") parsed.layer = value();
    else if (flag === "--cache") parsed.cache = value();
    else if (flag === "--python") parsed.python = value();
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!parsed.target) throw new Error("No Python runtime is built for this machine; pass --target.");
  if (parsed.layer !== "core" && parsed.layer !== "extension") throw new Error("--layer must be core or extension.");
  return parsed;
}

const PIP_PLATFORMS = {
  "mac-arm64": ["macosx_11_0_arm64", "macosx_12_0_arm64", "macosx_13_0_arm64", "macosx_14_0_arm64", "macosx_10_9_universal2", "macosx_11_0_universal2"],
  "mac-x64": ["macosx_10_9_x86_64", "macosx_10_13_x86_64", "macosx_10_15_x86_64", "macosx_11_0_x86_64", "macosx_12_0_x86_64", "macosx_13_0_x86_64", "macosx_14_0_x86_64", "macosx_10_9_universal2", "macosx_11_0_universal2"],
  "linux-x64": ["manylinux_2_17_x86_64", "manylinux2014_x86_64", "manylinux_2_24_x86_64", "manylinux_2_26_x86_64", "manylinux_2_27_x86_64", "manylinux_2_28_x86_64", "manylinux_2_5_x86_64", "manylinux1_x86_64", "manylinux_2_12_x86_64", "manylinux2010_x86_64"],
  "linux-arm64": ["manylinux_2_17_aarch64", "manylinux2014_aarch64", "manylinux_2_24_aarch64", "manylinux_2_26_aarch64", "manylinux_2_27_aarch64", "manylinux_2_28_aarch64"],
  "win-x64": ["win_amd64"],
};

const SITECUSTOMIZE = `"""ActSpace: mounts the on-demand extension layer as a site directory.

The Host sets ACTSPACE_PYTHON_EXT to <dataRoot>/runtime/python-ext/<digest>/site-packages once it is installed.
Only the bundled interpreter imports this file, so a project's own Python is never affected.
"""
import os
import site

_extension = os.environ.get("ACTSPACE_PYTHON_EXT")
if _extension and os.path.isdir(_extension):
    site.addsitedir(_extension)
del _extension
`;

if (options.layer === "core") await prepareCore(); else await prepareExtension();
