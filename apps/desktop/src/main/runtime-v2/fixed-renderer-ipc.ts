import { validateRunReferences as validateSharedRunReferences } from "@actspace/shared/composer-reference-validation";
import type { RemoteDesktopAdapter } from "../remote-hosts/desktop-adapter";
import { createSessionGateway } from "../session-gateway";
import { paginateSessionSummaries } from "./session-list-page";
import { UsageSourceCache } from "./usage-source-cache";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import { dialog, nativeImage, nativeTheme, shell, type BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import {
  PROVIDER_IDS,
  fileReferenceBlocks,
  normalizeModelKey,
  responseExcerptBlocks,
  type ComposerReferenceIssue,
  type FileReference,
  type ResponseAnnotationReference,
  type AgentRunResult,
  type AppSettings,
  type ArtifactContextMenuInput,
  type BootstrapState,
  type ComposerAttachment,
  type PendingApprovalInfo,
  type ModelMutationResult,
  type ProviderBalanceSnapshot,
  type ProviderCredentialOperationResult,
  type ProviderOperationResult,
  type ProviderTestResult,
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
  type CustomConnectionTestInput,
  type CustomConnectionProbeInput,
} from "@actspace/shared";
import {
  RUNTIME_V2_FIXED_RENDERER_CHANNELS,
  type RuntimeV2JsonValue,
  type RuntimeV2SessionListItem,
  type RuntimeV2SessionSnapshot,
  type RuntimeV2DesktopSessionProjection,
  type TaskSubmissionResult,
} from "@actspace/shared/runtime-v2";
import type { RuntimeV2UpdateCustomConnectionInput } from "@actspace/shared/runtime-v2";
import type { AppDataRoots } from "../app-paths";
import { createIpcRegistrar, type IpcRegistrar } from "../ipc/registry";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import type { PendingApprovalRegistry } from "../approval-registry";
import { showArtifactContextMenu, showResolvedArtifactContextMenu } from "../artifact-context-menu-service";
import { importComposerImage } from "../composer-attachment-service";
import { resolveWorkspaceFileReference } from "../workspace-file-reference";
import type { LocalUpdateService } from "../local-update-service";
import type { ModelRuntimeService } from "../model-runtime-service";
import type { ModelStoreService, ModelStoreResult } from "../model-store-service";
import type { BrowserBridgeService } from "../browser-bridge-service";
import type { QuickOpenShortcutController } from "../quick-open-shortcut-controller";
import type { SettingsService } from "../settings-service";
import { createWorkspaceFolder, resolveWorkspaceSelection, setWorkspaceHidden } from "../workspace-registry-service";
import { createWorkspaceAccessDeps, registeredWorkspaceRoot, resolveWorkspaceAccess, workspaceRegistryOptions, WORKSPACE_NOT_REGISTERED } from "../workspace-access";
import { getWorkspaceGitContext } from "../workspace-git-context-service";
import { openWorkspaceInIde } from "../workspace-ide-service";
import { initializeGitRepository } from "../review-git-service";
import { commitAndPushWorkspaceChanges, commitWorkspaceChanges, createWorkspaceBranch, getWorkspaceEnvironment, pushWorkspaceBranch, switchWorkspaceBranch } from "../workspace-environment-service";
import { listWorkspaceOpenTools, openWorkspaceInTool } from "../workspace-open-service";
import { selectModelCatalog, type RuntimeV2OpenRouterCatalogService } from "./openrouter-catalog-service";
import type { ProviderNetworkService } from "./provider-network-service";
import { probeCustomConnection } from "./custom-connection-probe";
import { ChatAttachmentValidationError, type DesktopRuntimeV2Registry } from "./runtime-registry";
import { installFixedRendererSkill, listFixedRendererSkills, uninstallFixedRendererSkill } from "./fixed-renderer-skills";
import {
  projectContextSnapshot,
  projectContextState,
  projectChatEvents,
  projectSubagentTranscript,
  projectSubagentList,
  projectIndexedUsageActivity,
  projectIndexedUsageStatistics,
  toolPreview,
} from "@actspace/client/sessions";
import { listVisualizationsV2, visualizeReplyV2 } from "./fixed-renderer-visualization";

export type FixedRendererIpcOptions = {
  readonly registry: DesktopRuntimeV2Registry;
  readonly remote?: RemoteDesktopAdapter;
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
  let pendingQuickOpen = false;
  let unsubscribeSettingsV4 = () => undefined;
  const ipc = createIpcRegistrar({
    getWindow: options.getMainWindow,
    untrustedMessage: "Runtime v2 fixed renderer IPC rejected an untrusted sender.",
    // 本机 / 远端分流见 session-gateway（15 T9）。
    middleware: createSessionGateway(options.remote),
  });

  ipc.handle(contract.app.getBootstrapState, (): BootstrapState => ({
    appVersion: process.env.npm_package_version ?? "0.1.0",
    dataRoot: options.roots.dataRoot,
    sessionRoot: options.roots.sessionRoot,
    logRoot: options.roots.logRoot,
    tmpRoot: options.roots.tmpRoot,
    workspaceRoot: options.roots.workspaceRoot,
  }));

  ipc.handle(contract.sessions.listPage, async (input = {}) => {
    if (input.hostId) return { items: [], groups: [], indexing: false, failed: 0 };
    const result = await options.registry.browseSessions();
    return paginateSessionSummaries(result, input);
  });
  ipc.handle(contract.sessions.getToolDetail, (input) => options.registry.browseToolDetail(input.sessionId, input.callId));
  ipc.handle(contract.sessions.getPage, (input) => options.registry.readSessionProjection(input));
  ipc.handle(contract.sessions.list, async (input = {}) => {
    const items = await options.registry.listSessions();
    const selected = items.filter((item) => item.metadata.archived === (input.archived === true));
    return Promise.all(selected.map((item) => toSessionListItem(item, options.registry)));
  });
  ipc.handle(contract.sessions.get, async (input) => {
    try {
      return await options.registry.readSessionProjection({ sessionId: input.sessionId, afterSeq: -1, includeToolDetails: true });
    } catch {
      return null;
    }
  });
  ipc.handle(contract.sessions.getProjectionSnapshot, (input) => options.registry.readSessionProjection(input));
  ipc.handle(contract.sessions.getObservation, (input) => options.registry.readSessionObservation(input));
  ipc.handle(contract.sessions.getPreview, async (input) => {
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
  ipc.handle(contract.sessions.create, async (input = {}) => {
    const workspaceRoot = await registeredWorkspaceRoot(workspaceRegistryOptions(options.roots), input.workspaceRoot ?? options.roots.workspaceRoot);
    let snapshot = await options.registry.createSession(undefined, workspaceRoot, input.agentForm);
    if (input.title?.trim()) {
      snapshot = await options.registry.updateSessionMetadata({ sessionId: snapshot.sessionId, title: input.title.trim() });
    }
    return options.registry.readSessionProjection({ sessionId: snapshot.sessionId });
  });
  ipc.handle(contract.sessions.fork, async (input) => {
    const parent = await options.registry.inspectSession(input.sessionId);
    const forked = await options.registry.forkSession({
      parentSessionId: input.sessionId,
      boundarySeq: parent.throughJournalSeq,
      newSessionId: randomUUID(),
    });
    return options.registry.readSessionProjection({ sessionId: forked.sessionId });
  });
  ipc.handle(contract.sessions.pin, async (input) => {
    await options.registry.updateSessionMetadata(input);
    return { ok: true };
  });
  ipc.handle(contract.sessions.rename, async (input) => {
    await options.registry.updateSessionMetadata({ sessionId: input.sessionId, title: input.title.trim() || "New chat" });
    return { ok: true };
  });
  ipc.handle(contract.sessions.setWorkspace, async (input) => {
    const snapshot = await options.registry.inspectSession(input.sessionId);
    const next = await registeredWorkspaceRoot(workspaceRegistryOptions(options.roots), input.workspaceRoot);
    if (snapshot.workspaceRoot === next) return { ok: true };
    await options.registry.updateSessionWorkspace(input.sessionId, next);
    return { ok: true };
  });
  ipc.handle(contract.sessions.setPermissionMode, async (input) => {
    if (input.mode !== "default" && input.mode !== "full-access") return { ok: false, error: "invalid_permission_mode" };
    try {
      const snapshot = await options.registry.updateSessionPermissionMode(input.sessionId, input.mode);
      return { ok: true, mode: snapshot.permissionMode };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipc.handle(contract.sessions.setAgentMode, async (input) => {
    try {
      const snapshot = await options.registry.updateSessionAgentMode(input.sessionId, input.mode, input.expectedRevision);
      return { ok: true, mode: snapshot.agentMode, revision: snapshot.agentModeRevision };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipc.handle(contract.sessions.revokeGrant, async (input) => {
    if (!input.sessionId || !input.grantId) return { ok: false, error: "invalid_grant_revoke" };
    try {
      await options.registry.revokeSessionGrant(input.sessionId, input.grantId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipc.handle(contract.sessions.archive, async (input) => {
    await options.registry.updateSessionMetadata(input);
    return { ok: true };
  });
  ipc.handle(contract.sessions.archiveMany, async (input) => {
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

  ipc.handle(contract.tasks.command, async (input) => options.registry.taskCommand(input));
  // Serialize duplicate preparation too: importing the same attachment twice must not change content identity.
  const submissions = new Map<string, Promise<unknown>>();
  ipc.handle(contract.tasks.submit, async (input) => {
    const key = `${input.sessionId}/${input.submissionId}`;
    const previous = submissions.get(key) ?? Promise.resolve();
    const attempt = previous.catch(() => undefined).then(async (): Promise<TaskSubmissionResult> => {
      const original = { userInput: input.userInput, attachments: input.attachments ?? [], fileReferences: input.fileReferences ?? [], responseAnnotations: input.responseAnnotations ?? [] };
      const { snapshot } = await options.registry.taskCommand({ op: "snapshot", sessionId: input.sessionId });
      const existing = snapshot.tasks.find(task => task.submissionId === input.submissionId);
      if (existing) {
        const content = existing.content as import("@actspace/shared/runtime-v2").TaskContentEnvelope;
        if (content?.kind !== "composer-task" || !isDeepStrictEqual(content.original, JSON.parse(JSON.stringify(original)))) throw new Error("SUBMISSION_CONFLICT");
        return options.registry.submitTask(input.sessionId, input.submissionId, existing.content);
      }
      const references = await validateRunReferences(options.registry, input);
      if (references.ok === false) return { status: "submission-failed", acknowledgement: "rejected", message: "消息引用已失效，请检查后重试。", referenceIssue: references.issue };
      let prepared: Awaited<ReturnType<typeof toRunContent>>;
      try {
        prepared = await toRunContent(options.registry, input.sessionId, { userInput: input.userInput, attachments: input.attachments ?? [], fileReferences: references.fileReferences, responseAnnotations: references.responseAnnotations });
      } catch (error) {
        // Preparation has not attempted Task admission, so its failure is a definite rejection.
        // Keep errors from submitTask below outside this catch: a lost reply may hide an accepted Task.
        if (!(error instanceof ChatAttachmentValidationError)) return {
          status: "submission-failed", acknowledgement: "rejected",
          message: `附件准备失败，草稿已保留。${error instanceof Error ? error.message : "请检查附件后重试。"}`,
        };
        const attachments = (input.attachments ?? []).filter(attachment => Boolean(attachment.path));
        return { status: "submission-failed", acknowledgement: "rejected", message: "附件校验失败，请检查后重试。", attachmentIssue: {
          ...error.issue,
          ...(error.attachmentIndex === undefined ? {} : { attachmentId: attachments[error.attachmentIndex]?.id }),
          ...(error.textCharacterCounts === undefined ? {} : { textCharacterCounts: Object.fromEntries(attachments.map((attachment, index) => [attachment.id, error.textCharacterCounts![index] ?? 0])) }),
        } };
      }
      // Once admission is attempted a missing reply is uncertain; never delete imported content needed by a durable Task.
      return options.registry.submitTask(input.sessionId, input.submissionId, { kind: "composer-task", original: JSON.parse(JSON.stringify(original)), prepared: prepared.content });
    });
    submissions.set(key, attempt);
    try { return await attempt; } finally { if (submissions.get(key) === attempt) submissions.delete(key); }
  });

  ipc.handle(contract.tasks.abort, async (input) => {
    options.approvals.abortAgentRun(input.sessionId, input.agentRunId);
    const state = await options.registry.taskCommand({ op: "snapshot", sessionId: input.sessionId });
    if (!state.snapshot.runs.some(run => run.runId === input.agentRunId && run.state === "running")) return false;
    await options.registry.taskCommand({ op: "stop", sessionId: input.sessionId, runId: input.agentRunId });
    return true;
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

  registerFixedRendererSettings(options, ipc);
  unsubscribeSettingsV4 = options.settings.subscribeV4Changes((notification: SettingsV4ChangedNotification) => {
    const target = options.getMainWindow();
    if (target !== undefined && !target.isDestroyed()) {
      target.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.settingsChangedV4, notification);
    }
  });
  registerFixedRendererHostCapabilities(options, ipc);

  ipc.handle(contract.quickOpen.consume, () => {
    if (!pendingQuickOpen) return null;
    pendingQuickOpen = false;
    return { requestedAt: new Date().toISOString() };
  });
  ipc.handle(contract.quickOpen.getShortcutStatus, () => options.quickOpen.getStatus());
  ipc.handle(contract.quickOpen.updateShortcut, async (input) => {
    const current = options.settings.get().shortcuts!.quickOpen;
    const next = { ...current, ...input, accelerator: input.accelerator?.trim() || current.accelerator };
    const result = await options.quickOpen.update(current, next, () => options.settings.updateQuickOpenShortcut(next));
    return result.ok ? result : { ...result, settings: options.settings.get() };
  });

  ipc.on(contract.appearance.setNativeTheme, (mode) => {
    if (mode === "light" || mode === "dark" || mode === "system") nativeTheme.themeSource = mode;
  });

  return {
    dispose: () => {
      unsubscribeLive();
      usageSourceCaches.delete(options.registry);
      unsubscribeRendererStream();
      unsubscribeSettingsV4();
      ipc.dispose();
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

function registerFixedRendererSettings(options: FixedRendererIpcOptions, ipc: IpcRegistrar): void {
  ipc.handle(contract.settings.get, (): AppSettings => options.settings.get());
  ipc.handle(contract.settings.getV4, (): SettingsV4Snapshot => options.settings.getV4());
  ipc.handle(contract.settings.updateV4, async (input): Promise<SettingsV4UpdateResult> => {
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
  ipc.handle(contract.settings.createCustomConnection, (input) => options.settings.createCustomConnection(input));
  ipc.handle(contract.settings.removeCustomConnection, (input) => options.settings.removeCustomConnection(input.connectionId));
  ipc.handle(contract.settings.updateCustomConnection, (input) => options.settings.updateCustomConnection(input));
  ipc.handle(contract.settings.testCustomConnection, async (input) => {
    const runtime = options.settings.getCustomConnectionRuntimeConfig(input.connectionId);
    if ("code" in runtime) return { ok: false, message: runtime.message, checkedAt: new Date().toISOString(), errorKind: "invalid_request" as const };
    const result = await options.providerNetwork.testCustomConnection(runtime);
    await options.settings.markCustomConnectionResult(input.connectionId, result);
    return result;
  });
  ipc.handle(contract.settings.probeCustomConnection, (input) => probeCustomConnection(options.settings, options.providerNetwork, input));
  ipc.handle(contract.settings.update, (input) => options.settings.update(input));
  ipc.handle(contract.providers.setKey, (input) => options.settings.setProviderKey(input.provider, input.apiKey));
  ipc.handle(contract.providers.clearKey, (input) => options.settings.clearProviderKey(input.provider));
  ipc.handle(contract.settings.updateImageGeneration, async (input) => {
    try {
      return { ok: true, settings: await options.settings.updateImageGeneration(input) };
    } catch (error) {
      return { ok: false, error: safeErrorMessage(error) };
    }
  });
  ipc.handle(contract.providers.testConnection, async (input) => {
    if (!isProviderId(input?.provider)) return { ok: false, message: "未知服务商。" };
    const runtime = options.settings.getProviderRuntimeConfig(input.provider);
    if ("code" in runtime) return { ok: false, message: runtime.message };
    const result = await options.providerNetwork.testConnection(runtime);
    await options.settings.markProviderConnectionResult(input.provider, result);
    return { ok: result.ok, message: result.message };
  });
  ipc.handle(contract.settings.getSearchUsage, () => options.settings.getSearchUsage());
  ipc.handle(contract.settings.readSystemPrompt, () => options.settings.readAgentSystemPrompt());
  ipc.handle(contract.settings.writeSystemPrompt, (input) => options.settings.writeAgentSystemPrompt(typeof input?.content === "string" ? input.content : ""));

  ipc.handle(contract.providers.list, () => ({
    providers: options.settings.getV2().providers,
    credentialStorage: options.settings.getCredentialStorageView(),
  }));
  ipc.handle(contract.providers.connect, async (input): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerFailure("invalid_provider", "未知服务商。");
    try {
      await options.settings.updateProviderConnection({ ...input, enabled: true });
      return { ok: true, provider: options.settings.getV2().providers[input.provider] };
    } catch (error) {
      return providerFailure("write_failed", safeErrorMessage(error));
    }
  });
  ipc.handle(contract.providers.update, async (input): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerFailure("invalid_provider", "未知服务商。");
    try {
      await options.settings.updateProviderConnection(input);
      return { ok: true, provider: options.settings.getV2().providers[input.provider] };
    } catch (error) {
      return providerFailure("write_failed", safeErrorMessage(error));
    }
  });
  ipc.handle(contract.providers.test, async (input): Promise<ProviderTestResult> => {
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
  ipc.handle(contract.providers.disconnect, async (input): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerFailure("invalid_provider", "未知服务商。");
    try {
      await options.settings.updateProviderConnection({ provider: input.provider, apiKey: null, ...(input.provider === "openrouter" ? { managementKey: null } : {}) });
      return { ok: true, provider: options.settings.getV2().providers[input.provider] };
    } catch (error) {
      return providerFailure("write_failed", safeErrorMessage(error));
    }
  });
  ipc.handle(contract.providers.remove, async (input): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerFailure("invalid_provider", "未知服务商。");
    try {
      await options.settings.removeProvider(input.provider);
      return { ok: true, provider: options.settings.getV2().providers[input.provider] };
    } catch (error) {
      return providerFailure("write_failed", safeErrorMessage(error));
    }
  });

  ipc.handle(contract.providers.addCredential, async (input): Promise<ProviderCredentialOperationResult> => {
    try {
      await options.settings.addProviderCredential(input);
      return { ok: true, provider: options.settings.getV2().providers[input.provider] };
    } catch (error) {
      return { ok: false, error: { code: "write_failed", message: safeErrorMessage(error) } };
    }
  });
  ipc.handle(contract.providers.updateCredential, async (input): Promise<ProviderCredentialOperationResult> => {
    const result = await options.settings.updateProviderCredential(input.provider, input.credentialId, input.label, input.pricingMultiplier);
    return "code" in result
      ? { ok: false, error: { code: result.code, message: result.message, references: result.references } }
      : { ok: true, provider: options.settings.getV2().providers[input.provider] };
  });
  ipc.handle(contract.providers.testCredential, async (input): Promise<ProviderCredentialOperationResult> => {
    const runtime = options.settings.getProviderRuntimeConfigForCredential(input.provider, input.credentialId);
    if ("code" in runtime) return { ok: false, error: { code: "credential_not_found", message: runtime.message } };
    const probe = await options.providerNetwork.testConnection(runtime);
    const marked = await options.settings.markProviderCredentialConnectionResult(input.provider, input.credentialId, probe);
    if ("code" in marked) return { ok: false, error: { code: marked.code, message: marked.message } };
    return probe.ok
      ? { ok: true, provider: options.settings.getV2().providers[input.provider] }
      : { ok: false, error: { code: "connection_failed", message: probe.message, errorKind: probe.errorKind } };
  });
  ipc.handle(contract.providers.removeCredential, async (input): Promise<ProviderCredentialOperationResult> => {
    const result = await options.settings.removeProviderCredential(input.provider, input.credentialId);
    return "code" in result
      ? { ok: false, error: { code: result.code, message: result.message, references: result.references } }
      : { ok: true, provider: options.settings.getV2().providers[input.provider] };
  });

  ipc.handle(contract.providers.getBalance, (input) => providerBalance(options, input.provider));
  ipc.handle(contract.providers.getDeepSeekBalance, () => providerBalance(options, "deepseek"));
  ipc.handle(contract.providers.getKimiBalance, () => providerBalance(options, "kimi"));

  ipc.handle(contract.models.listInstalled, () => ({ models: options.models.listInstalledModels() }));
  ipc.handle(contract.models.listUsable, (input) => ({ models: options.modelRuntime.listUsableModels(input?.purpose ?? "chat") }));
  ipc.handle(contract.models.getPricingCatalog, () => options.pricingCatalog?.status() ?? null);
  ipc.handle(contract.models.refreshPricingCatalog, (input = {}) => options.pricingCatalog?.refresh(input.force === true) ?? null);
  ipc.handle(contract.models.listCatalog, (input) => {
    const { provider, catalog } = selectModelCatalog(input?.provider, options.catalog, options.deepSeekCatalog, options.kimiCatalog);
    return { provider, ...catalog.list(input?.query) };
  });
  ipc.handle(contract.models.reloadCatalog, async (input) => {
    const { provider, catalog } = selectModelCatalog(input?.provider, options.catalog, options.deepSeekCatalog, options.kimiCatalog);
    const runtime = options.settings.getProviderRuntimeConfig(provider);
    if ("code" in runtime) return { provider, ...catalog.list(), error: { code: runtime.code, message: runtime.message } };
    const result = await catalog.reload(runtime);
    if (!result.error && result.state === "fresh") await options.models.refreshInstalledCatalogModels(provider);
    return { provider, ...result };
  });
  ipc.handle(contract.models.add, async (input): Promise<ModelMutationResult> => {
    if ((input?.provider !== "openrouter" && input?.provider !== "deepseek" && input?.provider !== "kimi") || typeof input.apiModel !== "string") return { ok: false, error: { code: "invalid_model", message: "模型添加参数无效。" } };
    return toModelMutationResult(await options.models.addCatalogModel(input.provider, input.apiModel));
  });
  ipc.handle(contract.models.addCustom, async (input) => {
    return toModelMutationResult(await options.models.addCustomModel(input));
  });
  ipc.handle(contract.models.editCustom, async (input) => {
    return toModelMutationResult(await options.models.editCustomModel(input));
  });
  ipc.handle(contract.models.setCustomConnectionDefault, async (input) => {
    return toModelMutationResult(await options.models.setCustomConnectionDefaultModel(input));
  });
  ipc.handle(contract.models.update, async (input): Promise<ModelMutationResult> => {
    const key = normalizeModelKey(input?.modelKey);
    if (!key) return { ok: false, error: { code: "invalid_model", message: "模型标识无效。" } };
    return toModelMutationResult(await options.models.updateModelSettings(key, input));
  });
  ipc.handle(contract.models.remove, async (input): Promise<ModelMutationResult> => {
    const key = normalizeModelKey(input?.modelKey);
    if (!key) return { ok: false, error: { code: "invalid_model", message: "模型标识无效。" } };
    return toModelMutationResult(await options.models.removeModel(key));
  });
  ipc.handle(contract.models.updateTaskModels, async (input) => {
    const next = await options.settings.updateV2({ taskModels: input });
    return { taskModels: next.taskModels };
  });
}

function registerFixedRendererHostCapabilities(options: FixedRendererIpcOptions, ipc: IpcRegistrar): void {
  const registryOptions = workspaceRegistryOptions(options.roots);
  const workspaceAccess = createWorkspaceAccessDeps(registryOptions, () => options.registry.listSessions());
  // 「新建文件夹工作区」的父目录来自系统对话框，不在 registry 里。只认用户最近一次在对话框里选的目录，
  // 不接受 renderer 自己拼的路径；建成功后作废，名字不合法或目录已存在时可以换个名字重试。
  let pickedParentDirectory: string | null = null;
  ipc.handle(contract.dialogs.selectFiles, async (input = {}) => {
    const result = await dialog.showOpenDialog(options.getMainWindow(), {
      properties: ["openFile", "multiSelections"],
      filters: input.remote === true ? [{ name: "Files", extensions: ["*"] }] : [{ name: "Chat attachments", extensions: ["png", "jpg", "jpeg", "webp", "gif", "txt", "md", "markdown", "json", "csv"] }],
    });
    const attachments = await Promise.all(result.filePaths.map(async (path) => {
      const image = /\.(png|jpe?g|webp|gif)$/i.test(path);
      return {
        id: `att_${randomUUID()}`,
        kind: image ? "image" as const : "file" as const,
        path,
        name: path.split(/[\\/]/).at(-1) ?? path,
        ...(image ? { previewUrl: await imagePreviewDataUrl(path) } : {}),
      };
    }));
    return { canceled: result.canceled, attachments };
  });
  ipc.handle(contract.dialogs.selectImages, async () => {
    const result = await dialog.showOpenDialog(options.getMainWindow(), {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
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
  ipc.handle(contract.dialogs.importComposerImage, (input) => importComposerImage(input, options.roots.tmpRoot, imagePreviewDataUrl));
  ipc.handle(contract.dialogs.selectWorkspaceDirectory, async (input = {}): Promise<SelectWorkspaceDirectoryResult> => {
    const result = await dialog.showOpenDialog(options.getMainWindow(), { properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    if (!input.registerWorkspace) {
      pickedParentDirectory = resolvePath(result.filePaths[0]);
      return { canceled: false, workspaceRoot: result.filePaths[0] };
    }
    const resolved = await resolveWorkspaceSelection(registryOptions, { workspaceRoot: result.filePaths[0] });
    if (resolved.ok === false) throw new Error(resolved.error);
    return { canceled: false, workspaceRoot: resolved.workspaceRoot };
  });
  ipc.handle(contract.workspaces.openInIde, (input) => openWorkspaceInIde(registryOptions, input.workspaceId));
  ipc.handle(contract.workspaces.setVisibility, (input) => setWorkspaceHidden(registryOptions, input.workspaceId, input.hidden));
  ipc.handle(contract.workspaces.getGitContext, async (input) => getWorkspaceGitContext(
    await resolveWorkspaceAccess({ workspaceRoot: input?.workspaceRoot ?? options.roots.workspaceRoot }, workspaceAccess),
  ));
  ipc.handle(contract.workspaces.createFolder, async (input) => {
    const parent = typeof input?.parentRoot === "string" && input.parentRoot.trim() ? resolvePath(input.parentRoot.trim()) : "";
    if (!parent) return { ok: false as const, error: WORKSPACE_NOT_REGISTERED };
    const picked = parent === pickedParentDirectory;
    if (!picked) {
      const registered = await resolveWorkspaceAccess({ workspaceRoot: parent }, workspaceAccess).then(() => true, () => false);
      if (!registered) return { ok: false as const, error: WORKSPACE_NOT_REGISTERED };
    }
    const created = await createWorkspaceFolder(registryOptions, input);
    if (picked && created.ok) pickedParentDirectory = null;
    return created;
  });
  ipc.handle(contract.sessions.readArtifact, async (input) => {
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
  ipc.handle(contract.dialogs.showArtifactContextMenu, async (input) => {
    if (input.kind === "workspace_file") {
      const workspaceRoot = await resolveWorkspaceAccess({ workspaceRoot: input.workspaceRoot ?? options.roots.defaultWorkspaceRoot }, workspaceAccess)
        .catch(() => null);
      if (!workspaceRoot) return { shown: false, error: "invalid_target" as const };
      return showArtifactContextMenu({ ...input, workspaceRoot }, options.roots, options.getMainWindow());
    }
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
  ipc.handle(contract.review.initGit, async (input = {}) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return initializeGitRepository({ ...input, workspaceRoot }, options.roots);
  });

  ipc.handle(contract.workspaces.getEnvironment, async (input = {}) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return getWorkspaceEnvironment({ ...input, workspaceRoot }, options.roots);
  });
  ipc.handle(contract.workspaces.createBranch, async (input) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return createWorkspaceBranch({ ...input, workspaceRoot }, options.roots);
  });
  ipc.handle(contract.workspaces.switchBranch, async (input) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return switchWorkspaceBranch({ ...input, workspaceRoot }, options.roots);
  });
  ipc.handle(contract.workspaces.commit, async (input) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return commitWorkspaceChanges({ ...input, workspaceRoot }, options.roots);
  });
  ipc.handle(contract.workspaces.push, async (input) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return pushWorkspaceBranch({ ...input, workspaceRoot }, options.roots);
  });
  ipc.handle(contract.workspaces.commitAndPush, async (input) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return commitAndPushWorkspaceChanges({ ...input, workspaceRoot }, options.roots);
  });
  ipc.handle(contract.workspaces.listOpenTools, () => listWorkspaceOpenTools());
  ipc.handle(contract.workspaces.openInTool, async (input) => {
    const workspaceRoot = await registeredWorkspaceRoot(registryOptions, input.workspaceRoot);
    return openWorkspaceInTool({ ...input, workspaceRoot }, options.roots);
  });

  ipc.handle(contract.approvals.listPending, async (input = {}): Promise<PendingApprovalInfo[]> => {
    const pending = await Promise.all(options.approvals.listPending(input.sessionId).map(async (request): Promise<PendingApprovalInfo> => {
      // Broker args are resource summaries, not tool arguments. Read the
      // accepted call for a faithful path/command preview after renderer reload.
      const detail = request.sessionId && request.toolCallId
        ? await options.registry.browseToolDetail(request.sessionId, request.toolCallId).catch(() => undefined)
        : undefined;
      const call = detail?.journal.find(event => event.type === "tool/call" && (event.data as Record<string, unknown>).callId === request.toolCallId);
      const callData = call?.data as Record<string, RuntimeV2JsonValue> | undefined;
      return {
        requestId: request.id,
        ...(request.sessionId && request.agentRunId && request.toolCallId ? { recovery: {
          agentRunId: request.agentRunId,
          toolCallId: request.toolCallId,
          preview: toolPreview(request.toolName, undefined, { summary: request.summary }, callData ?? { args: request.args as Record<string, RuntimeV2JsonValue> }, undefined, request.sessionId, request.agentRunId, "running", detail?.snapshot.workspaceRoot ?? undefined),
          approvalScope: request.approvalScope,
        } } : {}),
        toolName: request.toolName,
        summary: request.summary,
        reason: request.reason,
        riskLevel: request.riskLevel,
        command: typeof request.args.command === "string" ? request.args.command : undefined,
        createdAt: request.createdAt,
        expiresAt: request.expiresAt,
        grantSuggestions: request.grantSuggestions,
        supportedLifetimes: request.supportedLifetimes,
      };
    }));
    const live = new Set(options.approvals.listPending(input.sessionId).map(request => request.id));
    return pending.filter(request => live.has(request.requestId));
  });
  ipc.handle(contract.approvals.submit, (input) => options.approvals.decide(input.requestId, input.decision, input.decision === "session" ? input.suggestionId : undefined));

  ipc.handle(contract.browserBridge.getStatus, () => options.browserBridge.getStatus());
  ipc.handle(contract.browserBridge.connect, () => options.browserBridge.connect());
  ipc.handle(contract.browserBridge.useSourceExtension, (repoRoot) => options.browserBridge.useSourceExtension(repoRoot));
  ipc.handle(contract.browserBridge.prepareUpdate, () => options.browserBridge.prepareUpdate());
  ipc.handle(contract.browserBridge.disconnect, () => options.browserBridge.disconnect());
  ipc.handle(contract.browserBridge.selectInstance, (instanceId) => options.browserBridge.selectInstance(instanceId));
  ipc.handle(contract.browserBridge.openExtensions, async () => {
    if (process.platform === "darwin") {
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const child = spawn("open", ["-a", "Google Chrome", "chrome://extensions"], { stdio: "ignore" });
        child.once("error", (error) => resolve({ ok: false, error: error.message }));
        child.once("exit", (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: "Chrome 扩展页未能打开。" }));
      });
    }
    return { ok: false, error: "请在 Chrome 地址栏打开 chrome://extensions。" };
  });
  ipc.handle(contract.browserBridge.revealExtensionDirectory, async () => {
    const status = await options.browserBridge.getStatus();
    if (!status.extensionDir || !status.installed) return { ok: false, error: "请先准备扩展组件。" };
    shell.showItemInFolder(status.extensionDir);
    return { ok: true };
  });
  ipc.handle(contract.browserBridge.installFromRepo, (input) => options.browserBridge.buildAndInstall(input.repoRoot));
  ipc.handle(contract.browserBridge.installNativeHost, () => options.browserBridge.installNativeHost());

  ipc.handle(contract.skills.list, async (input = {}) => listFixedRendererSkills({
    dataRoot: options.roots.dataRoot,
    workspaceRoot: input.workspaceRoot ? await resolveWorkspaceAccess({ workspaceRoot: input.workspaceRoot }, workspaceAccess) : options.roots.workspaceRoot,
    homeDir: homedir(),
    disabled: options.settings.get().skills.disabled,
  }));
  ipc.handle(contract.skills.install, async () => {
    const result = await dialog.showOpenDialog(options.getMainWindow(), { title: "选择 Skill 目录（需包含 SKILL.md）", properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    return installFixedRendererSkill(options.roots.dataRoot, result.filePaths[0]);
  });
  ipc.handle(contract.skills.uninstall, (input) => uninstallFixedRendererSkill(options.roots.dataRoot, input.directory));

  ipc.handle(contract.updates.getState, () => options.localUpdate.getState());
  ipc.handle(contract.updates.selectSource, async () => {
    const result = await dialog.showOpenDialog(options.getMainWindow(), { title: "选择 actspace 源码目录", properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, state: await options.localUpdate.getState() };
    return { canceled: false, state: await options.localUpdate.setSourceRoot(result.filePaths[0]) };
  });
  ipc.handle(contract.updates.start, () => options.localUpdate.start());

  ipc.handle(contract.sessions.describeContext, async (input) => {
    try {
      const snapshot = await options.registry.inspectSession(input.sessionId);
      return projectContextState(snapshot, await options.registry.inspectSessionEvents(input.sessionId));
    } catch {
      return null;
    }
  });
  ipc.handle(contract.usage.getStatistics, (input) => createUsageStatistics(options.registry, options.roots.dataRoot, input));
  ipc.handle(contract.usage.getActivity, (input) => createUsageActivity(options.registry, options.roots.dataRoot, input));
  ipc.handle(contract.sessions.getSubagents, async (input) => {
    return projectSubagentList(await options.registry.inspectSession(input.sessionId), await options.registry.inspectSessionEvents(input.sessionId));
  });
  ipc.handle(contract.sessions.getSubAgentTranscript, async (input) => {
    const snapshot = await options.registry.inspectSession(input.transcriptRef.runId);
    const journal = await options.registry.inspectSessionEvents(input.transcriptRef.runId);
    return projectSubagentTranscript(snapshot, journal);
  });

  ipc.handle(contract.visualize.convertReply, (input) => visualizeReplyV2(input, options.roots, options.registry));
  ipc.handle(contract.visualize.list, (input) => listVisualizationsV2(input.sessionId, options.roots, options.registry));
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
    agentForm: item.agentForm,
    agentMode: item.agentMode,
    agentModeRevision: item.agentModeRevision,
    workspaceRoot: item.workspaceRoot ?? undefined,
    pinned: item.metadata.pinned,
    archived: item.metadata.archived,
  };
}

/** Shared ownership validation; filesystem resolution remains a Node Host port. */
async function validateRunReferences(registry: DesktopRuntimeV2Registry, input: Pick<import("@actspace/shared/runtime-v2").SubmitTaskInput, "sessionId" | "fileReferences" | "responseAnnotations">) {
  return validateSharedRunReferences({
    inspectSession: id => registry.inspectSession(id),
    readSessionProjection: input => registry.readSessionProjection(input),
    resolveFile: resolveWorkspaceFileReference,
  }, input);
}

async function toRunContent(
  registry: DesktopRuntimeV2Registry,
  sessionId: string,
  input: {
    readonly userInput: string;
    readonly attachments: readonly ComposerAttachment[];
    readonly fileReferences: readonly FileReference[];
    readonly responseAnnotations: readonly ResponseAnnotationReference[];
  },
): Promise<{ readonly content: RuntimeV2JsonValue; readonly importedArtifactIds: readonly string[] }> {
  const { userInput, attachments } = input;
  const referenceBlocks: RuntimeV2JsonValue[] = [...fileReferenceBlocks(input.fileReferences), ...responseExcerptBlocks(input.responseAnnotations)];
  if (attachments.length === 0 && referenceBlocks.length === 0) return { content: userInput, importedArtifactIds: [] };
  // 块顺序：正文 → 文件引用 → 回复批注 → 附件。
  const blocks: RuntimeV2JsonValue[] = userInput ? [{ type: "text", text: userInput }, ...referenceBlocks] : [...referenceBlocks];
  if (attachments.length === 0) return { content: blocks, importedArtifactIds: [] };
  const snapshot = await registry.inspectSession(sessionId);
  const usableAttachments = attachments.filter((attachment) => Boolean(attachment.path));
  if (snapshot.agentMode === "chat") {
    const imported = await registry.importChatAttachments(sessionId, usableAttachments.map((attachment) => attachment.path!));
    for (const attachment of imported) {
      blocks.push({
        type: "artifact",
        artifact: { artifactId: attachment.artifactId, mediaType: attachment.mimeType },
        label: attachment.name,
        ...(attachment.textContent === undefined ? {} : { text: attachment.textContent }),
      });
    }
    return { content: blocks, importedArtifactIds: imported.map((attachment) => attachment.artifactId) };
  }

  const importedArtifactIds: string[] = [];
  try {
    for (const attachment of attachments) {
      if (!attachment.path) continue;
      const imported = await registry.importAttachment(sessionId, attachment.path);
      importedArtifactIds.push(imported.artifactId);
      if (attachment.kind === "image") {
        blocks.push({ type: "artifact", artifact: { artifactId: imported.artifactId, mediaType: imported.mimeType }, label: imported.name });
      } else {
        blocks.push({ type: "text", text: `Attached file: ${imported.name} (${imported.artifactId})` });
      }
    }
  } catch (error) {
    // Nothing has been admitted yet; do not strand earlier imports when a later file fails.
    await registry.rollbackImportedAttachments(sessionId, importedArtifactIds).catch(() => undefined);
    throw error;
  }
  return { content: blocks, importedArtifactIds };
}

async function providerBalance<P extends "deepseek" | "kimi" | "openrouter">(options: FixedRendererIpcOptions, provider: P): Promise<ProviderBalanceSnapshot & { provider: P }> {
  const runtime = provider === "openrouter"
    ? options.settings.getOpenRouterManagementRuntimeConfig()
    : options.settings.getProviderRuntimeConfig(provider);
  if ("code" in runtime) {
    if (runtime.code === "api_key_missing") return options.providerNetwork.getBalance(provider, undefined) as Promise<ProviderBalanceSnapshot & { provider: P }>;
    throw new Error(runtime.message);
  }
  return options.providerNetwork.getBalance(provider, runtime) as Promise<ProviderBalanceSnapshot & { provider: P }>;
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

/** model-store 的引用只会是任务模型槽位名；渲染层契约按槽位联合声明（旧 preload 以断言收窄）。 */
type ModelMutationReferences = NonNullable<Extract<ModelMutationResult, { ok: false }>["error"]["references"]>;

function toModelMutationResult(result: ModelStoreResult): ModelMutationResult {
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
            : result.code;
  return { ok: false as const, error: { code, message: result.message, ...(result.references ? { references: result.references as ModelMutationReferences } : {}) } };
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

