import { paginateSessionSummaries } from "./session-list-page";
import { UsageSourceCache } from "./usage-source-cache";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dialog, ipcMain, nativeImage, nativeTheme, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import {
  PROVIDER_IDS,
  normalizeModelKey,
  type AgentRunResult,
  type AppSettings,
  type ArtifactContextMenuInput,
  type BootstrapState,
  type ComposerAttachment,
  type PendingApprovalInfo,
  type ProviderOperationResult,
  type ProviderTestResult,
  type RunAgentInput,
  type SessionListItem,
  type SessionRecord,
  type SelectWorkspaceDirectoryResult,
  type UsageStatisticsGetInput,
  type UsageStatisticsSnapshot,
  type UsageActivitySnapshot,
  type SettingsV4ChangedNotification,
  type SettingsV4Snapshot,
  type SettingsV4UpdateResult,
  type SettingsV4UpdateInput,
  type CustomConnectionInput,
} from "@actspace/shared";
import {
  RUNTIME_V2_FIXED_RENDERER_CHANNELS,
  type RuntimeV2JsonValue,
  type RuntimeV2SessionListItem,
  type RuntimeV2SessionSnapshot,
  type RuntimeV2DesktopSessionProjection,
} from "@actspace/shared/runtime-v2";
import type { RuntimeV2UpdateCustomConnectionInput } from "@actspace/shared/runtime-v2";
import type { AppDataRoots } from "../app-paths";
import type { PendingApprovalRegistry } from "../approval-registry";
import { showArtifactContextMenu, showResolvedArtifactContextMenu } from "../artifact-context-menu-service";
import { importComposerImage } from "../composer-attachment-service";
import type { LocalUpdateService } from "../local-update-service";
import type { ModelRuntimeService } from "../model-runtime-service";
import type { ModelStoreService, ModelStoreResult } from "../model-store-service";
import type { BrowserBridgeService } from "../browser-bridge-service";
import type { QuickOpenShortcutController } from "../quick-open-shortcut-controller";
import type { SettingsService } from "../settings-service";
import { createWorkspaceFolder, resolveWorkspaceSelection, resolveRegisteredWorkspaceSelection, setWorkspaceHidden, type WorkspaceRegistryOptions } from "../workspace-registry-service";
import { getWorkspaceGitContext } from "../workspace-git-context-service";
import { openWorkspaceInIde } from "../workspace-ide-service";
import { initializeGitRepository } from "../review-git-service";
import { commitAndPushWorkspaceChanges, commitWorkspaceChanges, createWorkspaceBranch, getWorkspaceEnvironment, pushWorkspaceBranch, switchWorkspaceBranch } from "../workspace-environment-service";
import { listWorkspaceOpenTools, openWorkspaceInTool } from "../workspace-open-service";
import { selectModelCatalog, type RuntimeV2OpenRouterCatalogService } from "./openrouter-catalog-service";
import type { ProviderNetworkService } from "./provider-network-service";
import type { DesktopRuntimeV2Registry } from "./runtime-registry";
import { installFixedRendererSkill, listFixedRendererSkills, uninstallFixedRendererSkill } from "./fixed-renderer-skills";
import {
  projectContextSnapshot,
  projectContextState,
  projectChatEvents,
  projectSubagentTranscript,
  projectSubagentList,
  projectIndexedUsageActivity,
  projectIndexedUsageStatistics,
} from "@actspace/client/sessions";
import { listVisualizationsV2, visualizeReplyV2 } from "./fixed-renderer-visualization";

export type FixedRendererIpcOptions = {
  readonly registry: DesktopRuntimeV2Registry;
  readonly roots: AppDataRoots;
  readonly settings: SettingsService;
  readonly models: ModelStoreService;
  readonly modelRuntime: ModelRuntimeService;
  readonly providerNetwork: ProviderNetworkService;
  readonly pricingCatalog?: import("../model-catalog-service").ModelCatalogService;
  readonly catalog: RuntimeV2OpenRouterCatalogService;
  readonly deepSeekCatalog?: RuntimeV2OpenRouterCatalogService;
  readonly kimiCatalog?: RuntimeV2OpenRouterCatalogService;
  readonly approvals: PendingApprovalRegistry;
  readonly browserBridge: BrowserBridgeService;
  readonly quickOpen: QuickOpenShortcutController;
  readonly localUpdate: LocalUpdateService;
  readonly getMainWindow: () => BrowserWindow | undefined;
  readonly log?: (message: string, details?: Record<string, unknown>) => void;
};

export type FixedRendererIpcRegistration = {
  readonly dispose: () => void;
  readonly requestQuickOpen: () => void;
};

