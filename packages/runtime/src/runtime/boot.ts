import { createHash } from "node:crypto";
import type { RuntimeV2HostDescriptor, RuntimeV2BootManifest, RuntimeV2RuntimeState, RuntimeV2DiagnosticsSnapshot, RuntimeV2ShutdownResult } from "@actspace/shared/runtime-v2";
import type { AgentLoopLiveEvent } from "@actspace/core-agent-loop";
import { CompactionPlugin } from "@actspace/compaction";
import { emptyRuntimePromptSource, type RuntimePromptSource } from "@actspace/prompt";
import { DiagnosticsCollector } from "../projection/diagnostics.js";
import type { RendererAllowlist } from "../projection/tool-dto.js";
import type { DiagnosticInput } from "../projection/diagnostics.js";
import { SESSION_CODEC_HOST_PORT_ID } from "@actspace/session-journal";
import type { EventCodec } from "@actspace/session-journal";
import type { ToolPreparedEnvironment } from "@actspace/tools-runtime";
import { LlmService } from "@actspace/llm-service";
import type { ResolvedComposition } from "@actspace/composition";
import { discoverPluginCodecs, type CodecModuleLoader, type CordisContext } from "@actspace/cordis-adapter";
import { inspectCordisAdmission } from "@actspace/cordis-adapter";
import type { CordisAdmissionReport, CordisRootHandle } from "@actspace/cordis-adapter";
import { bootDshCordis, createDshBootCandidate } from "@actspace/boot";
import { RuntimeProfileConflictError } from "./errors.js";
import { RuntimeShutdownFailure } from "./errors.js";
import { createRuntimeHostServices, RUNTIME_CONTEXT_SERVICE_IDS, RUNTIME_HOST_SERVICES_ID, type RuntimeHostServices } from "./host-services.js";
import { RuntimeSessionController } from "./session-controller.js";
import { SESSION_RUNTIME_HOST_PORT_ID, type RuntimeSessionHostPort } from "./session-plugin.js";
import { AGENT_RUNTIME_HOST_PORT_ID, type AgentRuntimeHostPort } from "./agent-host-port.js";
import type { AgentRuntimeService } from "./agent-runtime-plugin.js";
import { HEADLESS_HOST_PORT_ID } from "@actspace/headless";
import { RuntimeStateController } from "./runtime-state.js";
import { settleWithinDeadline } from "./shutdown.js";

let runtimeClaimed = false;

export type BootRuntimeOptions = {
  readonly host: RuntimeV2HostDescriptor;
  readonly dataRoot: string;
  readonly toolEnvironment: Omit<ToolPreparedEnvironment, "journal">;
  readonly promptSource?: RuntimePromptSource | ((workspaceRoot: string) => Promise<RuntimePromptSource>);
  readonly composition?: ResolvedComposition;
  readonly pluginCodecLoader?: CodecModuleLoader;
  readonly disposePlugins?: () => Promise<void>;
  readonly disposeCordis?: () => Promise<void>;
  readonly gracefulShutdownMs?: number;
  readonly finalShutdownMs?: number;
  readonly onLiveEvent?: (event: AgentLoopLiveEvent) => void;
  readonly cordis?: { readonly admission: CordisAdmissionReport; readonly createRoot?: () => Promise<CordisRootHandle>; readonly configPath?: string };
  readonly rendererAllowlist?: RendererAllowlist;
  /** Host-owned facts normalized before the Cordis config tree is mounted. */
  readonly hostServices?: RuntimeHostServices;
};

export type BootedRuntimeProfile = {
  readonly context: CordisContext;
  readonly root: CordisRootHandle;
  readonly manifest: RuntimeV2BootManifest;
  readonly getState: () => RuntimeV2RuntimeState;
  readonly getDiagnostics: () => RuntimeV2DiagnosticsSnapshot;
  readonly recordDiagnostic: (input: DiagnosticInput) => void;
  readonly requestRestart: (reason: string, source: string, candidateDigest?: string) => void;
  readonly shutdown: () => Promise<RuntimeV2ShutdownResult>;
};

export async function bootRuntime(options: BootRuntimeOptions): Promise<BootedRuntimeProfile> {
  if (runtimeClaimed) throw new RuntimeProfileConflictError();
  runtimeClaimed = true;
  try {
    return await bootClaimedRuntime(options);
  } catch (error) {
    runtimeClaimed = false;
    throw error;
  }
}

async function bootClaimedRuntime(options: BootRuntimeOptions): Promise<BootedRuntimeProfile> {
  if (options.cordis?.configPath !== undefined) return bootDshClaimedRuntime(options);
  throw new Error("Runtime boot requires an explicit Cordis configPath.");
}

/**
 * Final DSH-native boot path. Bootstrap only prepares Host ports and mounts
 * the checked-in tree; Agent, Loop, Subagent and RunController are Context
 * services published by Behaviors.
 */
