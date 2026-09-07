import { createHash } from "node:crypto";
import type { RuntimeV2BootManifest, RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import { discoverPluginCodecs, type CodecModuleLoader, type CordisAdmissionReport, type CordisRootHandle, type EventCodec } from "@actspace/cordis-adapter";
import { createBootConfigDump, type ResolvedComposition } from "@actspace/composition";
import { BootDiagnostics } from "@actspace/diagnostics";
import { validateStartup, type EntryActivationFact } from "./startup-validation.js";
import type { TrustedBootCandidate } from "./types.js";

export async function createTrustedBootCandidate(options: { readonly host: RuntimeV2HostDescriptor; readonly composition: ResolvedComposition; readonly cordisAdmission: CordisAdmissionReport; readonly createCordisRoot: () => Promise<CordisRootHandle>; readonly codecLoader?: CodecModuleLoader; readonly discoveredCodecs?: readonly EventCodec[]; readonly activations?: readonly EntryActivationFact[]; readonly activate?: (root: CordisRootHandle) => Promise<readonly EntryActivationFact[]>; readonly requiredProviders: readonly string[] }): Promise<TrustedBootCandidate> {
  const diagnostics = new BootDiagnostics(); if (options.cordisAdmission.status !== "passed") throw new Error(`Cordis admission failed: ${options.cordisAdmission.failures.join("; ")}`);
  const codecs = options.discoveredCodecs ?? await discoverPluginCodecs(options.composition.manifests, options.codecLoader ?? missingCodecLoader); const root = await options.createCordisRoot(); let published = false;
  try { const activations = options.activate ? await options.activate(root) : options.activations ?? []; const settlement = await root.awaitSettlement(); if (!settlement.settled) throw new Error(`Cordis settlement pending: ${settlement.pendingServices.join(", ")}`); const validation = validateStartup(options.composition.entries, activations, options.requiredProviders); if (!validation.ok) throw new Error(validation.failures.map((failure) => `${failure.code}:${failure.entryId}`).join("; ")); for (const warning of options.composition.warnings) diagnostics.record({ severity: "warning", code: "COMPOSITION_WARNING", message: warning }); const manifest = toManifest(options.host, options.composition); const dump = createBootConfigDump(options.composition); diagnostics.record({ severity: "info", code: "BOOT_READY", message: "Trusted Boot candidate is ready.", details: { digest: manifest.manifestDigest, configDumpDigest: createHash("sha256").update(dump).digest("hex") } }); published = true; let disposed = false; return Object.freeze({ manifest, composition: options.composition, diagnostics: diagnostics.snapshot(), codecCount: codecs.length, disposeCandidate: async () => { if (disposed) return; await root.dispose(); disposed = true; } }); }
  finally { if (!published) await root.dispose(); }
}

/**
 * Publish a candidate around an already-settled DSH Include tree. This is the
 * new trusted path: Loader/Include owns plugin activation, so Boot must not
 * mount a second composition tree or call the retired `activate()` protocol.
 * The existing composition remains the metadata source until every runtime
 * service has moved into a Cordis Behavior.
 */
export async function createDshBootCandidate(options: { readonly host: RuntimeV2HostDescriptor; readonly composition: ResolvedComposition; readonly cordisAdmission: CordisAdmissionReport; readonly root: CordisRootHandle; readonly discoveredCodecs?: readonly EventCodec[] }): Promise<TrustedBootCandidate> {
  const diagnostics = new BootDiagnostics();
  if (options.cordisAdmission.status !== "passed") throw new Error(`Cordis admission failed: ${options.cordisAdmission.failures.join("; ")}`);
  const settlement = await options.root.awaitSettlement();
  if (!settlement.settled) throw new Error(`Cordis settlement pending: ${settlement.pendingServices.join(", ")}`);
  for (const warning of options.composition.warnings) diagnostics.record({ severity: "warning", code: "COMPOSITION_WARNING", message: warning });
  const manifest = toManifest(options.host, options.composition);
  const dump = createBootConfigDump(options.composition);
  diagnostics.record({ severity: "info", code: "BOOT_READY", message: "DSH Cordis Boot candidate is ready.", details: { digest: manifest.manifestDigest, configDumpDigest: createHash("sha256").update(dump).digest("hex") } });
  let disposed = false;
  return Object.freeze({ manifest, composition: options.composition, diagnostics: diagnostics.snapshot(), codecCount: options.discoveredCodecs?.length ?? 0, disposeCandidate: async () => { if (disposed) return; disposed = true; await options.root.dispose(); } });
}
async function missingCodecLoader(specifier: string): Promise<never> { throw new Error(`No trusted codec loader is configured for ${specifier}.`); }
function toManifest(host: RuntimeV2HostDescriptor, composition: ResolvedComposition): RuntimeV2BootManifest { return Object.freeze({ schemaVersion: 1, runtimeContract: "actspace.runtime.v2", profileId: composition.profileId, hostKind: host.hostKind, manifestDigest: composition.digest, configRevision: createHash("sha256").update(JSON.stringify(composition.config)).digest("hex"), capabilities: composition.hostCapabilities as RuntimeV2BootManifest["capabilities"], entries: Object.freeze(composition.entries.map((entry) => Object.freeze({ entryId: entry.entryId, pluginId: entry.pluginId, version: entry.pluginVersion, required: entry.required, state: entry.state === "active" || entry.state === "candidate" ? "active" as const : entry.state === "failed" ? "failed" as const : "skipped" as const, capabilities: entry.requiredCapabilities as RuntimeV2BootManifest["entries"][number]["capabilities"] }))), config: composition.config as RuntimeV2BootManifest["config"] }); }
