#!/usr/bin/env node
// Verifies the plugin catalog (packages/core/runtime/src/plugin-catalog.ts) against the repository:
//   - every catalog row's manifest carries `display`, and `display.scope` agrees with `loaders`;
//   - `module` and `codec` resolve;
//   - every package with `src/plugin.ts` is in the catalog or in PLUGIN_PACKAGES_OUTSIDE_DEFAULT;
//   - the desktop app bundle's manifests and apps/cli/cordis.yml only mention catalogued plugins.
// Reads the built runtime (`pnpm --filter @actspace/runtime build` first).
import { access, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageOf = (specifier) => specifier.split("/").slice(0, 2).join("/");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function pluginPackages(repoRoot) {
  const found = [];
  const base = join(repoRoot, "packages");
  let capabilities = [];
  try {
    capabilities = await readdir(base, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const capability of capabilities) {
    if (!capability.isDirectory() || capability.name.startsWith(".") || capability.name === "node_modules") continue;
    for (const pkg of await readdir(join(base, capability.name), { withFileTypes: true })) {
      if (!pkg.isDirectory() || pkg.name === "node_modules") continue;
      const dir = join(base, capability.name, pkg.name);
      if (!(await exists(join(dir, "src", "plugin.ts"))) || !(await exists(join(dir, "package.json")))) continue;
      found.push({ name: JSON.parse(await readFile(join(dir, "package.json"), "utf8")).name, dir });
    }
  }
  return found;
}

/** @returns {Promise<string[]>} failure messages; empty when the catalog is consistent. */
export async function checkPluginCatalog({
  repoRoot,
  catalog,
  outsideDefault,
  resolveSpecifier,
  desktopBundleManifests = [],
  cliEntries = [],
}) {
  const failures = [];
  const outside = new Set(outsideDefault.map((item) => item.package));
  const catalogPackages = new Set(catalog.map((entry) => packageOf(entry.module)));
  const catalogIds = new Set(catalog.map((entry) => entry.id));
  const ids = new Set();
  for (const entry of catalog) {
    if (ids.has(entry.id)) failures.push(`${entry.id}: duplicate catalog id`);
    ids.add(entry.id);
    const display = entry.manifest.display;
    if (display === undefined) failures.push(`${entry.id}: manifest has no display`);
    else {
      const expected = entry.loaders.includes("host") ? "global" : "session";
      if (display.scope !== expected)
        failures.push(
          `${entry.id}: display.scope is "${display.scope}" but loaders ${JSON.stringify(entry.loaders)} imply "${expected}"`,
        );
    }
    for (const [kind, specifier] of [
      ["module", entry.module],
      ["codec", entry.codec],
    ]) {
      if (specifier === undefined) continue;
      try {
        resolveSpecifier(specifier);
      } catch (error) {
        failures.push(
          `${entry.id}: ${kind} ${specifier} does not resolve (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }
  }
  for (const pkg of await pluginPackages(repoRoot)) {
    if (!catalogPackages.has(pkg.name) && !outside.has(pkg.name))
      failures.push(
        `${pkg.name}: has src/plugin.ts but is neither in PLUGIN_CATALOG nor in PLUGIN_PACKAGES_OUTSIDE_DEFAULT`,
      );
  }
  const catalogPluginIds = new Set(catalog.map((entry) => entry.manifest.pluginId));
  for (const manifest of desktopBundleManifests) {
    if (!catalogPluginIds.has(manifest.pluginId))
      failures.push(`DESKTOP_APP_BUNDLE: manifest ${manifest.pluginId} is not in PLUGIN_CATALOG`);
  }
  for (const entry of cliEntries) {
    if (!catalogIds.has(entry.id) && !outside.has(packageOf(entry.name)))
      failures.push(
        `apps/cli/cordis.yml: ${entry.id} (${entry.name}) is neither in PLUGIN_CATALOG nor in PLUGIN_PACKAGES_OUTSIDE_DEFAULT`,
      );
  }
  return failures;
}

export function parseLoaderEntries(yaml) {
  const entries = [];
  for (const line of yaml.split("\n")) {
    const id = /^- id:\s*(\S+)/.exec(line);
    if (id) {
      entries.push({ id: id[1], name: "" });
      continue;
    }
    const name = /^\s+name:\s*"?([^"\s]+)"?/.exec(line);
    if (name && entries.length > 0) entries[entries.length - 1].name = name[1];
  }
  return entries;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const runtimeDir = join(repoRoot, "packages/core/runtime");
  const require = createRequire(join(runtimeDir, "package.json"));
  const catalogModule = await import(pathToFileURL(join(runtimeDir, "dist/plugin-catalog.js")).href);
  const desktopApp = await import(pathToFileURL(require.resolve("@actspace/desktop-app")).href);
  const cliEntries = parseLoaderEntries(await readFile(join(repoRoot, "apps/cli/cordis.yml"), "utf8"));
  const failures = await checkPluginCatalog({
    repoRoot,
    catalog: catalogModule.PLUGIN_CATALOG,
    outsideDefault: catalogModule.PLUGIN_PACKAGES_OUTSIDE_DEFAULT,
    resolveSpecifier: (specifier) => require.resolve(specifier),
    desktopBundleManifests: desktopApp.DESKTOP_APP_BUNDLE.manifests,
    cliEntries,
  });
  if (failures.length > 0) {
    process.stderr.write(`plugin catalog check failed (${failures.length}):\n${failures.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`plugin catalog check passed (${catalogModule.PLUGIN_CATALOG.length} catalog rows)\n`);
  }
}
