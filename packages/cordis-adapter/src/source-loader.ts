import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CodecModuleLoader, EventCodec } from "./codec-discovery.js";
import type { BehaviorModule } from "./behavior-loader.js";
import { validatePluginManifest, type PluginManifest, type PluginSource } from "./manifest.js";

export type ExplicitPluginConfig = { readonly schemaVersion: 1; readonly plugins: readonly PluginSource[] };
export type LoadedPluginSet = { readonly manifests: readonly PluginManifest[]; readonly codecLoader: CodecModuleLoader; readonly behaviorLoader: (specifier: string, manifest: PluginManifest) => Promise<BehaviorModule> };
type LoadedRoot = { readonly manifest: PluginManifest; readonly root: string };

export async function loadConfiguredPlugins(configPath: string): Promise<LoadedPluginSet> {
  let raw: string; try { raw = await readFile(configPath, "utf8"); } catch (error) { if (isNotFound(error)) return emptyPluginSet(); throw error; }
  const parsed = JSON.parse(raw) as ExplicitPluginConfig; if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.plugins)) throw new Error(`Invalid plugin config ${configPath}.`);
  const roots: LoadedRoot[] = []; for (const source of parsed.plugins) roots.push(await loadSource(source));
  const byPlugin = new Map(roots.map((item) => [item.manifest.pluginId, item])); if (byPlugin.size !== roots.length) throw new Error("Configured plugins contain duplicate plugin ids.");
  const loadModule = async (specifier: string, manifest: PluginManifest) => { const item = byPlugin.get(manifest.pluginId); if (item === undefined) throw new Error(`Plugin ${manifest.pluginId} was not explicitly configured.`); return import(await resolveModule(item.root, specifier)); };
  return Object.freeze({ manifests: Object.freeze(roots.map((item) => item.manifest)), codecLoader: async (specifier: string, manifest: PluginManifest): Promise<{ readonly codecs: readonly EventCodec[] }> => await loadModule(specifier, manifest) as { readonly codecs: readonly EventCodec[] }, behaviorLoader: async (specifier: string, manifest: PluginManifest): Promise<BehaviorModule> => await loadModule(specifier, manifest) as BehaviorModule });
}

export function emptyPluginSet(): LoadedPluginSet { return Object.freeze({ manifests: Object.freeze([]), codecLoader: async (specifier) => { throw new Error(`Codec module ${specifier} is not configured.`); }, behaviorLoader: async (specifier) => { throw new Error(`Behavior module ${specifier} is not configured.`); } }); }

async function loadSource(source: PluginSource): Promise<LoadedRoot> {
  validateSource(source); const root = source.kind === "local-path" ? await realpath(source.reference) : await managedRoot(source.reference); const raw = await readFile(join(root, "actspace.plugin.json"), "utf8"); const manifest = validatePluginManifest(JSON.parse(raw) as PluginManifest);
  if (manifest.source.kind !== source.kind || manifest.source.reference !== source.reference || manifest.source.integrity !== source.integrity) throw new Error(`Plugin ${manifest.pluginId} manifest source does not match its explicit admission record.`);
  if (source.kind === "local-path" && source.integrity !== await computeLocalPluginIntegrity(root, manifest)) throw new Error(`Local plugin ${manifest.pluginId} integrity mismatch.`);
  if (source.kind === "managed-package") { const { version } = parseManagedReference(source.reference); const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version?: string }; if (packageJson.version !== version || manifest.version !== version) throw new Error(`Managed plugin ${manifest.pluginId} version does not match ${source.reference}.`); }
  return Object.freeze({ manifest, root });
}
function validateSource(source: PluginSource): void { if (source.kind === "builtin") throw new Error("Built-in plugins cannot be added through the external plugin config."); if (/^https?:/i.test(source.reference)) throw new Error("URL plugins are not supported."); if (source.kind === "local-path") { if (!isAbsolute(source.reference)) throw new Error("Local plugin paths must be absolute and explicit."); if (!source.integrity?.startsWith("sha256-")) throw new Error("Local plugins require a sha256 content identity."); } else { parseManagedReference(source.reference); if (!source.integrity?.startsWith("sha512-")) throw new Error("Managed plugins require lockfile sha512 integrity."); } }
async function managedRoot(reference: string): Promise<string> { const { packageName } = parseManagedReference(reference); const entry = createRequire(import.meta.url).resolve(packageName); let current = dirname(entry); for (;;) { try { await readFile(join(current, "package.json")); return realpath(current); } catch { const parent = dirname(current); if (parent === current) throw new Error(`Package root for ${packageName} was not found.`); current = parent; } } }
function parseManagedReference(reference: string): { packageName: string; version: string } { const separator = reference.lastIndexOf("@"); const packageName = reference.slice(0, separator); const version = reference.slice(separator + 1); if (separator <= 0 || !packageName || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Managed plugin reference must pin an exact version: ${reference}.`); return { packageName, version }; }
async function resolveModule(root: string, specifier: string): Promise<string> { if (!specifier.startsWith("./") || specifier.includes("\0")) throw new Error(`Plugin module must be a relative public file: ${specifier}.`); const candidate = await realpath(resolve(root, specifier)); if (relative(root, candidate).startsWith("..")) throw new Error(`Plugin module escapes its admitted root: ${specifier}.`); return pathToFileURL(candidate).href; }
export async function computeLocalPluginIntegrity(root: string, manifest: PluginManifest): Promise<string> { const admittedRoot = await realpath(root); const normalized = { ...manifest, source: { ...manifest.source, integrity: undefined } }; const hash = createHash("sha256").update(canonicalJson(normalized)); const modules = [...new Set([...manifest.codecs.map((descriptor) => descriptor.module), ...manifest.behaviors.map((descriptor) => descriptor.module)])].sort(); for (const specifier of modules) { const moduleUrl = await resolveModule(admittedRoot, specifier); hash.update("\0").update(specifier).update("\0").update(await readFile(new URL(moduleUrl))); } return `sha256-${hash.digest("hex")}`; }
function canonicalJson(value: unknown): string { if (value === undefined) return "null"; if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`; }
function isNotFound(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT"); }
