import { ContextPanelService } from "./context-panel-service";
import { validateRunReferences as validateSharedRunReferences } from "@actspace/shared/composer-reference-validation";
import type { RemoteDesktopAdapter } from "../remote-hosts/desktop-adapter";
import { createSessionGateway } from "../session-gateway";
import { UsageReadModelService } from "./usage-read-model";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { prepareExecutionContext, rollbackPreparedExecution } from "../workspace-git-context-service";
import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import { dialog, nativeImage, nativeTheme, shell, type BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import {
  fileReferenceBlocks,
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
  projectManagedContextState,
} from "@actspace/shared";
import {
  RUNTIME_V2_FIXED_RENDERER_CHANNELS,
  type RuntimeV2JsonValue,
  type RuntimeV2SessionListItem,
  type RuntimeV2SessionSnapshot,
  type RuntimeV2DesktopSessionProjection,
  type TaskSubmissionResult,
} from "@actspace/shared/runtime-v2";
import type { AppDataRoots } from "../app-paths";
import { createIpcRegistrar, type IpcRegistrar } from "../ipc/registry";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import type { PendingApprovalRegistry } from "../approval-registry";
import { showArtifactContextMenu, showResolvedArtifactContextMenu } from "../artifact-context-menu-service";
import { importComposerImage } from "../composer-attachment-service";
import { resolveWorkspaceFileReference } from "../workspace-file-reference";
import type { LocalUpdateService } from "../local-update-service";
import { ModelConnectionsService } from "../model-connections-service";
import type { ModelRuntimeService } from "../model-runtime-service";
import type { ModelStoreService } from "../model-store-service";
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
import type { ProviderNetworkService } from "./provider-network-service";
import { ChatAttachmentValidationError, type DesktopRuntimeV2Registry } from "./runtime-registry";
import { installFixedRendererSkill, listFixedRendererSkills, uninstallFixedRendererSkill } from "./fixed-renderer-skills";
import {
  projectContextSnapshot,
  projectContextState,
  projectChatEvents,
  projectSubagentTranscript,
  projectSubagentList,
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
  const readModel = usageReadModels.get(options.registry) ?? new UsageReadModelService(options.registry, options.roots.dataRoot);
  usageReadModels.set(options.registry, readModel);
  const contextPanel = new ContextPanelService(options.registry, readModel);
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
    const service = usageReadModels.get(options.registry) ?? new UsageReadModelService(options.registry, options.roots.dataRoot);
    usageReadModels.set(options.registry, service);
    return service.getSessionPage(input);
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
    const prepared = input.runLocation ? await prepareExecutionContext({
      sourceWorkspaceRoot: workspaceRoot, runLocation: input.runLocation, branch: input.branch,
    }, options.roots) : { ok: true as const, workspaceRoot };
    if (prepared.ok === false) throw new Error(prepared.message);
    let snapshot: RuntimeV2SessionSnapshot;
    try {
      snapshot = await options.registry.createSession(undefined, prepared.workspaceRoot, input.agentForm, "worktree" in prepared ? prepared.worktree : undefined);
    } catch (error) {
      await rollbackPreparedExecution("rollback" in prepared ? prepared.rollback : undefined);
      throw error;
    }
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
    if (input.mode !== "default" && input.mode !== "full-access" && input.mode !== "auto-review") return { ok: false, error: "invalid_permission_mode" };
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
    if (envelope.event.kind === "runtime-live" || envelope.event.kind === "journal-update") usageReadModels.get(options.registry)?.invalidate();
    const target = options.getMainWindow();
    if (target === undefined || target.isDestroyed()) return;
    target.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.sessionLiveEvent, envelope);

  });

  const unsubscribeRendererStream = options.registry.subscribeRendererStream((event) => {
    const target = options.getMainWindow();
    if (target !== undefined && !target.isDestroyed()) target.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.agentStream, event);
  });

  registerFixedRendererSettings(options, ipc);
  registerModelConnections(options, ipc);
  unsubscribeSettingsV4 = options.settings.subscribeV4Changes((notification: SettingsV4ChangedNotification) => {
    const target = options.getMainWindow();
    if (target !== undefined && !target.isDestroyed()) {
      target.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.settingsChangedV4, notification);
    }
  });
  registerFixedRendererHostCapabilities(options, ipc, contextPanel);

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
      void usageReadModels.get(options.registry)?.dispose();
      usageReadModels.delete(options.registry);
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
  ipc.handle(contract.settings.getSearchUsage, () => options.settings.getSearchUsage());
  ipc.handle(contract.settings.readSystemPrompt, () => options.settings.readAgentSystemPrompt());
  ipc.handle(contract.settings.writeSystemPrompt, (input) => options.settings.writeAgentSystemPrompt(typeof input?.content === "string" ? input.content : ""));

  ipc.handle(contract.models.listUsable, (input) => ({ models: options.modelRuntime.listUsableModels(input?.purpose ?? "chat") }));
  ipc.handle(contract.models.getPricingCatalog, () => options.pricingCatalog?.status() ?? null);
  ipc.handle(contract.models.refreshPricingCatalog, (input = {}) => options.pricingCatalog?.refresh(input.force === true) ?? null);
}

