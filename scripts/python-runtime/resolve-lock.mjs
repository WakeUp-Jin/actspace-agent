#!/usr/bin/env node
// Regenerates packages/shell/python-runtime/lock.json: the pinned python-build-standalone release per target plus
// the wheel closure (URL + sha256) of the core and extension layers, resolved by the host pip for every target.
//   node scripts/python-runtime/resolve-lock.mjs [--python <pip-capable python>]
// Only the lock changes; prepare.mjs and the app read the lock, never this file.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const LOCK_PATH = join(root, "packages", "shell", "python-runtime", "lock.json");

const PYTHON = { version: "3.12.16", release: "20261026", flavor: "install_only_stripped" };
/** Shipped with the app. pdfplumber needs pdfminer.six and pypdfium2, so PDF rendering is in the core as well. */
const CORE = ["openpyxl", "XlsxWriter", "python-docx", "python-pptx", "lxml", "Pillow", "pypdf", "pdfplumber"];
/** Downloaded on demand: data analysis, and markitdown whose magika / onnxruntime dependency is too large to ship. */
const EXTENSION = ["numpy", "pandas", "markitdown[docx,xlsx,pptx,pdf]"];

const MAC_UNIVERSAL = ["macosx_10_9_universal2", "macosx_10_13_universal2", "macosx_11_0_universal2", "macosx_12_0_universal2", "macosx_13_0_universal2", "macosx_14_0_universal2"];
const TARGETS = {
  "mac-arm64": { platform: "darwin", arch: "arm64", pbs: "aarch64-apple-darwin", pip: ["macosx_11_0_arm64", "macosx_12_0_arm64", "macosx_13_0_arm64", "macosx_14_0_arm64", ...MAC_UNIVERSAL] },
  "mac-x64": { platform: "darwin", arch: "x64", pbs: "x86_64-apple-darwin", pip: ["macosx_10_9_x86_64", "macosx_10_13_x86_64", "macosx_10_15_x86_64", "macosx_11_0_x86_64", "macosx_12_0_x86_64", "macosx_13_0_x86_64", "macosx_14_0_x86_64", ...MAC_UNIVERSAL] },
  "linux-x64": { platform: "linux", arch: "x64", pbs: "x86_64-unknown-linux-gnu", pip: ["manylinux_2_17_x86_64", "manylinux2014_x86_64", "manylinux_2_24_x86_64", "manylinux_2_26_x86_64", "manylinux_2_27_x86_64", "manylinux_2_28_x86_64", "manylinux_2_5_x86_64", "manylinux1_x86_64", "manylinux_2_12_x86_64", "manylinux2010_x86_64"] },
  "linux-arm64": { platform: "linux", arch: "arm64", pbs: "aarch64-unknown-linux-gnu", pip: ["manylinux_2_17_aarch64", "manylinux2014_aarch64", "manylinux_2_24_aarch64", "manylinux_2_26_aarch64", "manylinux_2_27_aarch64", "manylinux_2_28_aarch64"] },
  "win-x64": { platform: "win32", arch: "x64", pbs: "x86_64-pc-windows-msvc", pip: ["win_amd64"] },
};

