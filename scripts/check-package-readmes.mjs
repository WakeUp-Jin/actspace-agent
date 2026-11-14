#!/usr/bin/env node
// Verifies the package READMEs against the repository:
//   - packages/README.md lists every capability directory under packages/ (and the package count);
//   - every capability directory has a README whose package table lists exactly its packages;
//   - when the built runtime is available: each package's 类别 / 默认 cell agrees with PLUGIN_CATALOG and
//     PLUGIN_PACKAGES_OUTSIDE_DEFAULT, and the map's 类别 cell agrees with the capability's packages.
// The catalog comes from the built runtime (`pnpm --filter @actspace/runtime build`); CI's docs step runs
// without a build, so the category checks are skipped (with a notice) when it is missing.
import { access, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LIBRARY = "库";
const OUTSIDE = "不在默认组合";
const ORDER = ["全局", "会话"];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function subdirs(dir) {
  return (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
    .map((entry) => entry.name)
    .sort();
}

/** @returns {Promise<Map<string, {name: string, packages: Map<string, string>}>>} capability dir -> package dir -> package name */
async function scanPackages(repoRoot) {
  const base = join(repoRoot, "packages");
  const result = new Map();
  for (const capability of await subdirs(base)) {
    const packages = new Map();
    for (const dir of await subdirs(join(base, capability))) {
      const manifestPath = join(base, capability, dir, "package.json");
      if (!(await exists(manifestPath))) continue;
      packages.set(dir, JSON.parse(await readFile(manifestPath, "utf8")).name);
    }
    if (packages.size > 0) result.set(capability, packages);
  }
  return result;
}

/** Rows of the first table whose header starts with `firstHeader`; each row is its trimmed cells. */
export function parseTable(markdown, firstHeader) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.startsWith("|") && line.split("|")[1]?.trim() === firstHeader);
  if (start === -1) return undefined;
  const header = lines[start]
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    rows.push(Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])));
  }
  return rows;
}

const stripTicks = (cell) => cell.replace(/^\[?`([^`]+)`.*$/s, "$1").replace(/\/$/, "");

/** Category and default cells a package's README row must show. */
function expectedCells(packageName, catalog, outsideDefault) {
  const rows = catalog.filter((entry) => entry.module.split("/").slice(0, 2).join("/") === packageName);
  if (rows.length > 0) {
    const scopes = new Set(rows.map((entry) => (entry.loaders.includes("host") ? "全局" : "会话")));
    const category = ORDER.filter((scope) => scopes.has(scope)).join("+");
    const enabled = rows.every((entry) => entry.manifest.display?.defaultEnabled !== false) ? "开" : "关";
    return { category, enabled };
  }
  if (outsideDefault.some((item) => item.package === packageName)) return { category: OUTSIDE, enabled: "—" };
  return { category: LIBRARY, enabled: "—" };
}

/** The map's 类别 cell: scopes, then 库 (a package outside the default composition counts as a library). */
function expectedMapCategory(categories) {
  const parts = new Set();
  for (const category of categories) {
    if (category === OUTSIDE || category === LIBRARY) parts.add(LIBRARY);
    else for (const scope of category.split("+")) parts.add(scope);
  }
  return [...ORDER, LIBRARY].filter((name) => parts.has(name)).join("、");
}

/** @returns {Promise<string[]>} failure messages; empty when the READMEs match the repository. */
export async function checkPackageReadmes({ repoRoot, catalog, outsideDefault }) {
  const failures = [];
  const capabilities = await scanPackages(repoRoot);
  const mapPath = join(repoRoot, "packages", "README.md");
  const mapText = (await exists(mapPath)) ? await readFile(mapPath, "utf8") : undefined;
  const mapRows = mapText === undefined ? undefined : parseTable(mapText, "目录");
  if (mapText === undefined) failures.push("packages/README.md: missing");
  else if (mapRows === undefined) failures.push("packages/README.md: no capability table (header starting with 目录)");

  const mapped = new Map((mapRows ?? []).map((row) => [stripTicks(row["目录"]), row]));
  for (const capability of mapped.keys()) {
    if (!capabilities.has(capability))
      failures.push(`packages/README.md: lists "${capability}/" but packages/${capability}/ has no packages`);
  }

  for (const [capability, packages] of capabilities) {
    const mapRow = mapped.get(capability);
    if (mapRows !== undefined && mapRow === undefined)
      failures.push(`packages/README.md: capability directory "${capability}/" is not in the table`);
    if (mapRow !== undefined && Number(mapRow["包数"]) !== packages.size)
      failures.push(`packages/README.md: "${capability}/" says ${mapRow["包数"]} packages but has ${packages.size}`);

    const readmePath = join(repoRoot, "packages", capability, "README.md");
    if (!(await exists(readmePath))) {
      failures.push(`packages/${capability}/README.md: missing`);
      continue;
    }
    const rows = parseTable(await readFile(readmePath, "utf8"), "包");
    if (rows === undefined) {
      failures.push(`packages/${capability}/README.md: no package table (header starting with 包)`);
      continue;
    }

    const listed = new Map(rows.map((row) => [stripTicks(row["包"]), row]));
    for (const dir of packages.keys())
      if (!listed.has(dir)) failures.push(`packages/${capability}/README.md: package "${dir}" is not in the table`);
    for (const dir of listed.keys())
      if (!packages.has(dir))
        failures.push(
          `packages/${capability}/README.md: table lists "${dir}" but packages/${capability}/${dir}/ does not exist`,
        );
    if (rows.length !== listed.size) failures.push(`packages/${capability}/README.md: duplicate package rows`);

    if (catalog === undefined) continue;
    const categories = [];
    for (const [dir, name] of packages) {
      const expected = expectedCells(name, catalog, outsideDefault);
      categories.push(expected.category);
      const row = listed.get(dir);
      if (row === undefined) continue;
      if (row["类别"] !== expected.category)
        failures.push(
          `packages/${capability}/README.md: "${dir}" 类别 is "${row["类别"]}" but the catalog implies "${expected.category}"`,
        );
      if (row["默认"] !== expected.enabled)
        failures.push(
          `packages/${capability}/README.md: "${dir}" 默认 is "${row["默认"]}" but the manifest implies "${expected.enabled}"`,
        );
    }
    const expectedMap = expectedMapCategory(categories);
    if (mapRow !== undefined && mapRow["类别"] !== expectedMap)
      failures.push(
        `packages/README.md: "${capability}/" 类别 is "${mapRow["类别"]}" but its packages imply "${expectedMap}"`,
      );
  }
  return failures;
}

async function loadCatalog(repoRoot) {
  const catalogPath = join(repoRoot, "packages/core/runtime/dist/plugin-catalog.js");
  if (!(await exists(catalogPath)))
    return { skipped: "packages/core/runtime/dist/plugin-catalog.js is missing (runtime not built)" };
  try {
    const module = await import(pathToFileURL(catalogPath).href);
    return { catalog: module.PLUGIN_CATALOG, outsideDefault: module.PLUGIN_PACKAGES_OUTSIDE_DEFAULT };
  } catch (error) {
    return {
      skipped: `the built plugin catalog could not be loaded (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const loaded = await loadCatalog(repoRoot);
  const failures = await checkPackageReadmes({
    repoRoot,
    catalog: loaded.catalog,
    outsideDefault: loaded.outsideDefault,
  });
  if (loaded.skipped) process.stdout.write(`package README category checks skipped: ${loaded.skipped}\n`);
  if (failures.length > 0) {
    process.stderr.write(`package README check failed (${failures.length}):\n${failures.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("package README check passed\n");
  }
}
