import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { CORDIS_PACKAGES, type CordisAdmissionReport, type CordisPackageFingerprint, type CordisPackageName } from "./cordis-types.js";

export async function inspectCordisAdmission(): Promise<CordisAdmissionReport> {
  const fingerprints = await Promise.all(Object.entries(CORDIS_PACKAGES).map(([name, version]) => fingerprint(name as CordisPackageName, version)));
  const forbiddenPackages = ["cordis", "@cordisjs/plugin-hmr", "@deepseek-ai/cordis-plugin-hmr"];
  const failures = fingerprints.flatMap((item) => item.actualVersion !== item.expectedVersion ? [`${item.name}: expected ${item.expectedVersion}, found ${item.actualVersion ?? "missing"}`] : item.esm && item.exportsPublic && item.typesPublic ? [] : [`${item.name}: public ESM/types export unavailable`]);
  const loaded = fingerprints.filter((item) => item.actualVersion !== null); const singleFamily = new Set(loaded.map((item) => `${item.name}@${item.actualVersion}`)).size === loaded.length;
  const familyRoots = new Set(loaded.map((item) => item.familyRoot).filter((value): value is string => value !== null));
  if (familyRoots.size > 1) failures.push(`Cordis packages resolve from multiple family roots: ${[...familyRoots].join(", ")}`);
  const forbiddenLoaded = await findForbiddenPackages();
  if (forbiddenLoaded.length > 0) failures.push(`Forbidden Cordis packages are installed: ${forbiddenLoaded.join(", ")}`);
  return Object.freeze({ status: failures.length === 0 ? "passed" : "failed", packages: Object.freeze(fingerprints), hmrAbsent: forbiddenLoaded.every((name) => !name.includes("hmr")), singleFamily: singleFamily && familyRoots.size <= 1, forbiddenPackages: Object.freeze(forbiddenLoaded), failures: Object.freeze(failures) });
}

async function fingerprint(name: CordisPackageName, expectedVersion: string): Promise<CordisPackageFingerprint> {
  try {
    const entry = createRequire(import.meta.url).resolve(name); const packagePath = await findPackageJson(dirname(entry)); const manifest = JSON.parse(await readFile(packagePath, "utf8")) as { version?: string; type?: string; exports?: unknown; types?: unknown; typings?: unknown; peerDependencies?: Record<string, string> };
    return Object.freeze({ name, expectedVersion, actualVersion: manifest.version ?? null, entry, packageJson: packagePath, esm: manifest.type === "module", exportsPublic: manifest.exports !== undefined, typesPublic: manifest.types !== undefined || manifest.typings !== undefined, peerDependencies: Object.freeze(Object.keys(manifest.peerDependencies ?? {}).sort()), familyRoot: familyRootFor(packagePath) });
  } catch { return Object.freeze({ name, expectedVersion, actualVersion: null, entry: null, packageJson: null, esm: false, exportsPublic: false, typesPublic: false, peerDependencies: Object.freeze([]), familyRoot: null }); }
}
async function findForbiddenPackages(): Promise<readonly string[]> {
  const names = ["cordis", "@cordisjs/plugin-hmr", "@deepseek-ai/cordis-plugin-hmr"];
  return Object.freeze((await Promise.all(names.map(async (name) => { try { createRequire(import.meta.url).resolve(name); return name; } catch { return null; } }))).filter((name): name is string => name !== null));
}
function familyRootFor(packagePath: string): string {
  const vendor = packagePath.indexOf("/vendor/");
  if (vendor >= 0) return packagePath.slice(0, vendor + "/vendor".length);
  const pnpm = packagePath.indexOf("/.pnpm/");
  if (pnpm >= 0) return packagePath.slice(0, pnpm + "/.pnpm".length);
  return dirname(packagePath);
}
async function findPackageJson(start: string): Promise<string> { let current = start; for (;;) { const candidate = join(current, "package.json"); try { await readFile(candidate); return candidate; } catch { const parent = dirname(current); if (parent === current) throw new Error("package.json not found"); current = parent; } } }