/** 设置 › 模型：连接、连接下的模型、用途表。入参校验在 ModelConnectionsService 里。 */
function registerModelConnections(options: FixedRendererIpcOptions, ipc: IpcRegistrar): void {
  const connections = new ModelConnectionsService(options.settings, options.models, options.providerNetwork);
  ipc.handle(contract.modelConnections.list, () => connections.list());
  ipc.handle(contract.modelConnections.probe, (input) => connections.probe(input));
  ipc.handle(contract.modelConnections.create, (input) => connections.create(input));
  ipc.handle(contract.modelConnections.update, (input) => connections.update(input));
  ipc.handle(contract.modelConnections.remove, (input) => connections.remove(input));
  ipc.handle(contract.modelConnections.addModels, (input) => connections.addModels(input));
  ipc.handle(contract.modelConnections.updateModel, (input) => connections.updateModel(input));
  ipc.handle(contract.modelConnections.removeModel, (input) => connections.removeModel(input));
  ipc.handle(contract.modelConnections.preview, (input) => connections.preview(input));
  ipc.handle(contract.modelConnections.updatePurposes, (input) => connections.updatePurposes(input));
  ipc.handle(contract.modelConnections.getBalance, (input) => connections.getBalance(input));
}

function registerFixedRendererHostCapabilities(options: FixedRendererIpcOptions, ipc: IpcRegistrar, contextPanel: ContextPanelService): void {
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

  ipc.handle(contract.sessions.describeContext, input => contextPanel.describeComposer(input.sessionId));
  ipc.handle(contract.usage.getStatus, input => usageReadModels.get(options.registry)?.getStatus(input.requestId) ?? null);
  ipc.handle(contract.usage.cancel, input => usageReadModels.get(options.registry)?.cancel(input.requestId));
  ipc.handle(contract.sessions.describeContextPanel, input => contextPanel.describe(input));
  ipc.handle(contract.sessions.listContextPaths, input => contextPanel.listPaths(input));
  ipc.handle(contract.sessions.listContextEntries, input => contextPanel.listEntries(input));
  ipc.handle(contract.sessions.readContextEntry, input => contextPanel.readEntry(input));
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
    ...(item.worktree ? { worktree: item.worktree } : {}),
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

async function createUsageStatistics(
  registry: DesktopRuntimeV2Registry,
  dataRoot: string,
  input: UsageStatisticsGetInput,
): Promise<UsageStatisticsSnapshot | null> {
  const service = usageReadModels.get(registry) ?? new UsageReadModelService(registry, dataRoot);
  usageReadModels.set(registry, service);
  return service.getStatistics(input);
}

const usageReadModels = new WeakMap<DesktopRuntimeV2Registry, UsageReadModelService>();

async function createUsageActivity(registry: DesktopRuntimeV2Registry, dataRoot: string, input: UsageStatisticsGetInput): Promise<UsageActivitySnapshot | null> {
  const service = usageReadModels.get(registry) ?? new UsageReadModelService(registry, dataRoot);
  usageReadModels.set(registry, service);
  return service.getActivity({ ...input, search: input.search?.slice(0, 300) });
}

async function imagePreviewDataUrl(path: string): Promise<string | undefined> {
  try {
    const image = nativeImage.createFromPath(path);
    return image.isEmpty() ? undefined : image.toDataURL();
  } catch {
    return undefined;
  }
}

function isSupportedSessionImageMime(value: string): value is "image/png" | "image/jpeg" | "image/webp" {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
