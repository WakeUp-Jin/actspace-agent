import { access, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const repoRoot = process.env.ACTSPACE_PACKAGE_BOUNDARY_ROOT
  ? resolve(process.env.ACTSPACE_PACKAGE_BOUNDARY_ROOT)
  : resolve(new URL("..", import.meta.url).pathname);
const workspaceRoots = [
  { path: join(repoRoot, "apps"), kind: "app" },
  { path: join(repoRoot, "packages"), kind: "package" },
];
const failures = [];
const manifests = new Map();

async function walk(dir, kind) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    // 隐藏目录不放包（如 apps/web/.host-data 是本地 Host 数据，里面的产物带 package.json）
    if (entry.isDirectory()) { if (!entry.name.startsWith(".")) await walk(path, kind); }
    else if (entry.name === "package.json") {
      const manifest = JSON.parse(await readFile(path, "utf8"));
      manifests.set(manifest.name, { manifest, path, dir, kind });
    }
  }
}

function dependencyNames(manifest) {
  return Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies });
}

function assertExports(name, manifest) {
  const exempt = new Set(["@actspace/desktop", "@actspace/agent-cli", "@actspace/shared", "@actspace/site", "@actspace/web"]);
  if (exempt.has(name)) return;
  if (!manifest.exports || typeof manifest.exports !== "object" || !manifest.exports["."]) failures.push(`${name}: missing package exports['.']`);
  const isLeaf = name.startsWith("@actspace/");
  if (isLeaf && !manifest.type) failures.push(`${name}: leaf package must declare type`);
}

async function assertPluginContract(name, manifest, dir) {
  if (!manifest.exports?.["./plugin"]) return;
  if (!manifest.exports?.["./manifest"]) failures.push(`${name}: loadable plugin package must export './manifest'`);
  if (!(await fileExists(join(dir, "src", "manifest.ts")))) failures.push(`${name}: loadable plugin package is missing src/manifest.ts`);
  if (!(await fileExists(join(dir, "src", "plugin.ts")))) failures.push(`${name}: loadable plugin package is missing src/plugin.ts`);
  if (!(await hasLifecycleTest(dir))) failures.push(`${name}: loadable plugin package is missing a lifecycle.test/spec.ts contract`);

  const codecPath = join(dir, "src", "codec.ts");
  const hasCodec = await fileExists(codecPath);
  if (hasCodec && !manifest.exports?.["./codec"]) failures.push(`${name}: src/codec.ts must be exposed through './codec'`);
  if (manifest.exports?.["./codec"] && !hasCodec) failures.push(`${name}: './codec' export requires src/codec.ts`);
}

// pnpm-workspace.yaml `catalog:` 里的依赖只能在那一个文件里定版本，各包必须写 `catalog:`。
async function readCatalogNames() {
  let source;
  try { source = await readFile(join(repoRoot, "pnpm-workspace.yaml"), "utf8"); } catch { return []; }
  const block = source.match(/^catalog:\n((?:[ \t]+.*\n?)+)/m);
  if (!block) return [];
  return [...block[1].matchAll(/^[ \t]+"?([^"\s:]+)"?\s*:/gm)].map((match) => match[1]);
}

function assertCatalogVersions(name, manifest, catalogNames) {
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const dependency of catalogNames) {
      const spec = manifest[field]?.[dependency];
      if (spec !== undefined && spec !== "catalog:") failures.push(`${name}: ${field}.${dependency} must be "catalog:" (version is pinned in pnpm-workspace.yaml), found ${spec}`);
    }
  }
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function hasLifecycleTest(dir) {
  const roots = [join(dir, "src", "test"), join(dir, "tests")];
  for (const root of roots) if (await findLifecycleTest(root)) return true;
  return false;
}

async function findLifecycleTest(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return false; }
  for (const entry of entries) {
    if (entry.isDirectory() && await findLifecycleTest(join(dir, entry.name))) return true;
    if (entry.isFile() && /lifecycle\.(?:test|spec)\.tsx?$/.test(entry.name)) return true;
  }
  return false;
}

async function scanSource(dir, name) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await scanSource(path, name);
    else if (/\.(?:ts|tsx|mts|mjs|cjs)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      if (/(?:@deepseek-ai\/[^"']+\/src\/)|(?:from\s+["'][^"']*(?:apps|packages)\/[^"']*\/src\/)/.test(source)) {
        failures.push(`${name}: forbidden deep source import in ${path.replace(`${repoRoot}/`, "")}`);
      }
    }
  }
}

function findCycles() {
  const graph = new Map();
  for (const [name, { manifest }] of manifests) graph.set(name, dependencyNames(manifest).filter((dependency) => manifests.has(dependency)));
  const active = new Set();
  const visited = new Set();
  const stack = [];
  function visit(name) {
    if (active.has(name)) {
      const index = stack.indexOf(name);
      failures.push(`dependency cycle: ${[...stack.slice(index), name].join(" -> ")}`);
      return;
    }
    if (visited.has(name)) return;
    active.add(name); stack.push(name);
    for (const dependency of graph.get(name) ?? []) visit(dependency);
    stack.pop(); active.delete(name); visited.add(name);
  }
  for (const name of graph.keys()) visit(name);
}

for (const workspaceRoot of workspaceRoots) await walk(workspaceRoot.path, workspaceRoot.kind);
if (manifests.has("@actspace/harness") || manifests.has("@actspace/plugins")) failures.push("generic harness/plugins package is forbidden");
const catalogNames = await readCatalogNames();
for (const [name, { manifest, dir, kind }] of manifests) {
  if (kind === "app" && manifest.private !== true) failures.push(`${name}: applications must remain private workspace packages`);
  if (kind === "app") {
    for (const dependency of dependencyNames(manifest)) {
      if (manifests.get(dependency)?.kind === "app") failures.push(`${name}: applications cannot depend on sibling application ${dependency}`);
    }
  }
  if (kind === "package") {
    const segments = relative(join(repoRoot, "packages"), dir).split(sep);
    if (segments.length !== 2) failures.push(`${name}: packages must sit exactly at packages/<capability>/<package>, found packages/${segments.join("/")}`);
    else if (name.startsWith("@actspace/") && segments[1] !== name.slice("@actspace/".length)) failures.push(`${name}: directory name must equal the package name without @actspace/, found ${segments[1]}`);
    for (const dependency of dependencyNames(manifest)) {
      if (manifests.get(dependency)?.kind === "app") failures.push(`${name}: reusable packages cannot depend on application ${dependency}`);
    }
  }
  assertExports(name, manifest);
  assertCatalogVersions(name, manifest, catalogNames);
  await assertPluginContract(name, manifest, dir);
  await scanSource(join(dir, "src"), name);
}
findCycles();

if (failures.length) {
  process.stderr.write(`package boundary check failed (${failures.length}):\n${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`package boundary check passed (${manifests.size} workspace package manifests)\n`);
}
