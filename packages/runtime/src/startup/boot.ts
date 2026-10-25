import { createHash } from "node:crypto";
import type { RuntimeV2HostDescriptor, RuntimeV2BootManifest, RuntimeV2RuntimeState, RuntimeV2DiagnosticsSnapshot, RuntimeV2ShutdownResult } from "@actspace/shared/runtime-v2";
import type { AgentLoopLiveEvent } from "@actspace/core-agent-loop";
import { PromptExtensionRegistry, emptyRuntimePromptSource, type RuntimePromptSource } from "@actspace/prompt";
import { DiagnosticsCollector } from "../projection/diagnostics.js";
import type { RendererAllowlist } from "../projection/tool-dto.js";
import type { DiagnosticInput } from "../projection/diagnostics.js";
import { sandboxStatusDiagnostic } from "./sandbox-status.js";
import { SESSION_CODEC_HOST_PORT_ID } from "@actspace/session-journal";
import { loadBuiltinToolCodec, toolTransportPatches } from "../profiles/composition.js";
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
import { createRuntimeHostServices, type RuntimeHostServices } from "./host-services.js";
import { RuntimeSessionController } from "../session/session-controller.js";
import { SESSION_RUNTIME_HOST_PORT_ID, type RuntimeSessionHostPort } from "../session/session-plugin.js";
import { AGENT_RUNTIME_HOST_PORT_ID, type AgentRuntimeHostPort } from "../harness/agent-host-port.js";
import type { AgentRuntimeService } from "../harness/agent-runtime-plugin.js";
import { HEADLESS_HOST_PORT_ID } from "@actspace/headless";
import { BACKGROUND_TASK_HOST_SERVICE, createBackgroundTaskHost } from "@actspace/background-tasks";
import { createNodeSandboxHostPort, SANDBOX_HOST_PORT_ID } from "@actspace/sandbox";
import { RuntimeStateController } from "./runtime-state.js";
import { settleWithinDeadline } from "./shutdown.js";

import { createContextHost } from "../harness/context-host.js";

let runtimeClaimed = false;

