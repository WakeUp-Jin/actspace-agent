#!/usr/bin/env node
// Generates packages/core/runtime/cordis.yml (the Host loader tree) from the plugin catalog.
// `--check` only compares and fails when the checked-in file is stale.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtimeDir = join(root, "packages/core/runtime");
const target = join(runtimeDir, "cordis.yml");
const HEADER = "# 由 scripts/generate-plugin-loader.mjs 生成，勿手改\n";

export function renderPluginLoader(catalog) {
  const rows = catalog
    .filter((entry) => entry.loaders.includes("host"))
    .map((entry) => {
      const inject = entry.manifest.behaviors[0]?.injects ?? [];
      return [
        `- id: ${entry.id}`,
        `  name: ${JSON.stringify(entry.module)}`,
        ...(inject.length > 0 ? [`  inject: [${inject.join(", ")}]`] : []),
      ].join("\n");
    });
  return HEADER + rows.join("\n") + "\n";
}

async function loadCatalog() {
  const module = await import(pathToFileURL(join(runtimeDir, "dist/plugin-catalog.js")).href);
  return module.PLUGIN_CATALOG;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const expected = renderPluginLoader(await loadCatalog());
  if (process.argv.includes("--check")) {
    const actual = await readFile(target, "utf8").catch(() => "");
    if (actual !== expected) {
      console.error("packages/core/runtime/cordis.yml is out of date. Run `pnpm generate:plugin-loader`.");
      process.exit(1);
    }
    console.log("plugin loader (cordis.yml) is up to date");
  } else {
    await writeFile(target, expected);
    console.log(`wrote ${target}`);
  }
}
