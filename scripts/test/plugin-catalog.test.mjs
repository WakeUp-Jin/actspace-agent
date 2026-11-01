import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { checkPluginCatalog, parseLoaderEntries } from "../check-plugin-catalog.mjs";

const display = { title: "示例", description: "示例插件", scope: "session", defaultEnabled: true, canDisable: false };
const row = (id, overrides = {}) => ({ id, manifest: { pluginId: `actspace.${id}`, display }, module: `@actspace/${id}/plugin`, loaders: ["harness"], ...overrides });
const resolveAll = () => "/resolved";

async function repoWithPlugins(names) {
  const root = await mkdtemp(join(tmpdir(), "actspace-plugin-catalog-"));
  for (const name of names) {
    const dir = join(root, "packages", "example", name);
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: `@actspace/${name}` }));
    await writeFile(join(dir, "src", "plugin.ts"), "export {};\n");
  }
  return root;
}

test("a consistent catalog passes", async () => {
  const root = await repoWithPlugins(["alpha", "beta"]);
  try {
    const failures = await checkPluginCatalog({ repoRoot: root, catalog: [row("alpha")], outsideDefault: [{ package: "@actspace/beta", reason: "library" }], resolveSpecifier: resolveAll });
    assert.deepEqual(failures, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a package with plugin.ts that is neither catalogued nor listed as outside the default composition fails", async () => {
  const root = await repoWithPlugins(["alpha", "forgotten"]);
  try {
    const failures = await checkPluginCatalog({ repoRoot: root, catalog: [row("alpha")], outsideDefault: [], resolveSpecifier: resolveAll });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /@actspace\/forgotten: has src\/plugin\.ts but is neither in PLUGIN_CATALOG nor in PLUGIN_PACKAGES_OUTSIDE_DEFAULT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a catalog row without display, with a wrong scope, or with an unresolved module fails", async () => {
  const root = await repoWithPlugins(["alpha", "beta", "gamma"]);
  try {
    const failures = await checkPluginCatalog({
      repoRoot: root,
      catalog: [
        row("alpha", { manifest: { pluginId: "actspace.alpha" } }),
        row("beta", { loaders: ["host"] }),
        row("gamma", { codec: "@actspace/gamma/codec" }),
      ],
      outsideDefault: [],
      resolveSpecifier: specifier => { if (specifier.endsWith("/codec")) throw new Error("not exported"); },
    });
    assert.ok(failures.some(item => /alpha: manifest has no display/.test(item)), failures.join("\n"));
    assert.ok(failures.some(item => /beta: display\.scope is "session" but loaders \["host"\] imply "global"/.test(item)), failures.join("\n"));
    assert.ok(failures.some(item => /gamma: codec @actspace\/gamma\/codec does not resolve/.test(item)), failures.join("\n"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("desktop bundle manifests and CLI loader entries must be catalogued", async () => {
  const root = await repoWithPlugins([]);
  try {
    const failures = await checkPluginCatalog({
      repoRoot: root, catalog: [row("alpha")], outsideDefault: [{ package: "@actspace/loop", reason: "CLI only" }], resolveSpecifier: resolveAll,
      desktopBundleManifests: [{ pluginId: "actspace.alpha" }, { pluginId: "actspace.stray" }],
      cliEntries: [{ id: "alpha", name: "@actspace/alpha/plugin" }, { id: "loop", name: "@actspace/loop/plugin" }, { id: "stray", name: "@actspace/stray/plugin" }],
    });
    assert.equal(failures.length, 2, failures.join("\n"));
    assert.match(failures[0], /DESKTOP_APP_BUNDLE: manifest actspace\.stray/);
    assert.match(failures[1], /apps\/cli\/cordis\.yml: stray/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("parseLoaderEntries reads id and name from a cordis.yml", () => {
  assert.deepEqual(parseLoaderEntries('# header\n- id: a\n  name: "@actspace/a/plugin"\n  inject: [x]\n- id: b\n  name: "@actspace/b/plugin"\n'), [
    { id: "a", name: "@actspace/a/plugin" }, { id: "b", name: "@actspace/b/plugin" },
  ]);
});

test("the real repository catalog is consistent (needs the runtime build)", () => {
  const output = execFileSync(process.execPath, ["scripts/check-plugin-catalog.mjs"], { encoding: "utf8" });
  assert.match(output, /plugin catalog check passed/);
});