function parseArgs(argv) {
  const options = { python: process.platform === "win32" ? "python" : "python3" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--python") options.python = argv[++index] ?? (() => { throw new Error("--python needs a value."); })();
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

async function pythonChecksums() {
  const base = `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON.release}`;
  const sums = execFileSync("curl", ["-fsSL", "--retry", "3", `${base}/SHA256SUMS`], { encoding: "utf8" });
  const result = {};
  for (const [target, spec] of Object.entries(TARGETS)) {
    const file = `cpython-${PYTHON.version}+${PYTHON.release}-${spec.pbs}-${PYTHON.flavor}.tar.gz`;
    const line = sums.split("\n").find(line => line.endsWith(`  ${file}`));
    if (!line) throw new Error(`SHA256SUMS has no entry for ${file}.`);
    result[target] = { url: `${base}/${file}`, sha256: line.slice(0, 64) };
  }
  return result;
}

/** `pip install --dry-run --report`: the resolved wheel set with download URLs and hashes, no wheel downloads needed. */
async function resolveWheels(python, spec, work) {
  const report = join(work, "report.json");
  const args = ["-m", "pip", "install", "--dry-run", "--ignore-installed", "--quiet", "--only-binary=:all:", "--python-version", PYTHON.version.split(".").slice(0, 2).join("."), "--implementation", "cp", "--abi", "cp312", "--abi", "abi3", "--abi", "none", "--target", join(work, "target"), "--report", report];
  for (const platform of spec.pip) args.push("--platform", platform);
  execFileSync(python, [...args, ...CORE, ...EXTENSION], { stdio: ["ignore", "inherit", "inherit"] });
  const parsed = JSON.parse(await readFile(report, "utf8"));
  return parsed.install.map(item => {
    const url = item.download_info?.url; const sha256 = item.download_info?.archive_info?.hashes?.sha256;
    const name = item.metadata?.name; const version = item.metadata?.version;
    if (typeof url !== "string" || !/^[a-f0-9]{64}$/.test(sha256 ?? "") || typeof name !== "string" || typeof version !== "string") throw new Error(`pip report has an incomplete entry: ${JSON.stringify(item).slice(0, 200)}`);
    if (!url.endsWith(".whl")) throw new Error(`${name} ${version} resolved to a non-wheel artifact: ${url}`);
    return { name: normalize(name), version, file: url.slice(url.lastIndexOf("/") + 1), url, sha256, requires: (item.metadata?.requires_dist ?? []) };
  });
}

function normalize(name) { return name.toLowerCase().replace(/[-_.]+/g, "-"); }
function projectOf(spec) { return normalize(spec.replace(/\[.*$/, "")); }

/** The core layer is the dependency closure of CORE (markers ignored, which can only over-approximate); the rest is the extension. */
function splitLayers(wheels) {
  const byName = new Map(wheels.map(wheel => [wheel.name, wheel]));
  const core = new Set();
  const visit = name => {
    const wheel = byName.get(name);
    if (!wheel || core.has(name)) return;
    core.add(name);
    for (const requirement of wheel.requires) {
      // "pdfminer.six (>=20231228)" or "Pillow>=9.1; extra == 'foo'" -> project name; skip extras-only requirements.
      if (/;\s*extra\s*==/.test(requirement)) continue;
      visit(projectOf(requirement.split(/[\s;(<>=!~\[]/)[0]));
    }
  };
  for (const spec of CORE) visit(projectOf(spec));
  const entry = wheel => ({ name: wheel.name, version: wheel.version, file: wheel.file, url: wheel.url, sha256: wheel.sha256 });
  const sorted = list => list.sort((a, b) => a.name.localeCompare(b.name)).map(entry);
  return { core: sorted(wheels.filter(wheel => core.has(wheel.name))), extension: sorted(wheels.filter(wheel => !core.has(wheel.name))) };
}

const options = parseArgs(process.argv.slice(2));
const python = await pythonChecksums();
const targets = {};
for (const [target, spec] of Object.entries(TARGETS)) {
  const work = await mkdtemp(join(tmpdir(), "actspace-python-lock-"));
  try {
    console.error(`[resolve-lock] ${target}`);
    const layers = splitLayers(await resolveWheels(options.python, spec, work));
    targets[target] = { platform: spec.platform, arch: spec.arch, python: python[target], ...layers };
  } finally { await rm(work, { recursive: true, force: true }); }
}
const lock = {
  schemaVersion: 1,
  python: { version: PYTHON.version, release: PYTHON.release },
  core: CORE, extension: EXTENSION,
  targets,
};
await writeFile(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`);
console.error(`[resolve-lock] wrote ${LOCK_PATH}`);
