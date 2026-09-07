import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, readlink, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = `${process.platform}-${process.arch}`;
const artifactRoot = resolve(readOption("--out-dir") ?? join(repoRoot, "artifacts", "agent-cli-managed", target));
const packageRoot = join(artifactRoot, "actspace-agent");
const archive = join(artifactRoot, "actspace-agent.tar.gz");

await rm(packageRoot, { recursive: true, force: true });
await rm(archive, { force: true });
await mkdir(artifactRoot, { recursive: true });
run("pnpm", ["--filter", "@actspace/shared", "build"]);
run("pnpm", ["--filter", "@actspace/runtime", "build"]);
run("pnpm", ["--filter", "@actspace/agent-cli", "build"]);
try {
  run("pnpm", ["--filter", "@actspace/agent-cli", "deploy", "--legacy", "--prod", "--offline", packageRoot]);
} catch {
  process.stderr.write("Offline managed CLI deploy failed; retrying with registry access.\n");
  run("pnpm", ["--filter", "@actspace/agent-cli", "deploy", "--legacy", "--prod", packageRoot]);
}
await rm(join(packageRoot, "node_modules", ".pnpm", "node_modules", "@actspace", "agent-cli"), { force: true });

const binDir = join(packageRoot, "bin");
await mkdir(binDir, { recursive: true });
const launcher = join(binDir, "actspace-agent");
await writeFile(launcher, `#!/usr/bin/env node
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
  process.stderr.write("ActSpace Agent requires Node >=22.19.0.\\n");
  process.exit(1);
}
require("../dist/cli.js").main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
`, "utf8");
await chmod(launcher, 0o755);
const manifestPath = join(packageRoot, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.bin = { "actspace-agent": "bin/actspace-agent" };
manifest.engines = { node: ">=22.19.0" };
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
assertNoDeepImports(await regularFiles(join(packageRoot, "dist")));
const dependencies = await dependencyInventory(packageRoot);
await writeFile(join(packageRoot, "DEPENDENCIES.json"), `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), packages: dependencies }, null, 2)}\n`, "utf8");
await writeFile(join(packageRoot, "THIRD_PARTY_NOTICES.md"), licenseNotice(dependencies), "utf8");
await writeFile(join(packageRoot, "MANIFEST.sha256"), await integrityManifest(packageRoot), "utf8");
run("tar", ["-czf", archive, "-C", artifactRoot, "actspace-agent"]);
process.stdout.write(`${packageRoot}\n${archive}\n`);

function readOption(name) { const index = process.argv.indexOf(name); if (index < 0) return undefined; const value = process.argv[index + 1]; if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`); return value; }
function run(command, args) { execFileSync(command, args, { cwd: repoRoot, stdio: "inherit" }); }

async function dependencyInventory(root) {
  const manifests = (await regularFiles(join(root, "node_modules"))).filter((path) => path.endsWith("/package.json") || path.endsWith("\\package.json"));
  const packages = new Map();
  for (const path of manifests) {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (typeof value.name !== "string" || typeof value.version !== "string") continue;
    const key = `${value.name}@${value.version}`;
    const source = path.slice(root.length + 1);
    const current = packages.get(key);
    if (current === undefined || source.length < current.source.length) packages.set(key, { name: value.name, version: value.version, license: normalizeLicense(value.license), source });
  }
  return [...packages.values()].sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
}

function normalizeLicense(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.type === "string") return value.type;
  return "UNKNOWN";
}

function licenseNotice(packages) {
  const rows = packages.map((entry) => `| ${escapeCell(entry.name)} | ${escapeCell(entry.version)} | ${escapeCell(entry.license)} | ${escapeCell(entry.source)} |`).join("\n");
  return `# Third-Party Notices\n\nThis managed package contains the following production dependencies. License files distributed by each package remain beside its package contents.\n\n| Package | Version | License | Package manifest |\n|---|---:|---|---|\n${rows}\n`;
}

function escapeCell(value) { return String(value).replaceAll("|", "\\|").replaceAll("\n", " "); }

async function integrityManifest(root) {
  const files = (await regularFiles(root)).filter((path) => path !== join(root, "MANIFEST.sha256")).sort();
  const rows = [];
  for (const path of files) {
    const metadata = await lstat(path);
    const relativePath = path.slice(root.length + 1);
    const payload = metadata.isSymbolicLink() ? Buffer.from(`symlink:${await readlink(path)}`) : await readFile(path);
    rows.push(`${createHash("sha256").update(payload).digest("hex")}  ${relativePath}`);
  }
  return `${rows.join("\n")}\n`;
}

async function regularFiles(root) {
  const output = [];
  const visited = new Set();
  async function visit(path) {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
      const target = await realpath(path);
      const relativeTarget = target.slice(packageRoot.length + 1);
      if (target !== packageRoot && (relativeTarget.startsWith("..") || resolve(packageRoot, relativeTarget) !== target)) throw new Error(`Managed package symlink escapes package root: ${path}`);
      await visit(target);
      return;
    }
    if (!metadata.isDirectory()) { output.push(path); return; }
    const canonical = await realpath(path);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    for (const entry of await readdir(path, { withFileTypes: true })) await visit(join(path, entry.name));
  }
  try { await visit(root); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  return output;
}

function assertNoDeepImports(files) {
  return Promise.all(files.filter((path) => /\.[cm]?js$/.test(path)).map(async (path) => {
    const source = await readFile(path, "utf8");
    if (/(?:@actspace\/runtime|@deepseek-ai\/[^"']+)\/src\//.test(source)) throw new Error(`Managed CLI contains a forbidden source deep import: ${path}`);
  }));
}