async function bootDshClaimedRuntime(options: BootRuntimeOptions): Promise<BootedRuntimeProfile> {
  const state = new RuntimeStateController();
  const composition = options.composition;
  if (composition === undefined) throw new Error("Runtime boot requires an explicit Profile composition.");
  const hostServices = options.hostServices ?? createRuntimeHostServices({ descriptor: options.host, dataRoot: options.dataRoot, workspaceRoot: options.toolEnvironment.workspaceRoot, toolEnvironment: options.toolEnvironment });
  const cordisAdmission = options.cordis?.admission ?? await inspectCordisAdmission();
  const pluginCodecs: readonly EventCodec[] = await discoverPluginCodecs(composition.manifests, options.pluginCodecLoader ?? missingCodecLoader);
  const pluginVersions = new Map(composition.entries.filter((entry) => entry.enabled && entry.state !== "skipped").map((entry) => [entry.pluginId, entry.pluginVersion]));
  const configRevision = createHash("sha256").update(JSON.stringify(composition.config)).digest("hex");
  const diagnostics = new DiagnosticsCollector({ runtimeInstanceId: state.runtimeInstanceId });
  const requireService = <T>(value: T | undefined, serviceId: string): T => {
    if (value === undefined) throw new Error(`DSH Cordis config did not publish ${serviceId}.`);
    return value;
  };
  const runtimeHost = Object.freeze({
    dataRoot: options.dataRoot,
    runtimeId: state.runtimeInstanceId,
    profileId: composition.profileId,
    manifestDigest: composition.digest,
    plugins: [...pluginVersions].map(([id, version]) => ({ id, version })),
    rendererAllowlist: options.rendererAllowlist,
  } satisfies RuntimeSessionHostPort);
  const promptPort = hostServices.services["actspace.host.prompt"] ?? Object.freeze({
    workspaceRoot: options.toolEnvironment.workspaceRoot,
    resolveSource: async (workspaceRoot: string) => typeof options.promptSource === "function" ? options.promptSource(workspaceRoot) : options.promptSource ?? emptyRuntimePromptSource(),
  });
  const providedHostServices = Object.freeze({
    ...hostServices.services,
    "actspace.host.prompt": promptPort,
    [RUNTIME_HOST_SERVICES_ID]: hostServices,
    [SESSION_CODEC_HOST_PORT_ID]: pluginCodecs,
    [SESSION_RUNTIME_HOST_PORT_ID]: runtimeHost,
    [HEADLESS_HOST_PORT_ID]: hostServices.services[HEADLESS_HOST_PORT_ID] ?? Object.freeze({ enabled: false }),
    [AGENT_RUNTIME_HOST_PORT_ID]: Object.freeze({
      host: options.host,
      toolEnvironment: options.toolEnvironment,
      workspaceRoot: options.toolEnvironment.workspaceRoot,
      compositionDigest: composition.digest,
      hostCapabilityDigest: configRevision,
      plugins: runtimeHost.plugins,
      ...((hostServices.services["actspace.host.chat-settings"] as { readonly compactionTriggerRatio?: () => number } | undefined)?.compactionTriggerRatio
        ? { chatCompactionTriggerRatio: (hostServices.services["actspace.host.chat-settings"] as { readonly compactionTriggerRatio: () => number }).compactionTriggerRatio }
        : {}),
      onLiveEvent: options.onLiveEvent,
    } satisfies AgentRuntimeHostPort),
  });
  let root: CordisRootHandle | undefined;
  let context: CordisContext | undefined;
  try {
    const boot = await bootDshCordis({
      configPath: options.cordis!.configPath!,
      composition,
      createRoot: options.cordis?.createRoot,
      requiredServices: ["actspace.runtime", "session.journal", "session.runtime", "llm.service", "tools.runtime", "context.assembly", "prompt.runtime", "compaction.runtime", "tools.core", "core.agent", "agent.registry", "agent.loop", "agent.runtime"],
      prepare: (prepared) => {
        prepared.provide?.("actspace.host", Object.freeze({
          hostKind: options.host.hostKind,
          descriptor: hostServices.descriptor,
          services: providedHostServices,
        }));
      },
    });
    root = boot.root;
    context = boot.context;
    const sessions = requireService(context.get?.("session.runtime") as RuntimeSessionController | undefined, "session.runtime");
    const llm = requireService(context.get?.("llm.service") as LlmService | undefined, "llm.service");
    const compaction = requireService(context.get?.("compaction.runtime") as CompactionPlugin | undefined, "compaction.runtime");
    const agentRuntime = requireService(context.get?.("agent.runtime") as AgentRuntimeService | undefined, "agent.runtime");
    const candidate = await createDshBootCandidate({ host: options.host, composition, cordisAdmission, root, discoveredCodecs: pluginCodecs });
    for (const item of candidate.diagnostics) diagnostics.record({ severity: item.severity, source: "boot", code: item.code, message: item.message, ...(item.provenance.pluginId === undefined ? {} : { pluginId: item.provenance.pluginId }), details: isRecord(item.details) ? item.details : { value: item.details } });
    context.provide?.(RUNTIME_CONTEXT_SERVICE_IDS.sessions, sessions);
    context.provide?.(RUNTIME_CONTEXT_SERVICE_IDS.runs, agentRuntime.runs);
    context.provide?.(RUNTIME_CONTEXT_SERVICE_IDS.compaction, compaction);
    context.provide?.(RUNTIME_CONTEXT_SERVICE_IDS.llm, llm);
    state.ready();
    return createBootedProfile({ state, manifest: candidate.manifest, diagnostics, context, root, agentRuntime, candidate, options });
  } catch (error) {
    await root?.dispose().catch(() => undefined);
    await options.disposeCordis?.().catch(() => undefined);
    await options.disposePlugins?.().catch(() => undefined);
    runtimeClaimed = false;
    throw error;
  }
}

