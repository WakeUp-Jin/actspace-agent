import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const targetConfig = JSON.parse(await readFile(join(scriptDir, "agent-cli-binary-targets.json"), "utf8"));
const cliPackage = JSON.parse(await readFile(join(repoRoot, "packages/agent-cli/package.json"), "utf8"));
const args = new Set(process.argv.slice(2));
const requestedTarget = readOption("--target") ?? `${process.platform}-${process.arch}`;
const nativeTarget = `${process.platform}-${process.arch}`;
const bundleOnly = args.has("--bundle-only");

if (!targetConfig.targets[requestedTarget]) fail(`Unsupported CLI binary target: ${requestedTarget}`);
if (!bundleOnly && requestedTarget !== nativeTarget) {
  fail(`SEA binaries must be built on their native target. Requested ${requestedTarget}, running ${nativeTarget}.`);
}
if (!bundleOnly && process.versions.node !== targetConfig.nodeVersion) {
  fail(`Node ${targetConfig.nodeVersion} is required for reproducible SEA builds; found ${process.versions.node}.`);
}

const target = targetConfig.targets[requestedTarget];
const outDir = resolve(readOption("--out-dir") ?? join(repoRoot, "artifacts", "agent-cli", requestedTarget));
const workDir = join(outDir, ".build");
const bundlePath = join(workDir, "agent-cli.cjs");
const rgPath = resolveNativeRipgrep();
const rgSha256 = await hashFile(rgPath);
const buildId = process.env.GITHUB_SHA?.slice(0, 12) ?? gitBuildId();
await mkdir(workDir, { recursive: true });

const buildResult = await build({
  entryPoints: [join(repoRoot, "packages/agent-cli/src/cli.ts")],
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  metafile: true,
  external: ["@vscode/ripgrep"],
  define: {
    __ACTSPACE_CLI_VERSION__: JSON.stringify(cliPackage.version),
    __ACTSPACE_CLI_BUILD_ID__: JSON.stringify(buildId),
    __ACTSPACE_CLI_TARGET__: JSON.stringify(requestedTarget),
    __ACTSPACE_RG_ASSET_KEY__: JSON.stringify(targetConfig.assetKey),
    __ACTSPACE_RG_SHA256__: JSON.stringify(rgSha256),
  },
});
assertBundleIsStandalone(buildResult.metafile);
await writeFile(join(workDir, "bundle-meta.json"), `${JSON.stringify(buildResult.metafile, null, 2)}\n`);

if (bundleOnly) {
  process.stdout.write(`${bundlePath}\n`);
  process.exit(0);
}

const blobPath = join(workDir, "sea-prep.blob");
const seaConfigPath = join(workDir, "sea-config.json");
await writeFile(seaConfigPath, `${JSON.stringify({
  main: bundlePath,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets: { [targetConfig.assetKey]: rgPath },
}, null, 2)}\n`);
run(process.execPath, ["--experimental-sea-config", seaConfigPath]);

const executablePath = join(outDir, target.artifact);
await copyFile(process.execPath, executablePath);
if (process.platform === "darwin") run("codesign", ["--remove-signature", executablePath]);
run(resolvePostject(), [
  executablePath,
  "NODE_SEA_BLOB",
  blobPath,
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ...(process.platform === "darwin" ? ["--macho-segment-name", "NODE_SEA"] : []),
]);
if (process.platform === "darwin") run("codesign", ["--sign", "-", executablePath]);
if (process.platform !== "win32") await chmod(executablePath, 0o755);

const binarySha256 = await hashFile(executablePath);
const manifest = {
  schemaVersion: 1,
  name: "actspace-agent",
  version: cliPackage.version,
  buildId,
  target: requestedTarget,
  nodeVersion: process.versions.node,
  artifact: target.artifact,
  sha256: binarySha256,
  assets: { ripgrep: { key: targetConfig.assetKey, sha256: rgSha256 } },
};
await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(outDir, `${target.artifact}.sha256`), `${binarySha256}  ${target.artifact}\n`);
process.stdout.write(`${executablePath}\n`);

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) fail(`Missing value for ${name}`);
  return value;
}

function resolveNativeRipgrep() {
  const packageName = `@vscode/ripgrep-${process.platform}-${process.arch}`;
  const binaryName = process.platform === "win32" ? "rg.exe" : "rg";
  const coreRequire = createRequire(join(repoRoot, "packages/agent-core/package.json"));
  try {
    const ripgrepEntry = coreRequire.resolve("@vscode/ripgrep");
    return createRequire(ripgrepEntry).resolve(`${packageName}/bin/${binaryName}`);
  } catch (error) {
    fail(`Cannot resolve native ripgrep package ${packageName}: ${error.message}`);
  }
}

function resolvePostject() {
  const packagePath = require.resolve("postject/package.json");
  return join(dirname(packagePath), "dist", "cli.js");
}

function assertBundleIsStandalone(metafile) {
  const allowedExternal = new Set(["@vscode/ripgrep"]);
  const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
  const unresolved = [];
  for (const output of Object.values(metafile.outputs)) {
    for (const item of output.imports ?? []) {
      if (!item.external || item.path.startsWith("node:") || builtins.has(item.path) || allowedExternal.has(item.path)) continue;
      unresolved.push(item.path);
    }
  }
  if (unresolved.length > 0) fail(`Bundle has unresolved runtime imports: ${[...new Set(unresolved)].join(", ")}`);
}

async function hashFile(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function gitBuildId() {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}

function run(command, commandArgs) {
  execFileSync(command, commandArgs, { cwd: repoRoot, stdio: "inherit" });
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
