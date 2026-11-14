import { PLUGIN_CATALOG, isHarnessToolPlugin } from "../dist/plugin-catalog.js";
import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Explicit built-in closure, not an arbitrary npm plugin packager. Host contracts
// retain module identity; execution implementation code is bundled into artifacts.
// Entries are the Harness rows of the plugin catalog; each `module` is a package subpath.
//
// Two layers come out of one build:
// - the kernel (loop, context, tools runtime, sandbox, approval): one code-split closure at the
//   root of `dist/default-harness/`, published as the single artifact `actspace.default-harness`;
// - each tool plugin (`isHarnessToolPlugin`): a self-contained `plugins/<entry>/plugin.js`,
//   published under its own manifest so a Harness patch can replace that plugin alone.
// Tool plugins only reach the kernel through services, so bundling them separately duplicates
// nothing that relies on module identity (no shared `instanceof` classes, symbols or weak maps).
// A plugin names a kernel service by importing its definition (`TOOL_RUNTIME_SERVICE`, `LLM_SERVICE`, ...).
// That import must not carry the implementation along: the owning package keeps its definitions in a
// `service-keys.ts` that only type-imports the implementation and declares `"sideEffects": false`.
// `default-harness.test.ts` fails when a plugin artifact contains a service class.
const root = fileURLToPath(new URL("../", import.meta.url));
const outdir = join(root, "dist/default-harness");
const harness = PLUGIN_CATALOG.filter((entry) => entry.loaders.includes("harness"));
const kernel = harness.filter((entry) => !isHarnessToolPlugin(entry));
const plugins = harness.filter(isHarnessToolPlugin);
const external = [
  "@actspace/cordis-adapter",
  "@actspace/scope",
  "@actspace/shared",
  "@actspace/shared/*",
  "@actspace/session-journal",
  "@actspace/session-persistence",
  "@actspace/session-projection",
];
const common = {
  absWorkingDir: root,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external,
  metafile: true,
  write: true,
};
const relativeOutputs = (result, prefix) =>
  Object.keys(result.metafile.outputs)
    .map((path) => path.slice(prefix.length))
    .sort();

await rm(outdir, { recursive: true, force: true });
const kernelBuild = await build({
  ...common,
  entryPoints: kernel.map((entry) => ({ out: entry.id, in: entry.module })),
  outdir,
  splitting: true,
});
const inventory = { kernel: relativeOutputs(kernelBuild, "dist/default-harness/"), plugins: {} };
// Same segment join as `publishPluginArtifact`'s sourceRoot in default-harness.ts; this is the
// artifact layout under dist, not the retired workspace plugins directory the cutover check hunts.
for (const entry of plugins) {
  const pluginDir = join("dist/default-harness", "plugins", entry.id);
  const result = await build({
    ...common,
    entryPoints: [{ out: "plugin", in: entry.module }],
    outdir: join(root, pluginDir),
    splitting: false,
  });
  inventory.plugins[entry.id] = relativeOutputs(result, `${pluginDir}/`);
}
await mkdir(outdir, { recursive: true });
await writeFile(join(outdir, "files.json"), JSON.stringify(inventory, null, 2) + "\n");
const pluginFiles = Object.values(inventory.plugins).reduce((count, files) => count + files.length, 0);
console.log(
  `Default Harness: kernel ${inventory.kernel.length} fixed ESM files, ${plugins.length} tool plugins (${pluginFiles} files)`,
);
