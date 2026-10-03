import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { validatePluginManifest, type PluginManifest } from "./manifest.js";

export interface SharedArtifactModule {
  readonly specifier: string;
  /** Host-owned, fixed module entry; its transitive lifetime belongs to the Host. */
  readonly url: string;
  readonly integrity: string;
}
export interface PluginArtifactManifest {
  readonly schemaVersion: 1;
  readonly plugin: PluginManifest;
  readonly files: readonly { readonly path: string; readonly integrity: string }[];
  readonly sharedModules: readonly SharedArtifactModule[];
}
export interface PluginArtifact {
  readonly artifactId: string;
  readonly root: string;
  readonly manifest: PluginArtifactManifest;
}
export interface PublishPluginArtifact {
  readonly sourceRoot: string;
  readonly artifactRoot: string;
  readonly plugin: PluginManifest;
  readonly files: readonly string[];
  readonly sharedModules?: readonly SharedArtifactModule[];
}
const manifestFile = "artifact.json";
export function artifactHash(bytes: string | Uint8Array): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
function identity(manifest: PluginArtifactManifest): string {
  // Source location is diagnostic provenance, not executable content.
  return artifactHash(canonical({ ...manifest, plugin: { ...manifest.plugin, source: { kind: manifest.plugin.source.kind } } }));
}
function validPath(path: string): void {
  if (!path || path.includes("\\") || path.includes("\0") || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === "..") || path === manifestFile) {
    throw new Error(`Invalid artifact path: ${path}`);
  }
}
async function regularFile(root: string, path: string): Promise<Buffer> {
  validPath(path);
  let current = root;
  if (!(await lstat(current)).isDirectory() || (await lstat(current)).isSymbolicLink()) throw new Error(`Invalid artifact root: ${root}`);
  for (const part of path.split("/")) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Artifact symlink is forbidden: ${path}`);
  }
  if (!(await lstat(current)).isFile()) throw new Error(`Artifact requires a regular file: ${path}`);
  return readFile(current);
}
async function verifyShared(modules: readonly SharedArtifactModule[]): Promise<void> {
  const seen = new Set<string>();
  for (const module of modules) {
    if (seen.has(module.specifier) || module.specifier.startsWith(".") || isBuiltin(module.specifier)) throw new Error(`Invalid shared module: ${module.specifier}`);
    seen.add(module.specifier);
    if (!module.url.startsWith("file:") || artifactHash(await readFile(fileURLToPath(module.url))) !== module.integrity) throw new Error(`Shared module integrity mismatch: ${module.specifier}`);
  }
}

/** Validate enumerated ESM imports and rewrite only approved Host module references. */
function fixedModule(path: string, source: string, files: ReadonlySet<string>, shared: readonly SharedArtifactModule[]): string {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits: { start: number; end: number; value: string }[] = [];
  const resolve = (literal: ts.StringLiteralLike) => {
    const name = literal.text;
    if (name.startsWith("node:") && isBuiltin(name)) return;
    if (name.startsWith("./") || name.startsWith("../")) {
      const target = posix.normalize(posix.join(posix.dirname(path), name));
      if (!files.has(target) || !/\.(mjs|js)$/.test(target)) throw new Error(`Unfixed import ${name} in ${path}`);
      return;
    }
    const approved = shared.find(item => item.specifier === name || item.url === name);
    if (!approved) throw new Error(`Unapproved external import ${name} in ${path}`);
    edits.push({ start: literal.getStart(ast), end: literal.end, value: JSON.stringify(approved.url) });
  };
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) throw new Error(`Unsupported module specifier in ${path}`);
      resolve(node.moduleSpecifier);
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (node.arguments.length !== 1 || !arg || !ts.isStringLiteralLike(arg)) throw new Error(`Non-literal dynamic import in ${path}`);
        resolve(arg);
      }
      if (ts.isIdentifier(node.expression) && ["require", "eval"].includes(node.expression.text)) throw new Error(`Unsupported dynamic code in ${path}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
  return source;
}

