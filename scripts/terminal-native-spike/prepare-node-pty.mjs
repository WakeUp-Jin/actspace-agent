import { chmod, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const desktopRequire = createRequire(path.join(repoRoot, "packages/desktop/package.json"));
const packageJsonPath = desktopRequire.resolve("node-pty/package.json");
const packageRoot = path.dirname(packageJsonPath);
const targetDir = path.join(packageRoot, "prebuilds", `${process.platform}-${process.arch}`);
const ptyNodePath = path.join(targetDir, "pty.node");
const spawnHelperPath = path.join(targetDir, "spawn-helper");

if (process.platform !== "win32") {
  await chmod(spawnHelperPath, 0o755);
}

const [ptyNodeStat, spawnHelperStat] = await Promise.all([stat(ptyNodePath), stat(spawnHelperPath)]);
const result = {
  nodePtyVersion: desktopRequire("node-pty/package.json").version,
  platform: process.platform,
  arch: process.arch,
  ptyNodePath,
  ptyNodeBytes: ptyNodeStat.size,
  spawnHelperPath,
  spawnHelperBytes: spawnHelperStat.size,
  spawnHelperExecutable: process.platform === "win32" || (spawnHelperStat.mode & 0o111) !== 0,
};

if (!result.spawnHelperExecutable) {
  throw new Error(`node-pty spawn-helper is not executable: ${spawnHelperPath}`);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
