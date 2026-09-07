import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import {
  RUNTIME_V2_DESKTOP_CHANNELS,
  type RuntimeV2AbortRunInput,
  type RuntimeV2CancelMessageInput,
  type RuntimeV2CreateSessionInput,
  type RuntimeV2EnqueueMessageInput,
  type RuntimeV2ForkSessionInput,
  type RuntimeV2InspectSessionInput,
  type RuntimeV2RequestRestartInput,
  type RuntimeV2UpdateSessionMetadataInput,
  type RuntimeV2ReadArtifactInput,
  type RuntimeV2RunTurnRequest,
  type RuntimeV2ApprovalDecisionInput,
  type RuntimeV2ApprovalRequest,
  type RuntimeV2ConfigureProviderInput,
  type RuntimeV2ConfigureSecretInput,
  type RuntimeV2ModelRemoveInput,
  type RuntimeV2ModelUpdateInput,
  type RuntimeV2ProviderCredentialAddInput,
  type RuntimeV2ProviderCredentialRemoveInput,
  type RuntimeV2ProviderCredentialUpdateInput,
  type RuntimeV2ProviderIdInput,
  type RuntimeV2WriteAgentSystemPromptInput,
  type RuntimeV2SettingsUpdateInput,
  type RuntimeV2AddCatalogModelInput,
  type RuntimeV2ModelCatalogQuery,
} from "@actspace/shared/runtime-v2";
import { PROVIDER_IDS, SEARCH_PROVIDER_IDS, normalizeModelKey, type SecretProviderId } from "@actspace/shared";
import type { DesktopRuntimeV2Registry } from "./runtime-registry";
import type { SettingsService } from "../settings-service";
import type { ModelStoreService } from "../model-store-service";
import type { ProviderNetworkService } from "./provider-network-service";
import type { QuickOpenShortcutController } from "../quick-open-shortcut-controller";
import type { RuntimeV2OpenRouterCatalogService } from "./openrouter-catalog-service";

type ApprovalRegistryView = {
  readonly listPending: (sessionId?: string) => ReadonlyArray<{
    readonly id: string;
    readonly sessionId?: string;
    readonly agentRunId?: string;
    readonly toolName: string;
    readonly summary: string;
    readonly reason: string;
    readonly riskLevel?: "low" | "medium" | "high";
    readonly args: Readonly<Record<string, unknown>>;
    readonly createdAt: number;
    readonly expiresAt: number;
  }>;
  readonly decide: (requestId: string, decision: "approve_once" | "deny") => { readonly ok: true } | { readonly ok: false; readonly reason: string };
};