export type BootRuntimeOptions = {
  /** Trusted Host-only hook; absent in production defaults. Never supplied by renderer input. */
  readonly authorizeHarness?: import("@actspace/harness-control").HarnessAuthorizer;
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
  /** Boot this Harness selection instead of the built-in one; the data root must hold no selection history. */
  readonly pinnedHarness?: import("../harness/agent-host-port.js").PinnedHarness;
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

export async function bootProfileRuntime(options: BootRuntimeOptions): Promise<BootedRuntimeProfile> {
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
 * the checked-in Host tree; scheduling is a Context service and execution
 * services are published by isolated Harness Behaviors.
 */
async function bootDshClaimedRuntime(options: BootRuntimeOptions): Promise<BootedRuntimeProfile> {
  const state = new RuntimeStateController();
  const composition = options.composition;
  if (composition === undefined) throw new Error("Runtime boot requires an explicit Profile composition.");
  const hostServices = options.hostServices ?? createRuntimeHostServices({ descriptor: options.host, dataRoot: options.dataRoot, workspaceRoot: options.toolEnvironment.workspaceRoot, toolEnvironment: options.toolEnvironment });
  const cordisAdmission = options.cordis?.admission ?? await inspectCordisAdmission();
  const enabledPluginIds = new Set(composition.entries.filter(entry => entry.enabled && entry.state !== "skipped").map(entry => entry.pluginId));
  const pluginCodecs: readonly EventCodec[] = await discoverPluginCodecs(composition.manifests.filter(manifest => enabledPluginIds.has(manifest.pluginId) || (manifest.source.kind === "builtin" && manifest.pluginId === "actspace.context")), (specifier, manifest) =>
    manifest.source.kind === "builtin" ? loadBuiltinToolCodec(specifier, manifest) : (options.pluginCodecLoader ?? missingCodecLoader)(specifier, manifest));
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
  const originalPromptPort = hostServices.services["actspace.host.prompt"] ?? Object.freeze({
    workspaceRoot: options.toolEnvironment.workspaceRoot,
    resolveSource: async (workspaceRoot: string) => typeof options.promptSource === "function" ? options.promptSource(workspaceRoot) : options.promptSource ?? emptyRuntimePromptSource(),
  });
  const promptPort = Object.freeze({ ...(originalPromptPort as import("@actspace/prompt").PromptHostPort), extensions: (originalPromptPort as import("@actspace/prompt").PromptHostPort).extensions ?? new PromptExtensionRegistry() });
  let runtimeContext: CordisContext | undefined;
  const providedHostServices = Object.freeze({
    ...hostServices.services,
    "actspace.host.subagents": Object.freeze({ invoke: (input: import("@actspace/subagent").SubagentInvocation) => {
      const runtime = runtimeContext?.get?.("agent.runtime") as AgentRuntimeService | undefined;
      if (!runtime) throw new Error("Agent runtime is not ready");
      return runtime.subagents.invoke(input);
    }, launch: (input: import("@actspace/subagent").SubagentInvocation) => {
      const runtime = runtimeContext?.get?.("agent.runtime") as AgentRuntimeService | undefined;
      if (!runtime) throw new Error("Agent runtime is not ready");
      return runtime.subagents.launch(input);
    } }),
    [BACKGROUND_TASK_HOST_SERVICE]: createBackgroundTaskHost(() => {
      const runtime = runtimeContext?.get?.("agent.runtime") as AgentRuntimeService | undefined;
      if (!runtime) throw new Error("Agent runtime is not ready");
      return runtime.backgroundTasks;
    }),
    "actspace.host.prompt": promptPort,
    [SESSION_CODEC_HOST_PORT_ID]: pluginCodecs,
    [SESSION_RUNTIME_HOST_PORT_ID]: runtimeHost,
    [HEADLESS_HOST_PORT_ID]: hostServices.services[HEADLESS_HOST_PORT_ID] ?? Object.freeze({ enabled: false }),
    // Without a bundled nono only the macOS Seatbelt backend can probe available; Bash otherwise goes to approval.
    [SANDBOX_HOST_PORT_ID]: hostServices.services[SANDBOX_HOST_PORT_ID] ?? createNodeSandboxHostPort(),
    [AGENT_RUNTIME_HOST_PORT_ID]: Object.freeze({
      disabledHarnessEntries: [...toolTransportPatches(composition).filter(row => row.disabled).map(row => row.id), ...(options.host.capabilityCeiling.includes("browser") ? [] : ["browser-tools"])],
      authorizeHarness: options.authorizeHarness,
      ...(options.pinnedHarness ? { pinnedHarness: options.pinnedHarness } : {}),
      evolution: {
        inspect: (context: import("@actspace/tools-runtime").ToolExecutionContext) => {
          const runtime = runtimeContext?.get?.("agent.runtime") as AgentRuntimeService | undefined;
          if (!runtime?.evolution) throw new Error("Evolution service is not ready");
          return runtime.evolution.inspect(context);
        },
        execute: (args: Readonly<Record<string, unknown>>, context: import("@actspace/tools-runtime").ToolExecutionContext) => {
          const runtime = runtimeContext?.get?.("agent.runtime") as AgentRuntimeService | undefined;
          if (!runtime?.evolution) throw new Error("Evolution service is not ready");
          return runtime.evolution.execute(args, context);
        },
      },
      onHarnessDiagnostic: (error: unknown) => diagnostics.record({ severity: "error", source: "boot", code: "HARNESS_RECOVERY_BLOCKED", message: error instanceof Error ? error.message : String(error) }),
      onSandboxStatus: (status: import("@actspace/sandbox").SandboxStatus | undefined) => diagnostics.record(sandboxStatusDiagnostic(status)),
      host: options.host,
      toolEnvironment: options.toolEnvironment,
      contextDisclosure: createContextHost(() => runtimeContext?.get?.("session.runtime") as RuntimeSessionController | undefined, options.toolEnvironment),
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

      requiredServices: ["actspace.runtime", "session.journal", "session.runtime", "llm.service", "core.agent", "agent.registry", "agent.service", "agent.runtime"],
      prepare: (prepared) => {
        runtimeContext = prepared;
        prepared.provide?.("actspace.host", Object.freeze({
          hostKind: options.host.hostKind,
          descriptor: hostServices.descriptor,
          services: providedHostServices,
        }));
      },
    });
    root = boot.root;
    context = boot.context;
    requireService(context.get?.("session.runtime") as RuntimeSessionController | undefined, "session.runtime");
    requireService(context.get?.("llm.service") as LlmService | undefined, "llm.service");
    const agentRuntime = requireService(context.get?.("agent.runtime") as AgentRuntimeService | undefined, "agent.runtime");
    const candidate = await createDshBootCandidate({ host: options.host, composition, cordisAdmission, root, discoveredCodecs: pluginCodecs });
    for (const item of candidate.diagnostics) diagnostics.record({ severity: item.severity, source: "boot", code: item.code, message: item.message, ...(item.provenance.pluginId === undefined ? {} : { pluginId: item.provenance.pluginId }), details: isRecord(item.details) ? item.details : { value: item.details } });
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
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;
    const attempt = (async () => {
      const failures: unknown[] = [];
      // Cordis releases sibling effects concurrently. Drain execution and seal
      // Sessions while their storage provider is still available, then dispose
      // the tree. Plugin effects remain the fallback for partial boot failures.
      for (const dispose of [
        () => input.agentRuntime.dispose(),
        () => (input.context.get?.("session.runtime") as RuntimeSessionController | undefined)?.closeAll(),
        () => input.candidate.disposeCandidate(),
        () => input.options.disposeCordis?.(),
        () => input.options.disposePlugins?.(),
      ]) {
        try { await dispose(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, "Runtime resource cleanup failed.");
    })().catch(error => {
      if (cleanupPromise === attempt) cleanupPromise = undefined;
      throw error;
    });
    cleanupPromise = attempt;
    return attempt;
  };
  const shutdown = (): Promise<RuntimeV2ShutdownResult> => {
    if (shutdownPromise !== undefined) return shutdownPromise;
    const attempt = shutdownBootedProfile(input, cleanup).catch((error: unknown) => {
      if (shutdownPromise === attempt) shutdownPromise = undefined;
      throw error;
    });
    shutdownPromise = attempt;
    return attempt;
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
}, cleanupResources: () => Promise<void>): Promise<RuntimeV2ShutdownResult> {
  input.state.quiesce();
  input.agentRuntime.runs.quiesce();
  // A timeout stops waiting, not disposal. Retries observe the same ongoing cleanup.
  const cleanup = cleanupResources();
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
