import { PLUGIN_CATALOG } from "../dist/plugin-catalog.js";
import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Explicit built-in closure, not an arbitrary npm plugin packager. Host contracts
// retain module identity; execution implementation code is bundled into artifacts.
// Entries are the Harness rows of the plugin catalog; each `module` is a package subpath.
const root = fileURLToPath(new URL("../", import.meta.url));
const outdir = join(root, "dist/default-harness");
const entries = Object.fromEntries(PLUGIN_CATALOG.filter(entry => entry.loaders.includes("harness")).map(entry => [entry.id, entry.module]));
const external = ["@actspace/cordis-adapter", "@actspace/scope", "@actspace/shared", "@actspace/shared/*", "@actspace/session-journal", "@actspace/session-persistence", "@actspace/session-projection"];
await rm(outdir, { recursive: true, force: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: Object.entries(entries).map(([out, specifier]) => ({ out, in: specifier })),
  outdir, bundle: true, splitting: true, format: "esm", platform: "node", target: "node22", external,
  metafile: true, write: true,
});
await mkdir(outdir, { recursive: true });
const files = Object.keys(result.metafile.outputs).map(path => path.slice("dist/default-harness/".length)).sort();
await writeFile(join(outdir, "files.json"), JSON.stringify(files, null, 2) + "\n");
console.log(`Default Harness: ${files.length} fixed ESM files`);