export function registerRuntimeV2Ipc(options: {
  readonly registry: DesktopRuntimeV2Registry;
  readonly getMainWindow: () => BrowserWindow | undefined;
  readonly settings?: SettingsService;
  readonly models?: ModelStoreService;
  readonly providerNetwork?: ProviderNetworkService;
  readonly quickOpen?: QuickOpenShortcutController;
  readonly catalog?: RuntimeV2OpenRouterCatalogService;
  readonly approvals?: ApprovalRegistryView;
}): { readonly dispose: () => void } {
  const channels = Object.values(RUNTIME_V2_DESKTOP_CHANNELS).filter((channel) => channel !== RUNTIME_V2_DESKTOP_CHANNELS.liveEvent && channel !== RUNTIME_V2_DESKTOP_CHANNELS.approvalRequired);
  const handle = <T extends unknown[], R>(channel: string, listener: (event: IpcMainInvokeEvent, ...args: T) => R | Promise<R>) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event, options.getMainWindow());
      return listener(event, ...(args as T));
    });
  };
  handle(RUNTIME_V2_DESKTOP_CHANNELS.status, () => options.registry.status());
  handle(RUNTIME_V2_DESKTOP_CHANNELS.snapshot, (_event, sessionId?: string) => options.registry.snapshot(sessionId));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.listSessions, () => options.registry.listSessions());
  handle(RUNTIME_V2_DESKTOP_CHANNELS.inspectSession, (_event, input: RuntimeV2InspectSessionInput) => options.registry.inspectSession(input.sessionId));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.exportSession, (_event, input: RuntimeV2InspectSessionInput) => options.registry.exportSession(input.sessionId));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.createSession, (_event, input: RuntimeV2CreateSessionInput = {}) => options.registry.createSession(input.sessionId, input.workspaceRoot));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.resumeSession, (_event, input: RuntimeV2InspectSessionInput) => options.registry.resumeSession(input.sessionId));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.forkSession, (_event, input: RuntimeV2ForkSessionInput) => options.registry.forkSession(input));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.runTurn, (_event, input: RuntimeV2RunTurnRequest) => options.registry.runTurn(input));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.enqueueMessage, (_event, input: RuntimeV2EnqueueMessageInput) => options.registry.enqueueMessage(input));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.cancelMessage, (_event, input: RuntimeV2CancelMessageInput) => options.registry.cancelMessage(input.sessionId, input.messageId));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.abortRun, (_event, input: RuntimeV2AbortRunInput) => options.registry.abortRun(input.sessionId, input.reason));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.flushSession, (_event, input: RuntimeV2InspectSessionInput) => options.registry.flushSession(input.sessionId));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.requestRestart, (_event, input: RuntimeV2RequestRestartInput) => options.registry.requestRestart(input));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.updateSessionMetadata, (_event, input: RuntimeV2UpdateSessionMetadataInput) => options.registry.updateSessionMetadata(input));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.readArtifact, (_event, input: RuntimeV2ReadArtifactInput) => options.registry.readArtifact(input.sessionId, input.artifactId));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.replayLiveEvents, (_event, afterCursor: number) => options.registry.replayLiveEvents(afterCursor));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.getSettings, () => {
    if (options.settings === undefined) throw new Error("Runtime v2 settings are unavailable.");
    return options.settings.getV2();
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.updateSettings, async (_event, input: RuntimeV2SettingsUpdateInput) => {
    if (options.settings === undefined) throw new Error("Runtime v2 settings are unavailable.");
    if (input.shortcuts?.quickOpen) {
      if (!options.quickOpen) throw new Error("Quick Open shortcut service is unavailable.");
      const current = options.settings.getV2().shortcuts.quickOpen;
      const next = { ...current, ...input.shortcuts.quickOpen };
      const result = await options.quickOpen.update(current, next, () => options.settings!.updateV2(input).then(() => options.settings!.get()));
      if ("error" in result) throw new Error(result.error);
      return options.settings.getV2();
    }
    return options.settings.updateV2(input);
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.configureProvider, async (_event, input: RuntimeV2ConfigureProviderInput) => {
    if (options.settings === undefined) throw new Error("Runtime v2 settings are unavailable.");
    await options.settings.updateProviderConnection(input);
    return options.settings.getV2();
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.configureSecret, async (_event, input: RuntimeV2ConfigureSecretInput) => {
    if (options.settings === undefined) throw new Error("Runtime v2 settings are unavailable.");
    assertConfigureSecretInput(input);
    const result = input.apiKey === null
      ? await options.settings.clearProviderKey(input.provider)
      : await options.settings.setProviderKey(input.provider, input.apiKey);
    if (!result.ok) {
      const message = "error" in result && typeof result.error === "string"
        ? result.error
        : "Credential update failed.";
      throw new Error(message);
    }
    return options.settings.getV2();
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.addProviderCredential, async (_event, input: RuntimeV2ProviderCredentialAddInput) => {
    const settings = requireSettings(options.settings);
    assertLlmProvider(input?.provider);
    if (typeof input.label !== "string" || typeof input.apiKey !== "string" || input.apiKey.trim().length === 0) throw new Error("Credential input is invalid.");
    await settings.addProviderCredential(input);
    return settings.getV2();
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.updateProviderCredential, async (_event, input: RuntimeV2ProviderCredentialUpdateInput) => {
    const settings = requireSettings(options.settings);
    assertLlmProvider(input?.provider);
    if (typeof input.credentialId !== "string" || typeof input.label !== "string") throw new Error("Credential input is invalid.");
    const result = await settings.updateProviderCredential(input.provider, input.credentialId, input.label, input.pricingMultiplier);
    if ("message" in result) throw new Error(result.message);
    return settings.getV2();
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.removeProviderCredential, async (_event, input: RuntimeV2ProviderCredentialRemoveInput) => {
    const settings = requireSettings(options.settings);
    assertLlmProvider(input?.provider);
    if (typeof input.credentialId !== "string") throw new Error("Credential input is invalid.");
    const result = await settings.removeProviderCredential(input.provider, input.credentialId);
    if ("message" in result) throw new Error(result.message);
    return settings.getV2();
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.updateModel, async (_event, input: RuntimeV2ModelUpdateInput) => {
    const settings = requireSettings(options.settings);
    const models = requireModels(options.models);
    const modelKey = normalizeModelKey(input?.modelKey);
    if (!modelKey) throw new Error("Model key is invalid.");
    const result = await models.updateModelSettings(modelKey, input);
    if ("message" in result) throw new Error(result.message);
    return settings.getV2();
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.removeModel, async (_event, input: RuntimeV2ModelRemoveInput) => {
    const settings = requireSettings(options.settings);
    const models = requireModels(options.models);
    const modelKey = normalizeModelKey(input?.modelKey);
    if (!modelKey) throw new Error("Model key is invalid.");
    const result = await models.removeModel(modelKey);
    if ("message" in result) throw new Error(result.message);
    return settings.getV2();
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.testProvider, async (_event, input: RuntimeV2ProviderIdInput) => {
    const settings = requireSettings(options.settings);
    const network = requireProviderNetwork(options.providerNetwork);
    assertLlmProvider(input?.provider);
    const runtime = settings.getProviderRuntimeConfig(input.provider);
    if ("code" in runtime) return { ok: false, message: runtime.message, checkedAt: new Date().toISOString(), errorKind: "invalid_request" as const, settings: settings.getV2() };
    const result = await network.testConnection(runtime);
    await settings.markProviderConnectionResult(input.provider, result);
    return { ...result, settings: settings.getV2() };
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.getProviderBalance, async (_event, input: RuntimeV2ProviderIdInput) => {
    const settings = requireSettings(options.settings);
    const network = requireProviderNetwork(options.providerNetwork);
    assertLlmProvider(input?.provider);
    const runtime = input.provider === "openrouter"
      ? settings.getOpenRouterManagementRuntimeConfig()
      : settings.getProviderRuntimeConfig(input.provider);
    if ("code" in runtime) {
      if (runtime.code === "api_key_missing") return network.getBalance(input.provider, undefined);
      throw new Error(runtime.message);
    }
    return network.getBalance(input.provider, runtime);
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.getSearchUsage, () => requireSettings(options.settings).getSearchUsage());
  handle(RUNTIME_V2_DESKTOP_CHANNELS.readAgentSystemPrompt, () => requireSettings(options.settings).readAgentSystemPrompt());
  handle(RUNTIME_V2_DESKTOP_CHANNELS.writeAgentSystemPrompt, (_event, input: RuntimeV2WriteAgentSystemPromptInput) => {
    if (!input || typeof input.content !== "string") throw new Error("System prompt content is invalid.");
    return requireSettings(options.settings).writeAgentSystemPrompt(input.content);
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.listModelCatalog, (_event, input: RuntimeV2ModelCatalogQuery = {}) => ({ provider: "openrouter" as const, ...requireCatalog(options.catalog).list(input.query) }));
  handle(RUNTIME_V2_DESKTOP_CHANNELS.reloadModelCatalog, async () => {
    const settings = requireSettings(options.settings);
    const catalog = requireCatalog(options.catalog);
    const runtime = settings.getProviderRuntimeConfig("openrouter");
    if ("code" in runtime) return { provider: "openrouter" as const, ...catalog.list(), error: { code: runtime.code, message: runtime.message } };
    const result = await catalog.reload(runtime);
    if (!result.error && result.state === "fresh") await requireModels(options.models).refreshInstalledCatalogModels();
    return { provider: "openrouter" as const, ...result };
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.addCatalogModel, async (_event, input: RuntimeV2AddCatalogModelInput) => {
    if (!input || typeof input.apiModel !== "string" || !input.apiModel.trim()) throw new Error("Catalog model is invalid.");
    const result = await requireModels(options.models).addCatalogModel("openrouter", input.apiModel.trim());
    if ("message" in result) throw new Error(result.message);
    return requireSettings(options.settings).getV2();
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.pickAttachment, async (_event, sessionId: string) => {
    const window = options.getMainWindow();
    if (window === undefined || window.isDestroyed()) throw new Error("Desktop window is unavailable.");
    const result = await dialog.showOpenDialog(window, { properties: ["openFile"], filters: [{ name: "Images and documents", extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf", "txt", "md", "json", "csv"] }] });
    const path = result.filePaths[0];
    return result.canceled || path === undefined ? null : options.registry.importAttachment(sessionId, path);
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.listApprovals, (_event, sessionId?: string) => {
    if (options.approvals === undefined) return [];
    return options.approvals.listPending(sessionId).map(toApprovalDto);
  });
  handle(RUNTIME_V2_DESKTOP_CHANNELS.decideApproval, (_event, input: RuntimeV2ApprovalDecisionInput) => {
    if (options.approvals === undefined) return { ok: false as const, reason: "approval_registry_unavailable" };
    return options.approvals.decide(input.requestId, input.decision === "allow" ? "approve_once" : "deny");
  });
  const unsubscribe = options.registry.subscribe((event) => {
    const window = options.getMainWindow();
    if (window !== undefined && !window.isDestroyed()) window.webContents.send(RUNTIME_V2_DESKTOP_CHANNELS.liveEvent, event);
  });
  return Object.freeze({
    dispose: () => {
      unsubscribe();
      for (const channel of channels) ipcMain.removeHandler(channel);
    },
  });
}

const SECRET_PROVIDER_IDS = new Set<SecretProviderId>([
  ...PROVIDER_IDS,
  ...SEARCH_PROVIDER_IDS,
  "image-generation",
]);

function assertConfigureSecretInput(input: RuntimeV2ConfigureSecretInput): void {
  if (!input || !SECRET_PROVIDER_IDS.has(input.provider)) throw new Error("Unknown credential provider.");
  if (input.apiKey !== null && (typeof input.apiKey !== "string" || input.apiKey.trim().length === 0)) {
    throw new Error("API key must be a non-empty string or null.");
  }
}

function assertLlmProvider(provider: unknown): asserts provider is (typeof PROVIDER_IDS)[number] {
  if (!PROVIDER_IDS.includes(provider as (typeof PROVIDER_IDS)[number])) throw new Error("Unknown LLM provider.");
}

function requireSettings(settings: SettingsService | undefined): SettingsService {
  if (!settings) throw new Error("Runtime v2 settings are unavailable.");
  return settings;
}

function requireModels(models: ModelStoreService | undefined): ModelStoreService {
  if (!models) throw new Error("Runtime v2 model store is unavailable.");
  return models;
}

function requireProviderNetwork(service: ProviderNetworkService | undefined): ProviderNetworkService {
  if (!service) throw new Error("Runtime v2 provider network service is unavailable.");
  return service;
}

function requireCatalog(service: RuntimeV2OpenRouterCatalogService | undefined): RuntimeV2OpenRouterCatalogService {
  if (!service) throw new Error("Runtime v2 model catalog is unavailable.");
  return service;
}

function toApprovalDto(request: ReturnType<ApprovalRegistryView["listPending"]>[number]): RuntimeV2ApprovalRequest {
  return Object.freeze({
    requestId: request.id,
    sessionId: request.sessionId ?? "",
    agentRunId: request.agentRunId ?? "",
    toolName: request.toolName,
    summary: request.summary,
    reason: request.reason,
    risk: request.riskLevel ?? "medium",
    argumentSummary: request.args,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
  });
}

function assertTrustedSender(event: IpcMainInvokeEvent, mainWindow: BrowserWindow | undefined): void {
  if (mainWindow === undefined || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) {
    throw new Error("Runtime v2 IPC rejected an untrusted sender.");
  }
}