/** Publish enumerated, already-built files. Source files are never imported or overwritten. */
export async function publishPluginArtifact(input: PublishPluginArtifact): Promise<PluginArtifact> {
  const plugin = structuredClone(validatePluginManifest(input.plugin));
  const paths = [...input.files].sort();
  if (new Set(paths).size !== paths.length) throw new Error("Duplicate artifact files");
  for (const path of paths) validPath(path);
  const sharedModules = structuredClone([...input.sharedModules ?? []]).sort((a, b) => a.specifier.localeCompare(b.specifier));
  await verifyShared(sharedModules);
  const files = new Map<string, Buffer>();
  for (const path of paths) files.set(path, await regularFile(input.sourceRoot, path));
  for (const entry of [...plugin.behaviors, ...plugin.codecs]) {
    if (!entry.module.startsWith("./") || !/\.(mjs|js)$/.test(entry.module) || !files.has(entry.module.slice(2))) throw new Error(`Missing or unsupported ESM artifact entry: ${entry.module}`);
  }
  for (const [path, bytes] of files) {
    if (/\.(mjs|js)$/.test(path)) files.set(path, Buffer.from(fixedModule(path, bytes.toString("utf8"), new Set(paths), sharedModules)));
    else if (path.endsWith(".node")) throw new Error(`Native artifact dependency unsupported: ${path}`);
  }
  // Explicit module type prevents a relocated .js file from inheriting ambient package semantics.
  if (files.has("package.json")) {
    const pkg = JSON.parse(files.get("package.json")!.toString("utf8"));
    if (pkg.type !== "module" || pkg.imports || pkg.exports || pkg.dependencies) throw new Error("Artifact package.json must describe self-contained ESM files");
  } else files.set("package.json", Buffer.from('{"type":"module"}\n'));
  const manifest: PluginArtifactManifest = { schemaVersion: 1, plugin, files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({ path, integrity: artifactHash(bytes) })), sharedModules };
  const artifactId = identity(manifest);
  await mkdir(input.artifactRoot, { recursive: true });
  const staging = await mkdtemp(join(input.artifactRoot, ".prepare-"));
  const root = join(input.artifactRoot, artifactId);
  try {
    for (const [path, bytes] of files) { await mkdir(dirname(join(staging, path)), { recursive: true }); await writeFile(join(staging, path), bytes, { flag: "wx" }); }
    await writeFile(join(staging, manifestFile), canonical(manifest), { flag: "wx" });
    try {
      await lstat(root);
      return await verifyPluginArtifact({ artifactId, root, manifest });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await rename(staging, root); }
    catch (error) { if (!["EEXIST", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
    return await verifyPluginArtifact({ artifactId, root, manifest });
  } finally { await rm(staging, { recursive: true, force: true }); }
}

/** Verify disk bytes on every admission, including reuse of a previously published artifact. */
export async function verifyPluginArtifact(reference: PluginArtifact): Promise<PluginArtifact> {
  const disk = JSON.parse(await readFile(join(reference.root, manifestFile), "utf8")) as PluginArtifactManifest;
  if (disk.schemaVersion !== 1 || identity(disk) !== reference.artifactId || identity(reference.manifest) !== reference.artifactId) throw new Error("Artifact manifest integrity mismatch");
  validatePluginManifest(disk.plugin);
  await verifyShared(disk.sharedModules);
  const expected = new Set(disk.files.map(file => file.path));
  if (expected.size !== disk.files.length) throw new Error("Duplicate artifact files");
  const walk = async (directory: string, prefix = ""): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Artifact symlink is forbidden: ${path}`);
      if (entry.isDirectory()) await walk(join(directory, entry.name), path + "/");
      else if (path !== manifestFile && !expected.has(path)) throw new Error(`Unexpected artifact file: ${path}`);
    }
  };
  await walk(reference.root);
  for (const file of disk.files) {
    const bytes = await regularFile(reference.root, file.path);
    if (artifactHash(bytes) !== file.integrity) throw new Error(`Artifact integrity mismatch: ${file.path}`);
    if (/\.(mjs|js)$/.test(file.path)) fixedModule(file.path, bytes.toString("utf8"), expected, disk.sharedModules);
  }
  return Object.freeze({ artifactId: reference.artifactId, root: reference.root, manifest: disk });
}

/** Import only a public entry within an already verified artifact. */
export async function importArtifactModule(artifact: PluginArtifact, specifier: string): Promise<unknown> {
  if (!specifier.startsWith("./") || !/\.(mjs|js)$/.test(specifier) || !artifact.manifest.files.some(file => file.path === specifier.slice(2))) throw new Error(`Unlisted or unsupported artifact module: ${specifier}`);
  validPath(specifier.slice(2));
  return import(pathToFileURL(join(artifact.root, specifier.slice(2))).href);
}
