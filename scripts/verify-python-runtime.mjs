#!/usr/bin/env node
// Smoke-tests a prepared Python runtime on this machine:
//   node scripts/verify-python-runtime.mjs <runtime-dir> [--extension <extension-layer-dir>]
// Runs the shim with --version and imports every core package; with --extension also numpy / pandas / markitdown
// through ACTSPACE_PYTHON_EXT. Exits 1 on the first failure. Called by release-package.sh after it copies the runtime.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : undefined;
if (!root) { console.error("usage: verify-python-runtime.mjs <runtime-dir> [--extension <dir>]"); process.exit(2); }
const extensionIndex = args.indexOf("--extension");
const extension = extensionIndex === -1 ? undefined : resolve(args[extensionIndex + 1] ?? "");

const manifest = JSON.parse(readFileSync(join(root, "runtime.json"), "utf8"));
const windows = process.platform === "win32";
const shim = join(root, manifest.shimDirectory, windows ? "actspace-python.cmd" : "actspace-python");
const env = { ...process.env, ...(extension ? { ACTSPACE_PYTHON_EXT: join(extension, "site-packages") } : {}) };

/** A .cmd only runs through cmd.exe; its argument quoting cannot carry Python source, so Windows checks call python.exe with the shim's flags. */
function python(argv) {
  if (!windows) return execFileSync(shim, argv, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  return execFileSync(join(root, ...manifest.executable.split("/")), ["-E", "-s", "-X", "utf8", ...argv], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function run(label, argv) {
  try {
    const output = python(argv);
    console.log(`[verify-python-runtime] ${label}: ${output || "ok"}`);
    return output;
  } catch (error) {
    console.error(`[verify-python-runtime] ${label} failed`);
    console.error(error.stderr ?? error.message);
    process.exit(1);
  }
}

const expected = `Python ${manifest.python.version}`;
const version = windows
  ? execFileSync("cmd.exe", ["/d", "/c", shim, "--version"], { env, encoding: "utf8" }).trim()
  : run("version", ["--version"]);
if (version !== expected) { console.error(`[verify-python-runtime] expected ${expected}, got ${version}`); process.exit(1); }
if (windows) console.log(`[verify-python-runtime] shim: ${version}`);
run("stdlib", ["-c", "import ssl, sqlite3, zlib, json, csv, decimal; print('ssl', ssl.OPENSSL_VERSION)"]);
run("core imports", ["-c", "import openpyxl, xlsxwriter, docx, pptx, lxml, PIL, pypdf, pdfplumber, pypdfium2; print('openpyxl', openpyxl.__version__, 'pypdf', pypdf.__version__)"]);
run("no pip", ["-c", "import importlib.util, sys; sys.exit(1 if importlib.util.find_spec('pip') else 0)"]);
run("user site ignored", ["-c", "import sys, site; sys.exit(1 if site.ENABLE_USER_SITE else 0)"]);
if (extension) run("extension imports", ["-c", "import numpy, pandas, markitdown; print('numpy', numpy.__version__, 'pandas', pandas.__version__)"]);