async function missingCodecLoader(specifier: string): Promise<never> { throw new Error(`No trusted Codec loader is configured for ${specifier}.`); }
function createBootedProfile(input: {
  readonly state: RuntimeStateController;
  readonly manifest: RuntimeV2BootManifest;
  readonly diagnostics: DiagnosticsCollector;
  readonly context: CordisContext;
  readonly root: CordisRootHandle;
  readonly agentRuntime: AgentRuntimeService;
  readonly candidate: Awaited<ReturnType<typeof createDshBootCandidate>>;
  readonly options: BootRuntimeOptions;
}): BootedRuntimeProfile {
  let shutdownPromise: Promise<RuntimeV2ShutdownResult> | undefined;
  const shutdown = (): Promise<RuntimeV2ShutdownResult> => {
    if (shutdownPromise !== undefined) return shutdownPromise;
    const attempt = shutdownBootedProfile(input);
    shutdownPromise = attempt.catch((error: unknown) => {
      if (shutdownPromise === attempt) shutdownPromise = undefined;
      throw error;
    });
    return shutdownPromise;
  };
  return Object.freeze({
    context: input.context,
    root: input.root,
    manifest: input.manifest,
    getState: () => input.state.view(),
    getDiagnostics: () => input.diagnostics.snapshot(),
    recordDiagnostic: (diagnostic: DiagnosticInput) => input.diagnostics.record(diagnostic),
    requestRestart: (reason: string, source: string, candidateDigest?: string) => input.state.requestRestart(reason, source, candidateDigest),
    shutdown,
  });
}

async function shutdownBootedProfile(input: {
  readonly state: RuntimeStateController;
  readonly diagnostics: DiagnosticsCollector;
  readonly agentRuntime: AgentRuntimeService;
  readonly candidate: Awaited<ReturnType<typeof createDshBootCandidate>>;
  readonly options: BootRuntimeOptions;
}): Promise<RuntimeV2ShutdownResult> {
  input.state.quiesce();
  input.agentRuntime.runs.quiesce();
  const cleanup = (async () => {
    await input.candidate.disposeCandidate();
    await input.options.disposeCordis?.();
    await input.options.disposePlugins?.();
  })();
  const graceful = await settleWithinDeadline(cleanup, input.options.gracefulShutdownMs ?? 30_000);
  let final = graceful;
  if (graceful.kind === "timeout") {
    input.diagnostics.record({ severity: "warning", source: "host", code: "SHUTDOWN_GRACEFUL_TIMEOUT", message: `Graceful shutdown exceeded ${graceful.timeoutMs} ms; cooperative cancellation was repeated.` });
    input.agentRuntime.runs.quiesce();
    final = await settleWithinDeadline(cleanup, input.options.finalShutdownMs ?? 5_000);
  }
  const blockers: string[] = [];
  if (final.kind === "failed") blockers.push(final.error instanceof Error ? final.error.message : String(final.error));
  if (final.kind === "timeout") blockers.push(`Shutdown exceeded ${input.options.gracefulShutdownMs ?? 30_000} ms plus ${final.timeoutMs} ms final cancellation window.`);
  if (blockers.length > 0) {
    input.diagnostics.record({ severity: "fatal", source: "host", code: "SHUTDOWN_INCOMPLETE", message: blockers[0] ?? "Shutdown incomplete." });
    throw new RuntimeShutdownFailure(blockers);
  }
  input.state.disposed();
  runtimeClaimed = false;
  return Object.freeze({ disposed: true, blockers: Object.freeze([]), diagnostics: input.diagnostics.snapshot() });
}

export function resetRuntimeProcessGuardForTest(): void { runtimeClaimed = false; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
