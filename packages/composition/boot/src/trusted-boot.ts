import { createHash } from "node:crypto";
import type { RuntimeV2BootManifest, RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import { type CordisAdmissionReport, type CordisRootHandle, type EventCodec } from "@actspace/cordis-adapter";
import { createBootConfigDump, type ResolvedComposition } from "@actspace/composition";
import { BootDiagnostics } from "@actspace/diagnostics";
import type { TrustedBootCandidate } from "./types.js";

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
  let disposing: Promise<void> | undefined;
  return Object.freeze({ manifest, composition: options.composition, diagnostics: diagnostics.snapshot(), codecCount: options.discoveredCodecs?.length ?? 0, disposeCandidate: () => { if (disposed) return Promise.resolve(); return disposing ??= Promise.resolve().then(() => options.root.dispose()).then(() => { disposed = true; }).finally(() => { disposing = undefined; }); } });
}
function toManifest(host: RuntimeV2HostDescriptor, composition: ResolvedComposition): RuntimeV2BootManifest { return Object.freeze({ schemaVersion: 1, runtimeContract: "actspace.runtime.v2", profileId: composition.profileId, hostKind: host.hostKind, manifestDigest: composition.digest, configRevision: createHash("sha256").update(JSON.stringify(composition.config)).digest("hex"), capabilities: composition.hostCapabilities as RuntimeV2BootManifest["capabilities"], entries: Object.freeze(composition.entries.map((entry) => Object.freeze({ entryId: entry.entryId, pluginId: entry.pluginId, version: entry.pluginVersion, required: entry.required, state: entry.state === "active" || entry.state === "candidate" ? "active" as const : entry.state === "failed" ? "failed" as const : "skipped" as const, capabilities: entry.requiredCapabilities as RuntimeV2BootManifest["entries"][number]["capabilities"] }))), config: composition.config as RuntimeV2BootManifest["config"] }); }
