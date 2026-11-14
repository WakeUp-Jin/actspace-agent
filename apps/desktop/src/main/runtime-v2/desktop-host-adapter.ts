import { createDesktopToolHostServices } from "./tool-host-services";
import type { SpeechHostPort } from "@actspace/english-learning";
import { join } from "node:path";
import type { RuntimeHostCapability, RuntimeHostDescriptor, RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { DesktopApprovalBroker } from "./approval-broker";
import { DesktopArtifactStore } from "./artifact-store";
import { BROWSER_TOOLS_HOST_PORT_ID } from "@actspace/tool-browser";
import { createDesktopBrowserCapability } from "./browser-capability";
import { DEFAULT_CREDENTIAL_REF, DesktopCredentialResolver } from "./credential-resolver";
import { DesktopLlmAdapter } from "./llm-adapter";
import type { RuntimeModule } from "./runtime-loader";
import { createDesktopModelsHostPort, type DesktopRuntimeModelPort } from "./model-port";
import { MODELS_HOST_PORT_ID } from "@actspace/shared";
import type { DesktopRuntimeApprovalPort, DesktopRuntimeBrowserPort, DesktopRuntimeRoots } from "./host-ports";

export type DesktopRuntimeBootOptions = {
  readonly speech?: SpeechHostPort;
  readonly module: RuntimeModule;
  readonly roots: DesktopRuntimeRoots;
  readonly models: DesktopRuntimeModelPort;
  readonly approvals: DesktopRuntimeApprovalPort;
  /** Absent when the 操控浏览器 plugin is switched off: the Host reports no `browser` capability. */
  readonly browser?: DesktopRuntimeBrowserPort;
  /** Plugin ids switched off for this process; global ones become an invocation `disable` patch, session ones skip the Harness entry. */
  readonly disabledPlugins?: readonly string[];
  /** Per plugin Entry id settings, passed to `bootProfileRuntime` as `pluginConfig` (merged over each manifest `config`). */
  readonly pluginConfig?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** The bundled nono; absent when it was not found (see `resolveDesktopNonoPath`). */
  readonly nonoPath?: string;
  /** The bundled Python for the bash tool; absent when this build ships none (see `resolveDesktopPythonRuntime`). */
  readonly python?: import("@actspace/python-runtime").PythonRuntimeForBash;
  readonly disabledSkillIds?: () => readonly string[];
  readonly chatCompactionTriggerRatio: () => number;
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
};

export async function bootDesktopRuntime(options: DesktopRuntimeBootOptions) {
  const browser = options.browser === undefined ? undefined : await createDesktopBrowserCapability(options.browser);
  const capabilities: RuntimeHostCapability[] = [
    "filesystem.read",
    "filesystem.write",
    "network",
    "approval",
    "credential",
    "renderer",
    "process",
    ...(browser?.ready ? ["browser" as const] : []),
  ];
  const host: RuntimeHostDescriptor = Object.freeze({
    hostKind: "desktop",
    capabilityCeiling: Object.freeze(capabilities),
    runtimeContract: "actspace.runtime.v2",
    invocationId: options.invocationId,
    workspaceRef: options.roots.workspaceRoot,
  });
  const artifacts = new DesktopArtifactStore(options.roots.dataRoot);
  const desktopApp = await import("@actspace/desktop-app");
  const disabled = new Set(options.disabledPlugins ?? []);
  const switched = options.module.PLUGIN_CATALOG.filter((entry) => disabled.has(entry.id));
  const globalSwitched = switched.filter((entry) => entry.loaders.includes("host"));
  const composition = options.module.createProfileComposition(options.module.RUNTIME_PROFILE_IDS.desktop, host, {
    appBundle: desktopApp.DESKTOP_APP_BUNDLE,
    ...(globalSwitched.length === 0
      ? {}
      : {
          invocationPatch: {
            id: "desktop.plugin-switches",
            provenance: "desktop-settings",
            operations: globalSwitched.map((entry) => ({
              id: `disable:${entry.id}`,
              kind: "disable" as const,
              target: String(entry.manifest.behaviors[0].entryId),
            })),
          },
        }),
  });
  const credentialResolver = new DesktopCredentialResolver(options.models);
  const capabilityMap = new Map<string, unknown>([
    ...(browser ? [["browser", browser] as const] : []),
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
      "actspace.host.chat-settings": Object.freeze({ compactionTriggerRatio: options.chatCompactionTriggerRatio }),
      "host.approval": approvalBroker,
      ...(browser ? { "host.browser": browser, [BROWSER_TOOLS_HOST_PORT_ID]: browser } : {}),
      "host.artifacts": artifacts,
      [MODELS_HOST_PORT_ID]: createDesktopModelsHostPort(options.models),
      [options.module.LLM_HOST_PORT_ID]: Object.freeze({
        credentials: credentialResolver,
        routes: Object.freeze([
          {
            routeId: "default",
            providerId: "desktop",
            modelPattern: "*",
            adapter: new DesktopLlmAdapter(options.models, (sessionId, artifactId) =>
              artifacts.readForSession(sessionId, artifactId),
            ),
            credentialRef: DEFAULT_CREDENTIAL_REF,
            defaults: {},
          },
          {
            routeId: "utility",
            providerId: "desktop",
            modelPattern: "*",
            adapter: new DesktopLlmAdapter(
              options.models,
              (sessionId, artifactId) => artifacts.readForSession(sessionId, artifactId),
              "utility",
            ),
            credentialRef: "desktop:utility",
            // 思考档位读用途表（设置 › 模型），由 adapter 在 prepare 时带上。
            defaults: {},
          },
          {
            routeId: "auto-review",
            providerId: "desktop",
            modelPattern: "*",
            adapter: new DesktopLlmAdapter(
              options.models,
              (sessionId, artifactId) => artifacts.readForSession(sessionId, artifactId),
              "auto-review",
            ),
            credentialRef: DEFAULT_CREDENTIAL_REF,
            defaults: {},
          },
        ]),
      }),
      ...createDesktopToolHostServices({
        workspaceRoot: options.roots.workspaceRoot,
        tmpRoot: options.roots.tmpRoot,
        modelRuntime: options.models,
        readArtifact: (sessionId, artifactId) => artifacts.readForSession(sessionId, artifactId),
        resolveArtifact: (sessionId, artifactId) => artifacts.resolveForSession(sessionId, artifactId),
        nonoPath: options.nonoPath,
        ...(options.python === undefined ? {} : { python: options.python }),
      }),
      [options.module.PROMPT_HOST_PORT_ID]: Object.freeze({
        workspaceRoot: options.roots.workspaceRoot,
        resolveUserSource: () => options.module.prepareUserPromptSource(options.roots.dataRoot),
        resolveSource: (workspaceRoot: string) =>
          options.module.prepareRuntimePromptSource({
            dataRoot: options.roots.dataRoot,
            workspaceRoot,
            disabledSkillIds: options.disabledSkillIds?.(),
          }),
      }),
    }),
  });
  const profile = await options.module.bootProfileRuntime({
    host,
    dataRoot: options.roots.dataRoot,
    hostServices,
    toolEnvironment: {
      workspaceRoot: options.roots.workspaceRoot,
      hostCapabilities: new Set(capabilities),
      capabilitySet,
      approvalBroker,
      sessionGrantCapability: true,
      trustedGrantAudiences: new Set([
        "actspace.shell-tools\u0000bash\u00001",
        "actspace.filesystem-read\u0000filesystem-read\u00001",
        "actspace.filesystem-search\u0000filesystem-search\u00001",
        "actspace.filesystem-write\u0000filesystem-write\u00001",
      ]),
      reportProgress: options.onToolProgress,
      createArtifact: (input) => artifacts.create(input),
      resolveArtifact: (sessionId, artifactId) => artifacts.resolveForSession(sessionId, artifactId),
    },
    composition,
    disabledPlugins: switched.filter((entry) => !entry.loaders.includes("host")).map((entry) => entry.id),
    ...(options.pluginConfig ? { pluginConfig: options.pluginConfig } : {}),
    cordis: {
      configPath: options.module.runtimeCordisConfigPath(),
      admission: await options.module.inspectCordisAdmission(),
    },
    disposeCordis: options.disposeCordis,
    onLiveEvent: options.onRuntimeLive,
    rendererAllowlist: DESKTOP_RENDERER_ALLOWLIST,
  });
  if (browser && !browser.ready)
    profile.recordDiagnostic({
      severity: "warning",
      source: "host",
      code: "BROWSER_BRIDGE_UNAVAILABLE",
      message: "Browser Bridge is not ready; browser tools were not activated.",
    });
  return Object.freeze({
    profile,
    host,
    artifacts,
    browserReady: browser?.ready === true,
    sessionRoot: join(options.roots.dataRoot, "sessions-v2"),
  });
}

const DESKTOP_RENDERER_ALLOWLIST = new Map([
  [
    "actspace.image-gallery",
    Object.freeze({
      id: "actspace.image-gallery",
      schemaVersion: 1,
      validate: (props: RuntimeJsonValue) => isImageGalleryProps(props),
    }),
  ],
]);

function isImageGalleryProps(value: RuntimeJsonValue): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const artifactIds = (value as Readonly<Record<string, RuntimeJsonValue>>).artifactIds;
  return (
    Array.isArray(artifactIds) &&
    artifactIds.length > 0 &&
    artifactIds.length <= 10 &&
    artifactIds.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
  );
}
