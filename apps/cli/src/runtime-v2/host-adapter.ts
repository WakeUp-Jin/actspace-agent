import { randomUUID } from "node:crypto";
import type { RuntimeV2LiveEvent } from "@actspace/shared/runtime-v2";
import type { TerminalLineInput } from "../terminal-input";
import { CliV2ApprovalBroker } from "./approval";
import { CliV2ArtifactStore } from "./artifact-store";
import { CliV2LlmAdapter, type CliPiAiProvider } from "./llm-adapter";
import { loadRuntimeV2 } from "./loader";
import type { BootRuntimeOptions } from "@actspace/runtime";
import type { RuntimeV2PermissionMode } from "./types";

let testCordis: BootRuntimeOptions["cordis"] | undefined;
export function setCliV2CordisForTest(value?: BootRuntimeOptions["cordis"]): void { testCordis = value; }

export async function bootCliV2(options: { readonly kind: "cli-run"; readonly workspace: string; readonly dataRoot: string; readonly persistentArtifacts?: boolean; readonly permissionMode: RuntimeV2PermissionMode; readonly mock: boolean; readonly model?: string; readonly input?: TerminalLineInput; readonly headlessInput?: string; readonly headlessSessionId?: string; readonly writeApproval?: (text: string) => void; readonly env?: NodeJS.ProcessEnv; readonly onLiveEvent?: (event: Omit<RuntimeV2LiveEvent, "schemaVersion" | "runtimeInstanceId" | "liveSeq" | "throughJournalSeq">) => void; readonly onHeadlessSession?: (sessionId: string, abort: () => boolean) => void }) {
  const runtime = await loadRuntimeV2(); const provider = resolveCliProvider(options.env ?? process.env);
  const host = { hostKind: options.kind, capabilityCeiling: ["filesystem.read", "filesystem.write", "network", "approval", "credential", "process"] as const, runtimeContract: "actspace.runtime.v2" as const, invocationId: randomUUID(), workspaceRef: options.workspace };
  // The trusted CLI assembly is now a checked-in cordis.yml tree. External
  // plugin admission remains an explicit future surface; the default run does
  // not silently read the retired runtime-v2/plugins.json file.
  const composition = runtime.createProfileComposition(runtime.RUNTIME_PROFILE_IDS.headless, host);
  const coreModule = options.mock ? undefined : await import("./core-tool-ports.js");
  const artifacts = options.persistentArtifacts === false ? await CliV2ArtifactStore.ephemeral() : new CliV2ArtifactStore(options.dataRoot);
  const llmAdapter = new CliV2LlmAdapter({ mock: options.mock, model: options.model, provider, readArtifact: (sessionId, artifactId) => artifacts.readForSession(sessionId, artifactId) });
  const credentials = { resolve: async () => ({ apiKey: provider.apiKey, baseUrl: provider.baseUrl, ...(provider.proxyUrl === undefined ? {} : { proxyUrl: provider.proxyUrl }) }) };
  const disposeResources = onceAsync(async () => { await artifacts.dispose(); });
  try {
    const approval = new CliV2ApprovalBroker(options.permissionMode, options.input, options.writeApproval);
    const capabilities = host.capabilityCeiling;
    const capabilitySet = Object.freeze({
      ids: Object.freeze([...capabilities]),
      has: (capabilityId: string) => capabilities.includes(capabilityId as (typeof capabilities)[number]),
      get: <T>(capabilityId: string): T => {
        throw new Error(`CLI capability ${capabilityId} is unavailable.`);
      },
    });
    const hostServices = runtime.createRuntimeHostServices({
      descriptor: host,
      dataRoot: options.dataRoot,
      workspaceRoot: options.workspace,
      toolEnvironment: { hostCapabilities: new Set(capabilities), capabilitySet },
      services: Object.freeze({
        "host.approval": approval,
        "host.artifacts": artifacts,
        [runtime.LLM_HOST_PORT_ID]: Object.freeze({ credentials, routes: Object.freeze([{ routeId: "default", providerId: provider.providerId, modelPattern: "*", adapter: llmAdapter, credentialRef: "cli-env", defaults: {} }]) }),
        [runtime.CORE_TOOLS_HOST_PORT_ID]: Object.freeze({ createPorts: async (llm: unknown) => coreModule?.createCliV2CoreToolPorts({ workspaceRoot: options.workspace, tmpRoot: `${options.dataRoot}/runtime/tmp`, llm, model: options.model ?? "default", readArtifact: (sessionId, artifactId) => artifacts.readForSession(sessionId, artifactId) }) ?? {} }),
        [runtime.PROMPT_HOST_PORT_ID]: Object.freeze({ workspaceRoot: options.workspace, resolveSource: async (workspaceRoot: string) => runtime.prepareRuntimePromptSource({ dataRoot: options.dataRoot, workspaceRoot }) }),
        [runtime.HEADLESS_HOST_PORT_ID]: options.headlessInput === undefined
          ? Object.freeze({ enabled: false })
          : Object.freeze({ enabled: true, content: options.headlessInput, persistent: options.persistentArtifacts !== false, workspaceRoot: options.workspace, sessionId: options.headlessSessionId, title: titleFromInput(options.headlessInput), model: options.model, onSessionCreated: options.onHeadlessSession, appExit: (_code: number) => undefined }),
      }),
    });
    const profile = await runtime.bootProfileRuntime({
      host, dataRoot: options.dataRoot,
      hostServices,
      toolEnvironment: { workspaceRoot: options.workspace, hostCapabilities: new Set(capabilities), capabilitySet, approvalBroker: approval, createArtifact: (input) => artifacts.create(input) },
      composition,
      onLiveEvent: (event) => options.onLiveEvent?.({ ...event }),
      ...(testCordis ? { cordis: testCordis } : { cordis: { configPath: runtime.runtimeCordisConfigPath(), admission: await runtime.inspectCordisAdmission() } }),
      disposePlugins: disposeResources,
    });
    return Object.freeze({ profile, approval, artifacts });
  } catch (error) {
    await disposeResources().catch(() => undefined);
    throw error;
  }
}

function titleFromInput(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= 48 ? normalized : `${normalized.slice(0, 47)}...`;
}

function resolveCliProvider(env: NodeJS.ProcessEnv): CliPiAiProvider {
  const providerId = (env.LLM_PROVIDER ?? "deepseek").toLowerCase();
  const route = env.LLM_API === "openai-responses" || env.LLM_API === "anthropic-messages" ? env.LLM_API : "openai-completions";
  const prefix = providerId.toUpperCase();
  const baseUrl = env[`${prefix}_BASE_URL`] ?? (providerId === "kimi" ? "https://api.moonshot.cn/v1" : providerId === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.deepseek.com");
  return Object.freeze({ providerId, route, baseUrl, apiKey: env[`${prefix}_API_KEY`], ...(env.LLM_PROXY_URL === undefined ? {} : { proxyUrl: env.LLM_PROXY_URL }) });
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
async function settleAll(disposers: readonly (() => void | Promise<void>)[]): Promise<void> { const results = await Promise.allSettled(disposers.map((dispose) => dispose())); const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected"); if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason), "CLI v2 resource cleanup failed."); }
