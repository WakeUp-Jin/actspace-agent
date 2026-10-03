import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { defineBuiltinPluginManifest, importArtifactModule, publishPluginArtifact, verifyPluginArtifact } from "../src/index.js";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "actspace-artifact-")); roots.push(root);
  const sourceRoot = join(root, "source"); await mkdir(sourceRoot);
  const plugin = defineBuiltinPluginManifest({ pluginId: "fixture.artifact", version: "1", name: "fixture", entry: { entryId: "fixture", behavior: "./main.mjs" }, host: { required: [], optional: [] }, frontend: null, contributions: { services: [], tools: [], prompts: [], events: [] } });
  await writeFile(join(sourceRoot, "main.mjs"), 'import { readFile } from "node:fs/promises"; import { value } from "./dep.mjs"; export async function read() { return value + (await import("./dep.mjs")).value + await readFile(new URL("./prompt.txt", import.meta.url), "utf8"); }');
  await writeFile(join(sourceRoot, "dep.mjs"), 'export const value = "old";');
  await writeFile(join(sourceRoot, "prompt.txt"), "resource");
  return { sourceRoot, artifactRoot: join(root, "artifacts"), plugin, files: ["main.mjs", "dep.mjs", "prompt.txt"] };
}
it("fixes static/dynamic dependencies and resources while retaining distinct module paths", async () => {
  const input = await fixture(); const old = await publishPluginArtifact(input);
  await writeFile(join(input.sourceRoot, "dep.mjs"), 'export const value = "new";');
  await writeFile(join(input.sourceRoot, "main.mjs"), 'import { value } from "./dep.mjs"; export const read = () => "new-entry:" + value;');
  await writeFile(join(input.sourceRoot, "prompt.txt"), "changed");
  const next = await publishPluginArtifact(input);
  const a = await importArtifactModule(old, "./main.mjs") as { read(): Promise<string> };
  const b = await importArtifactModule(next, "./main.mjs") as typeof a;
  expect(await a.read()).toBe("oldoldresource"); expect(await b.read()).toBe("new-entry:new");
  expect(old.root).not.toBe(next.root);
});
it("reuses concurrent identical publications and rejects corrupted reuse", async () => {
  const input = await fixture(); const [a, b] = await Promise.all([publishPluginArtifact(input), publishPluginArtifact(input)]);
  expect(a.artifactId).toBe(b.artifactId);
  await writeFile(join(a.root, "dep.mjs"), 'export const value = "tampered";');
  await expect(verifyPluginArtifact(a)).rejects.toThrow("integrity");
  await expect(publishPluginArtifact(input)).rejects.toThrow("integrity");
});
it("rejects incomplete imports, unapproved externals and nonliteral dynamic imports", async () => {
  const input = await fixture();
  for (const source of ['import "./missing.mjs";', 'import "not-approved";', 'const x = "./dep.mjs"; import(x);']) {
    await writeFile(join(input.sourceRoot, "main.mjs"), source);
    await expect(publishPluginArtifact(input)).rejects.toThrow();
  }
});
it("rejects traversal, symlinks, missing files and unexpected published files", async () => {
  const input = await fixture();
  await expect(publishPluginArtifact({ ...input, files: ["../escape"] })).rejects.toThrow("path");
  await expect(publishPluginArtifact({ ...input, files: [...input.files, "missing"] })).rejects.toThrow();
  await symlink(join(input.sourceRoot, "dep.mjs"), join(input.sourceRoot, "link.mjs"));
  await expect(publishPluginArtifact({ ...input, files: [...input.files, "link.mjs"] })).rejects.toThrow("symlink");
  const artifact = await publishPluginArtifact(input);
  await writeFile(join(artifact.root, "extra.mjs"), "");
  await expect(verifyPluginArtifact(artifact)).rejects.toThrow("Unexpected");
  expect(await readFile(join(input.sourceRoot, "prompt.txt"), "utf8")).toBe("resource");
});
it("does not encode editable source locations in content identity", async () => {
  const input = await fixture();
  const a = await publishPluginArtifact({ ...input, plugin: { ...input.plugin, source: { kind: "local-path", reference: "/source/a" } } });
  const b = await publishPluginArtifact({ ...input, plugin: { ...input.plugin, source: { kind: "local-path", reference: "/source/b" } } });
  expect(a.artifactId).toBe(b.artifactId);
});
it("pins explicitly shared Host module entries and checks them again at admission", async () => {
  const input = await fixture();
  const { artifactHash } = await import("../src/index.js");
  const { pathToFileURL } = await import("node:url");
  const sharedPath = join(input.sourceRoot, "host.mjs");
  const source = 'export const host = "fixed-host";'; await writeFile(sharedPath, source);
  await writeFile(join(input.sourceRoot, "main.mjs"), 'import { host } from "host-contract"; export const read = () => host;');
  const artifact = await publishPluginArtifact({ ...input, sharedModules: [{ specifier: "host-contract", url: pathToFileURL(sharedPath).href, integrity: artifactHash(source) }] });
  const module = await importArtifactModule(artifact, "./main.mjs") as { read(): string };
  expect(module.read()).toBe("fixed-host");
  await writeFile(sharedPath, 'export const host = "changed";');
  await expect(verifyPluginArtifact(artifact)).rejects.toThrow("Shared module integrity");
});
