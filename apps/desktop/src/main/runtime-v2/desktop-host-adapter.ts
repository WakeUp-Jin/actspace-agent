import type { SpeechHostPort } from "@actspace/english-learning";
import { join } from "node:path";
import type { RuntimeV2HostCapability, RuntimeV2HostDescriptor, RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { DesktopApprovalBroker } from "./approval-broker";
import { DesktopArtifactStore } from "./artifact-store";
import { createDesktopBrowserCapability } from "./browser-capability";
import { DEFAULT_CREDENTIAL_REF, DesktopCredentialResolver } from "./credential-resolver";
import { DesktopLegacyLlmAdapter } from "./legacy-llm-adapter";
import type { RuntimeV2Module } from "./runtime-loader";
import type { DesktopRuntimeV2ModelPort } from "./model-port";
import type { DesktopRuntimeV2ApprovalPort, DesktopRuntimeV2BrowserPort, DesktopRuntimeV2Roots } from "./host-ports";

export type DesktopRuntimeV2BootOptions = {
  readonly speech?: SpeechHostPort;
  readonly module: RuntimeV2Module;
  readonly roots: DesktopRuntimeV2Roots;
  readonly models: DesktopRuntimeV2ModelPort;
  readonly approvals: DesktopRuntimeV2ApprovalPort;
  readonly browser: DesktopRuntimeV2BrowserPort;
  readonly invocationId: string;
  readonly onToolProgress?: (update: {
    readonly sessionId: string;
    readonly agentRunId: string;
    readonly turnId: string;
    readonly stepId: string;
    readonly callId: string;
    readonly pluginId: string;
    readonly name: string;
    readonly message: string;
    readonly completed?: number;
    readonly total?: number;
  }) => void;
  readonly onRuntimeLive?: (update: import("@actspace/runtime").AgentLoopLiveEvent) => void;
  readonly disposeCordis?: () => Promise<void>;
  /** Optional forensic/legacy plugin config; default boot never reads plugins.json. */
  readonly legacyPluginsConfigPath?: string;
};

export async function bootDesktopRuntimeV2(options: DesktopRuntimeV2BootOptions) {
  const browser = await createDesktopBrowserCapability(options.browser);
  const capabilities: RuntimeV2HostCapability[] = [
    "filesystem.read",
    "filesystem.write",
    "network",
    "approval",
    "credential",
    "renderer",
    "process",
    ...(browser.ready ? ["browser" as const] : []),
  ];
  const host: RuntimeV2HostDescriptor = Object.freeze({
    hostKind: "desktop",
    capabilityCeiling: Object.freeze(capabilities),
    runtimeContract: "actspace.runtime.v2",
    invocationId: options.invocationId,
    workspaceRef: options.roots.workspaceRoot,
  });
  const artifacts = new DesktopArtifactStore(options.roots.dataRoot);
  const plugins = options.legacyPluginsConfigPath === undefined ? undefined : await options.module.loadConfiguredPlugins(options.legacyPluginsConfigPath);
  const desktopApp = await import("@actspace/desktop-app");
  const composition = options.module.createProfileComposition(options.module.RUNTIME_PROFILE_IDS.desktop, host, {
    appBundle: desktopApp.DESKTOP_APP_BUNDLE,
    ...(plugins === undefined ? {} : { plugins: plugins.manifests }),
  });
  const credentialResolver = new DesktopCredentialResolver(options.models);
  const capabilityMap = new Map<string, unknown>([
    ["browser", browser],
    ["workspace", Object.freeze({ root: options.roots.workspaceRoot })],
    ["artifact", artifacts],
  ]);
  const capabilitySet = Object.freeze({
    ids: Object.freeze([...capabilityMap.keys()].sort()),
    has: (capabilityId: string) => capabilityMap.has(capabilityId),
    get: <T>(capabilityId: string): T => {
      if (!capabilityMap.has(capabilityId)) throw new Error(`Desktop capability ${capabilityId} is unavailable.`);
      return capabilityMap.get(capabilityId) as T;
    },
  });
  const approvalBroker = new DesktopApprovalBroker(options.approvals);
  const hostServices = options.module.createRuntimeHostServices({
    descriptor: host,
    dataRoot: options.roots.dataRoot,
    workspaceRoot: options.roots.workspaceRoot,
    toolEnvironment: { hostCapabilities: new Set(capabilities), capabilitySet },
      services: Object.freeze({
      ...(options.speech ? { "actspace.host.speech": options.speech } : {}),
      "actspace.host.desktop": Object.freeze({ workspaceRoot: options.roots.workspaceRoot }),
      "host.approval": approvalBroker,
      "host.browser": browser,
      "host.artifacts": artifacts,
      [options.module.LLM_HOST_PORT_ID]: Object.freeze({
        credentials: credentialResolver,
        routes: Object.freeze([{
          routeId: "default",
          providerId: "desktop",
          modelPattern: "*",
          adapter: new DesktopLegacyLlmAdapter(options.models, (sessionId, artifactId) => artifacts.readForSession(sessionId, artifactId)),
          credentialRef: DEFAULT_CREDENTIAL_REF,
          defaults: {},
        }]),
      }),
      [options.module.CORE_TOOLS_HOST_PORT_ID]: Object.freeze({
        createPorts: async (llm: unknown) => {
          const { createDesktopCoreToolPorts } = await import("./core-tool-ports");
          return createDesktopCoreToolPorts({ workspaceRoot: options.roots.workspaceRoot, tmpRoot: options.roots.tmpRoot, modelRuntime: options.models, llm, readArtifact: (sessionId, artifactId) => artifacts.readForSession(sessionId, artifactId) });
        },
      }),
      [options.module.PROMPT_HOST_PORT_ID]: Object.freeze({
        workspaceRoot: options.roots.workspaceRoot,
        resolveSource: (workspaceRoot: string) => options.module.prepareRuntimePromptSource({ dataRoot: options.roots.dataRoot, workspaceRoot }),
      }),
      [options.module.BROWSER_TOOLS_HOST_PORT_ID]: browser,
    }),
  });
  const disposeResources = onceAsync(async () => undefined);
  try {
    const profile = await options.module.bootProfileRuntime({
      host,
      dataRoot: options.roots.dataRoot,
      hostServices,
      toolEnvironment: {
        workspaceRoot: options.roots.workspaceRoot,
        hostCapabilities: new Set(capabilities),
        capabilitySet,
        approvalBroker,
        reportProgress: options.onToolProgress,
        createArtifact: (input) => artifacts.create(input),
      },
      composition,
      ...(plugins === undefined ? {} : { pluginCodecLoader: plugins.codecLoader }),
      cordis: { configPath: options.module.runtimeCordisConfigPath(), admission: await options.module.inspectCordisAdmission() },
      disposeCordis: options.disposeCordis,
      onLiveEvent: options.onRuntimeLive,
      rendererAllowlist: DESKTOP_RENDERER_ALLOWLIST,
    });
    if (!browser.ready) profile.recordDiagnostic({ severity: "warning", source: "host", code: "BROWSER_BRIDGE_UNAVAILABLE", message: "Browser Bridge is not ready; browser tools were not activated." });
    return Object.freeze({ profile, host, artifacts, browserReady: browser.ready, sessionRoot: join(options.roots.dataRoot, "sessions-v2") });
  } catch (error) {
    await disposeResources().catch(() => undefined);
    throw error;
  }
}

const DESKTOP_RENDERER_ALLOWLIST = new Map([
  ["actspace.image-gallery", Object.freeze({ id: "actspace.image-gallery", schemaVersion: 1, validate: (props: RuntimeV2JsonValue) => isImageGalleryProps(props) })],
]);

function isImageGalleryProps(value: RuntimeV2JsonValue): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const artifactIds = (value as Readonly<Record<string, RuntimeV2JsonValue>>).artifactIds;
  return Array.isArray(artifactIds) && artifactIds.length > 0 && artifactIds.length <= 10 && artifactIds.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
}

function onceAsync(dispose: () => Promise<void>): () => Promise<void> {
  let promise: Promise<void> | undefined;
  return () => {
    if (promise !== undefined) return promise;
    const attempt = dispose().catch((error: unknown) => {
      if (promise === attempt) promise = undefined;
      throw error;
    });
    promise = attempt;
    return attempt;
  };
}
async function settleAll(disposers: readonly (() => void | Promise<void>)[]): Promise<void> { const results = await Promise.allSettled(disposers.map((dispose) => dispose())); const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected"); if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason), "Desktop v2 resource cleanup failed."); }