export function registerFixedRendererIpc(options: FixedRendererIpcOptions): FixedRendererIpcRegistration {
  const channels: string[] = [];
  let pendingQuickOpen = false;
  let unsubscribeSettingsV4 = () => undefined;
  const handle = <T extends unknown[], R>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: T) => R | Promise<R>,
  ): void => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event, options.getMainWindow());
      return listener(event, ...(args as T));
    });
    channels.push(channel);
  };

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.bootstrapState, (): BootstrapState => ({
    appVersion: process.env.npm_package_version ?? "0.1.0",
    dataRoot: options.roots.dataRoot,
    sessionRoot: options.roots.sessionRoot,
    logRoot: options.roots.logRoot,
    tmpRoot: options.roots.tmpRoot,
    workspaceRoot: options.roots.workspaceRoot,
  }));

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listSessionPage, async (_event, input: import("@actspace/shared").SessionListPageInput = {}) => {
    const result = await options.registry.browseSessions();
    return paginateSessionSummaries(result, input);
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSessionToolDetail, (_event, input: { sessionId: string; callId: string }) => options.registry.browseToolDetail(input.sessionId, input.callId));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSessionPage, (_event, input: import("@actspace/shared/runtime-v2").RuntimeV2SessionProjectionInput) => options.registry.readSessionProjection(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listSessions, async (_event, input: { archived?: boolean } = {}) => {
    const items = await options.registry.listSessions();
    const selected = items.filter((item) => item.metadata.archived === (input.archived === true));
    return Promise.all(selected.map((item) => toSessionListItem(item, options.registry)));
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSession, async (_event, input: { sessionId: string }) => {
    try {
      return await options.registry.readSessionProjection({ sessionId: input.sessionId, afterSeq: -1, includeToolDetails: true });
    } catch {
      return null;
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSessionProjectionSnapshot, (_event, input: import("@actspace/shared/runtime-v2").RuntimeV2SessionProjectionInput) => options.registry.readSessionProjection(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSessionObservation, (_event, input: import("@actspace/shared/runtime-v2").RuntimeV2SessionProjectionInput) => options.registry.readSessionObservation(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSessionPreview, async (_event, input: { sessionId: string }) => {
    try {
      const snapshot = await options.registry.inspectSession(input.sessionId);
      const journal = await options.registry.inspectSessionEvents(input.sessionId);
      return {
        sessionId: snapshot.sessionId,
        workspaceRoot: snapshot.workspaceRoot ?? options.roots.workspaceRoot,
        contextSnapshot: projectContextSnapshot(snapshot, journal),
      };
    } catch {
      return null;
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createSession, async (_event, input: { title?: string; workspaceRoot?: string } = {}) => {
    let snapshot = await options.registry.createSession(undefined, input.workspaceRoot ?? options.roots.workspaceRoot);
    if (input.title?.trim()) {
      snapshot = await options.registry.updateSessionMetadata({ sessionId: snapshot.sessionId, title: input.title.trim() });
    }
    return options.registry.readSessionProjection({ sessionId: snapshot.sessionId });
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.forkSession, async (_event, input: { sessionId: string }) => {
    const parent = await options.registry.inspectSession(input.sessionId);
    const forked = await options.registry.forkSession({
      parentSessionId: input.sessionId,
      boundarySeq: parent.throughJournalSeq,
      newSessionId: randomUUID(),
    });
    return options.registry.readSessionProjection({ sessionId: forked.sessionId });
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.pinSession, async (_event, input: { sessionId: string; pinned: boolean }) => {
    await options.registry.updateSessionMetadata(input);
    return { ok: true };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.renameSession, async (_event, input: { sessionId: string; title: string }) => {
    await options.registry.updateSessionMetadata({ sessionId: input.sessionId, title: input.title.trim() || "New chat" });
    return { ok: true };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.setSessionWorkspace, async (_event, input: { sessionId: string; workspaceRoot?: string }) => {
    const snapshot = await options.registry.inspectSession(input.sessionId);
    const next = await registeredWorkspaceRoot(workspaceRegistryOptions(options.roots), input.workspaceRoot);
    if (snapshot.workspaceRoot === next) return { ok: true };
    await options.registry.updateSessionWorkspace(input.sessionId, next);
    return { ok: true };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.archiveSession, async (_event, input: { sessionId: string; archived: boolean }) => {
    await options.registry.updateSessionMetadata(input);
    return { ok: true };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.archiveSessions, async (_event, input: { sessionIds: string[] }) => {
    const archivedSessionIds: string[] = [];
    const failedSessionIds: string[] = [];
    for (const sessionId of new Set(input.sessionIds)) {
      try {
        await options.registry.updateSessionMetadata({ sessionId, archived: true });
        archivedSessionIds.push(sessionId);
      } catch {
        failedSessionIds.push(sessionId);
      }
    }
    return { ok: failedSessionIds.length === 0, archivedSessionIds, failedSessionIds };
  });

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.runAgent, async (_event, input: RunAgentInput): Promise<Omit<AgentRunResult, "events" | "contextSnapshot"> & { projection: RuntimeV2DesktopSessionProjection }> => {
    const content = await toRunContent(options.registry, input.sessionId, input.userInput, input.attachments ?? []);
    const result = await options.registry.runTurn({
      sessionId: input.sessionId,
      agentRunId: input.agentRunId,
      messageId: `user-${input.agentRunId}`,
      content,
      selectedSkillIds: input.selectedSkills,
      model: input.modelKey ?? input.model,
      mode: input.mode,
      thinkingEnabled: input.thinkingEnabled,
      reasoningEffort: input.reasoningEffort,
    });
    const snapshot = result.snapshot;
    const record = await options.registry.readSessionProjection({ sessionId: snapshot.sessionId });
    return {
      sessionId: input.sessionId,
      agentRunId: input.agentRunId,
      projection: record,
      finalReply: result.finalText ? {
        content: result.finalText,
        stopReason: result.reason === "aborted" ? "aborted" : result.reason === "failed" ? "error" : "stop",
        model: input.modelKey ?? input.model ?? "default",
        provider: "runtime-v2",
      } : undefined,

      status: result.reason === "aborted" ? "aborted" : result.reason === "failed" ? "failed" : "completed",
      ...(result.reason === "failed" ? { error: { code: "AGENT_RUN_FAILED", message: "The v2 Agent run failed." } } : {}),
    };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.abortAgentRun, (_event, input: { sessionId: string; agentRunId: string }) => {
    options.approvals.abortAgentRun(input.sessionId, input.agentRunId);
    return options.registry.abortRun(input.sessionId, "user");
  });

  const unsubscribeLive = options.registry.subscribe((envelope) => {
    if (envelope.event.kind === "runtime-live" || envelope.event.kind === "journal-update") usageSourceCaches.get(options.registry)?.invalidate();
    const target = options.getMainWindow();
    if (target === undefined || target.isDestroyed()) return;
    target.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.sessionLiveEvent, envelope);

  });

  const unsubscribeRendererStream = options.registry.subscribeRendererStream((event) => {
    const target = options.getMainWindow();
    if (target !== undefined && !target.isDestroyed()) target.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.agentStream, event);
  });

  registerFixedRendererSettings(options, handle);
  unsubscribeSettingsV4 = options.settings.subscribeV4Changes((notification: SettingsV4ChangedNotification) => {
    const target = options.getMainWindow();
    if (target !== undefined && !target.isDestroyed()) {
      target.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.settingsChangedV4, notification);
    }
  });
  registerFixedRendererHostCapabilities(options, handle);

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.quickOpenConsume, () => {
    if (!pendingQuickOpen) return null;
    pendingQuickOpen = false;
    return { requestedAt: new Date().toISOString() };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.quickOpenStatus, () => options.quickOpen.getStatus());
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.quickOpenUpdate, async (_event, input: { enabled?: boolean; accelerator?: string }) => {
    const current = options.settings.get().shortcuts!.quickOpen;
    const next = { ...current, ...input, accelerator: input.accelerator?.trim() || current.accelerator };
    const result = await options.quickOpen.update(current, next, () => options.settings.updateQuickOpenShortcut(next));
    return result.ok ? result : { ...result, settings: options.settings.get() };
  });

  const themeListener = (event: Electron.IpcMainEvent, mode: unknown) => {
    if (!isTrustedSender(event.sender.id, options.getMainWindow())) return;
    if (mode === "light" || mode === "dark" || mode === "system") nativeTheme.themeSource = mode;
  };
  ipcMain.on(RUNTIME_V2_FIXED_RENDERER_CHANNELS.setNativeTheme, themeListener);

  return {
    dispose: () => {
      unsubscribeLive();
      usageSourceCaches.delete(options.registry);
      unsubscribeRendererStream();
      unsubscribeSettingsV4();
      ipcMain.removeListener(RUNTIME_V2_FIXED_RENDERER_CHANNELS.setNativeTheme, themeListener);
      for (const channel of channels) ipcMain.removeHandler(channel);
    },
    requestQuickOpen: () => {
      pendingQuickOpen = true;
      const target = options.getMainWindow();
      if (target !== undefined && !target.isDestroyed()) {
        target.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.quickOpenRequested);
      }
    },
  };
}

type Handle = <T extends unknown[], R>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: T) => R | Promise<R>,
) => void;

function registerFixedRendererSettings(options: FixedRendererIpcOptions, handle: Handle): void {
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSettings, (): AppSettings => options.settings.get());
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSettingsV4, (): SettingsV4Snapshot => options.settings.getV4());
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateSettingsV4, async (_event, input: SettingsV4UpdateInput): Promise<SettingsV4UpdateResult> => {
    try {
      return { ok: true, snapshot: await options.settings.updateNamespaceV4(input) };
    } catch (error) {
      if (error instanceof Error && error.name === "SettingsRevisionConflictError" && "latest" in error) {
        const latest = (error as { latest: SettingsV4Snapshot }).latest;
        return { ok: false, code: "revision_conflict", latest, message: error.message };
      }
      throw error;
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createCustomConnection, (_event, input: CustomConnectionInput) => options.settings.createCustomConnection(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.removeCustomConnection, (_event, input: { connectionId: string }) => options.settings.removeCustomConnection(input.connectionId));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateCustomConnection, (_event, input: RuntimeV2UpdateCustomConnectionInput) => options.settings.updateCustomConnection(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateSettings, (_event, input: Parameters<SettingsService["update"]>[0]) => options.settings.update(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.setProviderKey, (_event, input: Parameters<SettingsService["setProviderKey"]>[0] extends never ? never : { provider: Parameters<SettingsService["setProviderKey"]>[0]; apiKey: string }) => options.settings.setProviderKey(input.provider, input.apiKey));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.clearProviderKey, (_event, input: { provider: Parameters<SettingsService["clearProviderKey"]>[0] }) => options.settings.clearProviderKey(input.provider));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateImageGeneration, async (_event, input: Parameters<SettingsService["updateImageGeneration"]>[0]) => {
    try {
      return { ok: true, settings: await options.settings.updateImageGeneration(input) };
    } catch (error) {
      return { ok: false, error: safeErrorMessage(error) };
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.testProviderConnection, async (_event, input: { provider: (typeof PROVIDER_IDS)[number] }) => {
    if (!isProviderId(input?.provider)) return { ok: false, message: "未知服务商。" };
    const runtime = options.settings.getProviderRuntimeConfig(input.provider);
    if ("code" in runtime) return { ok: false, message: runtime.message };
    const result = await options.providerNetwork.testConnection(runtime);
    await options.settings.markProviderConnectionResult(input.provider, result);
    return { ok: result.ok, message: result.message };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSearchUsage, () => options.settings.getSearchUsage());
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.readAgentSystemPrompt, () => options.settings.readAgentSystemPrompt());
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.writeAgentSystemPrompt, (_event, input: { content?: unknown }) => options.settings.writeAgentSystemPrompt(typeof input?.content === "string" ? input.content : ""));

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listProviders, () => ({
    providers: options.settings.getV2().providers,
    credentialStorage: options.settings.getCredentialStorageView(),
  }));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.connectProvider, async (_event, input: Parameters<SettingsService["updateProviderConnection"]>[0] & { apiKey?: string; managementKey?: string }): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerFailure("invalid_provider", "未知服务商。");
    try {
      await options.settings.updateProviderConnection({ ...input, enabled: true });
      return { ok: true, provider: options.settings.getV2().providers[input.provider] };
    } catch (error) {
      return providerFailure("write_failed", safeErrorMessage(error));
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateProvider, async (_event, input: Parameters<SettingsService["updateProviderConnection"]>[0]): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerFailure("invalid_provider", "未知服务商。");
    try {
      await options.settings.updateProviderConnection(input);
      return { ok: true, provider: options.settings.getV2().providers[input.provider] };
    } catch (error) {
      return providerFailure("write_failed", safeErrorMessage(error));
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.testProvider, async (_event, input: { provider: (typeof PROVIDER_IDS)[number] }): Promise<ProviderTestResult> => {
    if (!isProviderId(input?.provider)) return {
      ok: false,
      provider: emptyProviderView(),
      message: "未知服务商。",
      checkedAt: new Date().toISOString(),
      errorKind: "invalid_request",
    };
    const runtime = options.settings.getProviderRuntimeConfig(input.provider);
    if ("code" in runtime) return {
      ok: false,
      provider: options.settings.getV2().providers[input.provider],
      message: runtime.message,
      checkedAt: new Date().toISOString(),
      errorKind: "invalid_request",
    };
    const result = await options.providerNetwork.testConnection(runtime);
    await options.settings.markProviderConnectionResult(input.provider, result);
    return result.ok
      ? { ok: true, provider: options.settings.getV2().providers[input.provider], message: result.message, checkedAt: result.checkedAt }
      : { ok: false, provider: options.settings.getV2().providers[input.provider], message: result.message, checkedAt: result.checkedAt, errorKind: result.errorKind ?? "network", ...(result.statusCode ? { statusCode: result.statusCode } : {}) };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.disconnectProvider, async (_event, input: { provider: (typeof PROVIDER_IDS)[number] }): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerFailure("invalid_provider", "未知服务商。");
    try {
      await options.settings.updateProviderConnection({ provider: input.provider, apiKey: null, ...(input.provider === "openrouter" ? { managementKey: null } : {}) });
      return { ok: true, provider: options.settings.getV2().providers[input.provider] };
    } catch (error) {
      return providerFailure("write_failed", safeErrorMessage(error));
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.removeProvider, async (_event, input: { provider: (typeof PROVIDER_IDS)[number] }): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerFailure("invalid_provider", "未知服务商。");
    try {
      await options.settings.removeProvider(input.provider);
      return { ok: true, provider: options.settings.getV2().providers[input.provider] };
    } catch (error) {
      return providerFailure("write_failed", safeErrorMessage(error));
    }
  });

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.addProviderCredential, async (_event, input: Parameters<SettingsService["addProviderCredential"]>[0]) => {
    try {
      await options.settings.addProviderCredential(input);
      return { ok: true, provider: options.settings.getV2().providers[input.provider] };
    } catch (error) {
      return { ok: false, error: { code: "write_failed", message: safeErrorMessage(error) } };
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateProviderCredential, async (_event, input: { provider: (typeof PROVIDER_IDS)[number]; credentialId: string; label: string; pricingMultiplier?: number }) => {
    const result = await options.settings.updateProviderCredential(input.provider, input.credentialId, input.label, input.pricingMultiplier);
    return "code" in result
      ? { ok: false, error: { code: result.code, message: result.message, references: result.references } }
      : { ok: true, provider: options.settings.getV2().providers[input.provider] };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.testProviderCredential, async (_event, input: { provider: (typeof PROVIDER_IDS)[number]; credentialId: string }) => {
    const runtime = options.settings.getProviderRuntimeConfigForCredential(input.provider, input.credentialId);
    if ("code" in runtime) return { ok: false, error: { code: "credential_not_found", message: runtime.message } };
    const probe = await options.providerNetwork.testConnection(runtime);
    const marked = await options.settings.markProviderCredentialConnectionResult(input.provider, input.credentialId, probe);
    if ("code" in marked) return { ok: false, error: { code: marked.code, message: marked.message } };
    return probe.ok
      ? { ok: true, provider: options.settings.getV2().providers[input.provider] }
      : { ok: false, error: { code: "connection_failed", message: probe.message, errorKind: probe.errorKind } };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.removeProviderCredential, async (_event, input: { provider: (typeof PROVIDER_IDS)[number]; credentialId: string }) => {
    const result = await options.settings.removeProviderCredential(input.provider, input.credentialId);
    return "code" in result
      ? { ok: false, error: { code: result.code, message: result.message, references: result.references } }
      : { ok: true, provider: options.settings.getV2().providers[input.provider] };
  });

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getProviderBalance, (_event, input: { provider: "deepseek" | "kimi" | "openrouter" }) => providerBalance(options, input.provider));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getDeepSeekBalance, () => providerBalance(options, "deepseek"));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getKimiBalance, () => providerBalance(options, "kimi"));

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listInstalledModels, () => ({ models: options.models.listInstalledModels() }));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listUsableModels, (_event, input: { purpose?: "chat" | "utility" | "explore" | "vision" }) => ({ models: options.modelRuntime.listUsableModels(input?.purpose ?? "chat") }));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getPricingCatalog, () => options.pricingCatalog?.status() ?? null);
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.refreshPricingCatalog, (_event, input: { force?: boolean } = {}) => options.pricingCatalog?.refresh(input.force === true) ?? null);
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listModelCatalog, (_event, input: { provider?: string; query?: string } = {}) => {
    const { provider, catalog } = selectModelCatalog(input.provider, options.catalog, options.deepSeekCatalog, options.kimiCatalog);
    return { provider, ...catalog.list(input.query) };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.reloadModelCatalog, async (_event, input: { provider?: string; query?: string } = {}) => {
    const { provider, catalog } = selectModelCatalog(input.provider, options.catalog, options.deepSeekCatalog, options.kimiCatalog);
    const runtime = options.settings.getProviderRuntimeConfig(provider);
    if ("code" in runtime) return { provider, ...catalog.list(), error: { code: runtime.code, message: runtime.message } };
    const result = await catalog.reload(runtime);
    if (!result.error && result.state === "fresh") await options.models.refreshInstalledCatalogModels(provider);
    return { provider, ...result };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.addModel, async (_event, input: { provider: string; apiModel: string }) => {
    if ((input?.provider !== "openrouter" && input?.provider !== "deepseek" && input?.provider !== "kimi") || typeof input.apiModel !== "string") return { ok: false, error: { code: "invalid_model", message: "模型添加参数无效。" } };
    return toModelMutationResult(await options.models.addCatalogModel(input.provider, input.apiModel));
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateModel, async (_event, input: import("@actspace/shared").ModelsUpdateInput) => {
    const key = normalizeModelKey(input?.modelKey);
    if (!key) return { ok: false, error: { code: "invalid_model", message: "模型标识无效。" } };
    return toModelMutationResult(await options.models.updateModelSettings(key, input));
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.removeModel, async (_event, input: { modelKey: string }) => {
    const key = normalizeModelKey(input?.modelKey);
    if (!key) return { ok: false, error: { code: "invalid_model", message: "模型标识无效。" } };
    return toModelMutationResult(await options.models.removeModel(key));
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateTaskModels, async (_event, input: Parameters<SettingsService["updateV2"]>[0]["taskModels"]) => {
    const next = await options.settings.updateV2({ taskModels: input });
    return { taskModels: next.taskModels };
  });
}

function registerFixedRendererHostCapabilities(options: FixedRendererIpcOptions, handle: Handle): void {
  const registryOptions = workspaceRegistryOptions(options.roots);
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectFiles, async () => {
    const result = await dialog.showOpenDialog(options.getMainWindow(), { properties: ["openFile", "multiSelections"] });
    return { canceled: result.canceled, attachments: result.filePaths.map((path) => ({ id: `att_${randomUUID()}`, kind: "file" as const, path, name: path.split(/[\\/]/).at(-1) ?? path })) };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectImages, async () => {
    const result = await dialog.showOpenDialog(options.getMainWindow(), {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    const images = await Promise.all(result.filePaths.map(async (path) => ({
      id: `att_${randomUUID()}`,
      kind: "image" as const,
      path,
      name: path.split(/[\\/]/).at(-1) ?? path,
      previewUrl: await imagePreviewDataUrl(path),
    })));
    return { canceled: result.canceled, attachments: images };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.importComposerImage, (_event, input: Parameters<typeof importComposerImage>[0]) => importComposerImage(input, options.roots.tmpRoot, imagePreviewDataUrl));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectWorkspaceDirectory, async (_event, input: import("@actspace/shared").SelectWorkspaceDirectoryInput = {}): Promise<SelectWorkspaceDirectoryResult> => {
    const result = await dialog.showOpenDialog(options.getMainWindow(), { properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    if (!input.registerWorkspace) return { canceled: false, workspaceRoot: result.filePaths[0] };
    const resolved = await resolveWorkspaceSelection(registryOptions, { workspaceRoot: result.filePaths[0] });
    if (resolved.ok === false) throw new Error(resolved.error);
    return { canceled: false, workspaceRoot: resolved.workspaceRoot };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.openWorkspaceInIde, (_event, input: { workspaceId: string }) => openWorkspaceInIde(registryOptions, input.workspaceId));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.setWorkspaceVisibility, (_event, input: { workspaceId: string; hidden: boolean }) => setWorkspaceHidden(registryOptions, input.workspaceId, input.hidden));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getWorkspaceGitContext, async (_event, input: { workspaceRoot?: string }) => getWorkspaceGitContext(input?.workspaceRoot ?? options.roots.workspaceRoot));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceFolder, (_event, input: { parentRoot: string; name: string }) => createWorkspaceFolder(registryOptions, input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.readSessionArtifact, async (_event, input: { sessionId: string; artifactPath: string }) => {
    try {
      const artifact = await options.registry.resolveArtifact(input.sessionId, input.artifactPath);
      if (!isSupportedSessionImageMime(artifact.mediaType)) {
        return { name: "", relativePath: "", size: artifact.bytes.byteLength, error: "unsupported_format" as const };
      }
      if (artifact.bytes.byteLength > 25 * 1024 * 1024) {
        return { name: "", relativePath: "", mimeType: artifact.mediaType, size: artifact.bytes.byteLength, error: "too_large" as const };
      }
      return {
        name: input.artifactPath,
        relativePath: input.artifactPath,
        mimeType: artifact.mediaType,
        size: artifact.bytes.byteLength,
        dataUrl: `data:${artifact.mediaType};base64,${Buffer.from(artifact.bytes).toString("base64")}`,
      };
    } catch {
      return { name: "", relativePath: "", size: 0, error: "not_found" as const };
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.showArtifactContextMenu, async (_event, input: ArtifactContextMenuInput) => {
    if (input.kind === "workspace_file") return showArtifactContextMenu(input, options.roots, options.getMainWindow());
    try {
      const artifact = await options.registry.resolveArtifact(input.sessionId, input.artifactPath);
      if (!isSupportedSessionImageMime(artifact.mediaType) || artifact.bytes.byteLength > 25 * 1024 * 1024) {
        return { shown: false, error: "invalid_target" as const };
      }
      return showResolvedArtifactContextMenu({
        kind: "session_image",
        path: artifact.path,
        size: artifact.bytes.byteLength,
        sessionImageDataUrl: `data:${artifact.mediaType};base64,${Buffer.from(artifact.bytes).toString("base64")}`,
      }, options.getMainWindow());
    } catch {
      return { shown: false, error: "invalid_target" as const };
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.initGitRepository, async (_event, input: { workspaceRoot?: string } = {}) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return initializeGitRepository({ ...input, workspaceRoot }, options.roots);
  });

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getWorkspaceEnvironment, async (_event, input: { workspaceRoot?: string } = {}) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return getWorkspaceEnvironment({ ...input, workspaceRoot }, options.roots);
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceBranch, async (_event, input: Parameters<typeof createWorkspaceBranch>[0]) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return createWorkspaceBranch({ ...input, workspaceRoot }, options.roots);
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.switchWorkspaceBranch, async (_event, input: Parameters<typeof switchWorkspaceBranch>[0]) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return switchWorkspaceBranch({ ...input, workspaceRoot }, options.roots);
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.commitWorkspaceChanges, async (_event, input: Parameters<typeof commitWorkspaceChanges>[0]) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return commitWorkspaceChanges({ ...input, workspaceRoot }, options.roots);
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.pushWorkspaceBranch, async (_event, input: Parameters<typeof pushWorkspaceBranch>[0]) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return pushWorkspaceBranch({ ...input, workspaceRoot }, options.roots);
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.commitAndPushWorkspaceChanges, async (_event, input: Parameters<typeof commitAndPushWorkspaceChanges>[0]) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return commitAndPushWorkspaceChanges({ ...input, workspaceRoot }, options.roots);
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaceOpenTools, () => listWorkspaceOpenTools());
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.openWorkspaceInTool, async (_event, input: Parameters<typeof openWorkspaceInTool>[0]) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return openWorkspaceInTool({ ...input, workspaceRoot }, options.roots);
  });

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listPendingApprovals, (_event, input: { sessionId?: string } = {}): PendingApprovalInfo[] => options.approvals.listPending(input.sessionId).map((request) => ({
    requestId: request.id,
    toolName: request.toolName,
    summary: request.summary,
    reason: request.reason,
    riskLevel: request.riskLevel,
    command: typeof request.args.command === "string" ? request.args.command : undefined,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
  })));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.submitApproval, (_event, input: { requestId: string; decision: "approve_once" | "deny" }) => options.approvals.decide(input.requestId, input.decision));

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getBrowserBridgeStatus, () => options.browserBridge.getStatus());
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.installBrowserBridgeFromRepo, (_event, input: { repoRoot: string }) => options.browserBridge.buildAndInstall(input.repoRoot));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.installBrowserBridgeNativeHost, () => options.browserBridge.installNativeHost());

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listSkills, (_event, input: { workspaceRoot?: string } = {}) => listFixedRendererSkills({
    dataRoot: options.roots.dataRoot,
    workspaceRoot: input.workspaceRoot ?? options.roots.workspaceRoot,
    homeDir: homedir(),
    disabled: options.settings.get().skills.disabled,
  }));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.installSkill, async () => {
    const result = await dialog.showOpenDialog(options.getMainWindow(), { title: "选择 Skill 目录（需包含 SKILL.md）", properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    return installFixedRendererSkill(options.roots.dataRoot, result.filePaths[0]);
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.uninstallSkill, (_event, input: { directory: string }) => uninstallFixedRendererSkill(options.roots.dataRoot, input.directory));

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getLocalUpdateState, () => options.localUpdate.getState());
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectLocalUpdateSource, async () => {
    const result = await dialog.showOpenDialog(options.getMainWindow(), { title: "选择 actspace 源码目录", properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, state: await options.localUpdate.getState() };
    return { canceled: false, state: await options.localUpdate.setSourceRoot(result.filePaths[0]) };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.startLocalUpdate, () => options.localUpdate.start());

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.describeContext, async (_event, input: { sessionId: string }) => {
    try {
      const snapshot = await options.registry.inspectSession(input.sessionId);
      return projectContextState(snapshot, await options.registry.inspectSessionEvents(input.sessionId));
    } catch {
      return null;
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getUsageStatistics, (_event, input: UsageStatisticsGetInput) => createUsageStatistics(options.registry, options.roots.dataRoot, input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getUsageActivity, (_event, input: UsageStatisticsGetInput) => createUsageActivity(options.registry, options.roots.dataRoot, input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSubagents, async (_event, input: { sessionId: string }) => {
    return projectSubagentList(await options.registry.inspectSession(input.sessionId), await options.registry.inspectSessionEvents(input.sessionId));
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSubAgentTranscript, async (_event, input: { transcriptRef: { runId: string } }) => {
    const snapshot = await options.registry.inspectSession(input.transcriptRef.runId);
    const journal = await options.registry.inspectSessionEvents(input.transcriptRef.runId);
    return projectSubagentTranscript(snapshot, journal);
  });

  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.compactContext, async (_event, input: { sessionId: string; agentRunId: string }) => {
    const result = await options.registry.compactSession(input.sessionId);
    return {
      sessionId: input.sessionId,
      agentRunId: input.agentRunId,
      status: result.compacted ? "compacted" : "skipped",
      events: projectChatEvents(result.snapshot, await options.registry.inspectSessionEvents(input.sessionId)),
      contextSnapshot: projectContextSnapshot(result.snapshot, await options.registry.inspectSessionEvents(input.sessionId)),
    };
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.visualizeReply, (_event, input: Parameters<typeof visualizeReplyV2>[0]) => visualizeReplyV2(input, options.roots, options.registry));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listVisualizations, (_event, input: { sessionId: string }) => listVisualizationsV2(input.sessionId, options.roots, options.registry));
}

async function toSessionListItem(item: RuntimeV2SessionListItem, registry: DesktopRuntimeV2Registry): Promise<SessionListItem> {
  const agentRunCount = item.completedTurnCount ?? 0;
  return {
    id: item.sessionId,
    title: item.metadata.title ?? "New chat",
    updatedAt: item.updatedAt,
    accessState: item.accessState,
    isChildSession: item.lineage !== null,
    agentRunCount,
    workspaceRoot: item.workspaceRoot ?? undefined,
    pinned: item.metadata.pinned,
    archived: item.metadata.archived,
  };
}

async function toRunContent(
  registry: DesktopRuntimeV2Registry,
  sessionId: string,
  userInput: string,
  attachments: readonly ComposerAttachment[],
): Promise<RuntimeV2JsonValue> {
  if (attachments.length === 0) return userInput;
  const blocks: RuntimeV2JsonValue[] = userInput ? [{ type: "text", text: userInput }] : [];
  for (const attachment of attachments) {
    if (!attachment.path) continue;
    const imported = await registry.importAttachment(sessionId, attachment.path);
    if (attachment.kind === "image") {
      blocks.push({ type: "artifact", artifact: { artifactId: imported.artifactId, mediaType: imported.mimeType }, label: imported.name });
    } else {
      blocks.push({ type: "text", text: `Attached file: ${imported.name} (${imported.artifactId})` });
    }
  }
  return blocks;
}

function workspaceRegistryOptions(roots: AppDataRoots): WorkspaceRegistryOptions {
  return {
    dataRoot: roots.dataRoot,
    defaultWorkspaceRoot: roots.defaultWorkspaceRoot,
    fallbackWorkspaceRoot: roots.workspaceRoot,
  };
}

async function registeredWorkspaceRoot(options: WorkspaceRegistryOptions, requested?: string): Promise<string> {
  const resolved = await resolveRegisteredWorkspaceSelection(options, { workspaceRoot: requested ?? options.defaultWorkspaceRoot });
  if (resolved.ok === false) throw new Error(resolved.error);
  return resolved.workspaceRoot;
}

async function providerBalance(options: FixedRendererIpcOptions, provider: "deepseek" | "kimi" | "openrouter") {
  const runtime = provider === "openrouter"
    ? options.settings.getOpenRouterManagementRuntimeConfig()
    : options.settings.getProviderRuntimeConfig(provider);
  if ("code" in runtime) {
    if (runtime.code === "api_key_missing") return options.providerNetwork.getBalance(provider, undefined);
    throw new Error(runtime.message);
  }
  return options.providerNetwork.getBalance(provider, runtime);
}

function providerFailure(code: "invalid_provider" | "write_failed", message: string): ProviderOperationResult {
  return { ok: false, error: { code, message } };
}

function emptyProviderView(): AppSettings["providers"]["deepseek"] {
  return {
    hasApiKey: false,
    enabled: false,
    baseUrl: null,
    proxy: { enabled: false, url: null },
    lastConnection: { status: "untested" },
    installedModelCount: 0,
    enabledModelCount: 0,
    additionalCredentials: [],
  };
}

function toModelMutationResult(result: ModelStoreResult) {
  if (result.ok === true) return { ok: true as const, ...(result.model ? { model: result.model } : {}) };
  const code = result.code === "model_not_found" || result.code === "model_not_installed"
    ? "model_missing"
    : result.code === "model_in_use"
      ? "model_in_use"
      : result.code === "model_not_removable"
        ? "model_not_removable"
        : result.code === "credential_missing"
          ? "credential_missing"
          : result.code === "invalid_model" || result.code === "invalid_provider"
            ? "invalid_model"
            : "write_failed";
  return { ok: false as const, error: { code, message: result.message, ...(result.references ? { references: result.references } : {}) } };
}

async function createUsageStatistics(
  registry: DesktopRuntimeV2Registry,
  dataRoot: string,
  input: UsageStatisticsGetInput,
): Promise<UsageStatisticsSnapshot | null> {
  let cache = usageSourceCaches.get(registry);
  if (!cache) { cache = new UsageSourceCache(registry, dataRoot); usageSourceCaches.set(registry, cache); }
  return projectIndexedUsageStatistics(await cache.read(), input);
}

const usageSourceCaches = new WeakMap<DesktopRuntimeV2Registry, UsageSourceCache>();

async function createUsageActivity(registry: DesktopRuntimeV2Registry, dataRoot: string, input: UsageStatisticsGetInput): Promise<UsageActivitySnapshot | null> {
  let cache = usageSourceCaches.get(registry);
  if (!cache) { cache = new UsageSourceCache(registry, dataRoot); usageSourceCaches.set(registry, cache); }
  return projectIndexedUsageActivity(await cache.read(), { ...input, search: input.search?.slice(0, 300) });
}

async function imagePreviewDataUrl(path: string): Promise<string | undefined> {
  try {
    const image = nativeImage.createFromPath(path);
    return image.isEmpty() ? undefined : image.toDataURL();
  } catch {
    return undefined;
  }
}

function isProviderId(value: unknown): value is (typeof PROVIDER_IDS)[number] {
  return PROVIDER_IDS.includes(value as (typeof PROVIDER_IDS)[number]);
}

function isSupportedSessionImageMime(value: string): value is "image/png" | "image/jpeg" | "image/webp" {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTrustedSender(senderId: number, mainWindow: BrowserWindow | undefined): boolean {
  return mainWindow !== undefined && !mainWindow.isDestroyed() && senderId === mainWindow.webContents.id;
}

function assertTrustedSender(event: IpcMainInvokeEvent, mainWindow: BrowserWindow | undefined): void {
  if (!isTrustedSender(event.sender.id, mainWindow)) throw new Error("Runtime v2 fixed renderer IPC rejected an untrusted sender.");
}
