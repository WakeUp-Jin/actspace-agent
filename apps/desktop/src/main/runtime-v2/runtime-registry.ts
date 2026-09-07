import type { EnglishLearningService, SpeechHostPort } from "@actspace/english-learning";
import type { EnglishLearningTargetInput, EnglishLearningState } from "@actspace/shared";
import { FixedRendererStreamAdapter } from "./fixed-renderer-stream-adapter";
import { observeSessionRevisions } from "./session-revision-observer";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type {
  RuntimeV2DesktopStatus,
  RuntimeV2DesktopLiveEnvelope,
  RuntimeV2DesktopSnapshot,
  RuntimeV2EnqueueMessageInput,
  RuntimeV2ForkSessionInput,
  RuntimeV2LiveEvent,
  RuntimeV2LiveReplay,
  RuntimeV2RequestRestartInput,
  RuntimeV2UpdateSessionMetadataInput,
  RuntimeV2ReadArtifactResult,
  RuntimeV2RunTurnRequest,
  RuntimeV2AttachmentRef,
} from "@actspace/shared/runtime-v2";
import type { BootedRuntimeProfile } from "@actspace/runtime";
import type { DesktopAppServiceContract } from "@actspace/desktop-app";
import { bootDesktopRuntimeV2 } from "./desktop-host-adapter";
import type { DesktopRuntimeV2ModelPort } from "./model-port";
import type { DesktopRuntimeV2ApprovalPort, DesktopRuntimeV2BrowserPort, DesktopRuntimeV2Roots } from "./host-ports";
import { loadRuntimeV2Module, type RuntimeV2Module } from "./runtime-loader";

export type DesktopRuntimeV2RegistryOptions = {
  readonly speech?: SpeechHostPort;
  readonly roots: DesktopRuntimeV2Roots;
  readonly models: DesktopRuntimeV2ModelPort;
  readonly approvals: DesktopRuntimeV2ApprovalPort;
  readonly browser: DesktopRuntimeV2BrowserPort;
  readonly loadModule?: () => Promise<RuntimeV2Module>;
  readonly log?: (message: string, details?: Record<string, unknown>) => void;
};

export class DesktopRuntimeV2Registry {
  readonly #streamWorkspaces = new Map<string, string>();
  readonly #rendererStream = new FixedRendererStreamAdapter((sessionId) => this.#streamWorkspaces.get(sessionId));
  readonly #listeners = new Set<(event: RuntimeV2DesktopLiveEnvelope) => void>();
  #profile: BootedRuntimeProfile | undefined;
  #bootPromise: Promise<void> | undefined;
  #bootError: string | null = null;
  #cursor = 0;
  readonly #eventBuffer: RuntimeV2DesktopLiveEnvelope[] = [];
  #artifacts: {
    create(input: { readonly bytes: Uint8Array; readonly mediaType: string; readonly owner: { readonly sessionId: string; readonly callId: string; readonly pluginId: string; readonly name: string } }): Promise<{ readonly artifactId: string; readonly mediaType: string; readonly size: number }>;
    readForSession(sessionId: string, artifactId: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }>;
    resolveForSession(sessionId: string, artifactId: string): Promise<{ readonly path: string; readonly bytes: Uint8Array; readonly mediaType: string }>;
  } | undefined;

  constructor(private readonly options: DesktopRuntimeV2RegistryOptions) {}

  async boot(): Promise<void> {
    this.#bootPromise ??= this.#boot();
    return this.#bootPromise;
  }

  status(): RuntimeV2DesktopStatus {
    return Object.freeze({
      ready: this.#profile?.getState().state === "ready",
      runtimeInstanceId: this.#profile?.getState().runtimeInstanceId ?? null,
      error: this.#bootError,
    });
  }

  async snapshot(sessionId?: string): Promise<RuntimeV2DesktopSnapshot> {
    const profile = this.requireProfile();
    const app = this.requireApp();
    const selectedSession = sessionId === undefined ? null : await app.inspectSession(sessionId);
    return Object.freeze({
      kind: "desktop-runtime-snapshot",
      schemaVersion: 1,
      runtimeInstanceId: profile.getState().runtimeInstanceId,
      cursor: this.#cursor,
      runtime: profile.getState(),
      manifest: profile.manifest,
      diagnostics: profile.getDiagnostics(),
      sessions: await app.listSessions(),
      selectedSession,
      workspaceRoot: this.options.roots.workspaceRoot,
    });
  }

  listSessions() { return this.requireApp().listSessions(); }
  inspectSession(sessionId: string) { return this.requireApp().inspectSession(sessionId); }
  inspectSessionEvents(sessionId: string) { return this.requireApp().inspectSessionEvents(sessionId); }
  completeText(input: Parameters<DesktopAppServiceContract["completeText"]>[0]) { return this.requireApp().completeText(input); }
  async exportSession(sessionId: string) { return Object.freeze({ sessionId, jsonl: await this.requireApp().exportSession(sessionId) }); }

  async createSession(sessionId?: string, workspaceRoot?: string) {
    const snapshot = await this.requireApp().createMainSession(sessionId, workspaceRoot);
    this.#emitDurableChanged(snapshot.sessionId, snapshot.throughJournalSeq, "session-created");
    return snapshot;
  }

  async resumeSession(sessionId: string) {
    const snapshot = await this.requireApp().resumeMainSession(sessionId);
    this.#emitDurableChanged(snapshot.sessionId, snapshot.throughJournalSeq, "session-resumed");
    return snapshot;
  }

  async forkSession(input: RuntimeV2ForkSessionInput) {
    const snapshot = await this.requireApp().forkMainSession(input.parentSessionId, input.boundarySeq, input.newSessionId);
    this.#emitDurableChanged(snapshot.sessionId, snapshot.throughJournalSeq, "session-forked");
    return snapshot;
  }

  async runTurn(input: RuntimeV2RunTurnRequest) {
    const result = await this.requireApp().runTurn(input);
    this.#emitDurableChanged(result.sessionId, result.snapshot.throughJournalSeq, `turn-${result.reason}`);
    return result;
  }

  async enqueueMessage(input: RuntimeV2EnqueueMessageInput) {
    const result = await this.requireApp().enqueueMainMessage(input.sessionId, input.content, input.target, input.messageId);
    const snapshot = await this.requireApp().inspectSession(input.sessionId);
    this.#emitDurableChanged(input.sessionId, snapshot.throughJournalSeq, "inbox-enqueued");
    return result;
  }

  async cancelMessage(sessionId: string, messageId: string) {
    const cancelled = await this.requireApp().cancelPendingMessage(sessionId, messageId);
    if (cancelled) {
      const snapshot = await this.requireApp().inspectSession(sessionId);
      this.#emitDurableChanged(sessionId, snapshot.throughJournalSeq, "inbox-cancelled");
    }
    return cancelled;
  }

  abortRun(sessionId: string, reason?: string): boolean {
    return this.requireApp().abortRun(sessionId, reason);
  }

  async compactSession(sessionId: string) {
    const result = await this.requireApp().compactSession(sessionId);
    this.#emitDurableChanged(sessionId, result.snapshot.throughJournalSeq, result.compacted ? "context-compacted" : "context-compaction-skipped");
    return result;
  }

  flushSession(sessionId: string): Promise<void> {
    return this.requireApp().flushSession(sessionId);
  }

  requestRestart(input: RuntimeV2RequestRestartInput) {
    const profile = this.requireProfile();
    profile.requestRestart(input.reason, input.source, input.candidateDigest);
    return profile.getState();
  }

  async updateSessionMetadata(input: RuntimeV2UpdateSessionMetadataInput) {
    const snapshot = await this.requireApp().updateSessionMetadata(input.sessionId, input);
    if (input.archived && this.#profile?.context.get?.("english-learning")) {
      const learning = this.englishLearning();
      if (learning.getState().targetSessionId === input.sessionId) await learning.disable();
    }
    this.#emitDurableChanged(input.sessionId, snapshot.throughJournalSeq, "session-metadata-updated");
    return snapshot;
  }

  async updateSessionWorkspace(sessionId: string, workspaceRoot: string) {
    const snapshot = await this.requireApp().updateSessionWorkspace(sessionId, workspaceRoot);
    this.#emitDurableChanged(sessionId, snapshot.throughJournalSeq, "session-workspace-updated");
    return snapshot;
  }

  async readArtifact(sessionId: string, artifactId: string): Promise<RuntimeV2ReadArtifactResult> {
    const artifact = await this.resolveArtifact(sessionId, artifactId);
    return Object.freeze({ artifactId, mimeType: artifact.mediaType, bytesBase64: Buffer.from(artifact.bytes).toString("base64") });
  }

  async resolveArtifact(sessionId: string, artifactId: string): Promise<{ readonly path: string; readonly bytes: Uint8Array; readonly mediaType: string }> {
    const snapshot = await this.requireApp().inspectSession(sessionId);
    const toolArtifact = snapshot.tools.flatMap((tool) => tool.artifacts).find((candidate) => candidate.artifactId === artifactId);
    const messageArtifact = snapshot.messages.map((message) => findArtifactRef(message.content, artifactId)).find((candidate) => candidate !== null) ?? null;
    const mimeType = toolArtifact?.mimeType ?? messageArtifact?.mimeType;
    if (mimeType === undefined) throw new Error("Artifact is not referenced by this Session.");
    if (this.#artifacts === undefined) throw new Error("Artifact store is unavailable.");
    const stored = await this.#artifacts.resolveForSession(sessionId, artifactId);
    if (stored.mediaType !== mimeType) throw new Error("Artifact media type does not match the Session projection.");
    return stored;
  }

  async importAttachment(sessionId: string, path: string): Promise<RuntimeV2AttachmentRef> {
    await this.requireApp().inspectSession(sessionId);
    if (this.#artifacts === undefined) throw new Error("Artifact store is unavailable.");
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error("Attachment must be a regular file.");
    if (metadata.size > 20 * 1024 * 1024) throw new Error("Attachment exceeds the 20 MiB limit.");
    const mediaType = attachmentMediaType(path);
    const created = await this.#artifacts.create({ bytes: await readFile(path), mediaType, owner: { sessionId, callId: `attachment-${randomUUID()}`, pluginId: "@actspace/desktop", name: "user-attachment" } });
    return Object.freeze({ artifactId: created.artifactId, mimeType: created.mediaType, name: basename(path).slice(0, 240), sizeBytes: created.size });
  }

  subscribeRendererStream(listener: (event: import("@actspace/shared").RuntimeStreamEvent) => void): () => void { return this.#rendererStream.subscribe(listener); }

  subscribe(listener: (event: RuntimeV2DesktopLiveEnvelope) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  replayLiveEvents(afterCursor: number): RuntimeV2LiveReplay {
    const profile = this.requireProfile();
    const first = this.#eventBuffer[0]?.event.liveSeq ?? this.#cursor + 1;
    const gap = afterCursor < first - 1;
    return Object.freeze({
      runtimeInstanceId: profile.getState().runtimeInstanceId,
      afterCursor,
      currentCursor: this.#cursor,
      gap,
      events: Object.freeze(gap ? [] : this.#eventBuffer.filter((envelope) => envelope.event.liveSeq > afterCursor)),
    });
  }

  private learningControl: Promise<unknown> = Promise.resolve();
  private learningOperation = 0;

  englishLearning(): EnglishLearningService {
    const service = this.requireProfile().context.get?.("english-learning") as EnglishLearningService | undefined;
    if (!service) throw new Error("英语辅助学习尚未就绪。");
    return service;
  }

  setEnglishLearningTarget(input: EnglishLearningTargetInput, persist: () => Promise<void>): Promise<EnglishLearningState> {
    const operation = ++this.learningOperation;
    const execute = async () => {
      const service = this.englishLearning();
      if (input.sessionId) {
        const session = await this.inspectSession(input.sessionId);
        if (session.lineage !== null || session.metadata.archived || !["read-write", "degraded"].includes(session.accessState)) throw new Error("请选择可用的未归档主会话。");
        if (input.enabled) await this.requireApp().resumeMainSession(input.sessionId);
      }
      if (operation !== this.learningOperation) return service.getState();
      await persist();
      if (operation !== this.learningOperation) return service.getState();
      return input.enabled && input.sessionId ? service.enableSession(input.sessionId) : service.disable();
    };
    const result = this.learningControl.then(execute, execute);
    this.learningControl = result.catch(() => {});
    return result;
  }

  #stopSessionRevisions: (() => void) | undefined;

  async dispose(): Promise<void> {
    this.#stopSessionRevisions?.();
    this.#stopSessionRevisions = undefined;
    const profile = this.#profile;
    if (profile === undefined) return;
    this.learningOperation++;
    const learning = profile.context.get?.("english-learning") as EnglishLearningService | undefined;
    await learning?.dispose();
    await profile.shutdown();
    this.#rendererStream.dispose();
    if (this.#profile === profile) {
      this.#profile = undefined;
      this.#artifacts = undefined;
    }
  }

  #emit(event: Omit<RuntimeV2LiveEvent, "schemaVersion" | "runtimeInstanceId" | "liveSeq">): void {
    const profile = this.#profile;
    if (profile === undefined) return;
    const envelope = Object.freeze({
      event: Object.freeze({
        ...event,
        schemaVersion: 1 as const,
        runtimeInstanceId: profile.getState().runtimeInstanceId,
        liveSeq: ++this.#cursor,
      }),
      emittedAt: new Date().toISOString(),
    });
    this.#eventBuffer.push(envelope);
    if (this.#eventBuffer.length > 512) this.#eventBuffer.shift();
    for (const listener of this.#listeners) listener(envelope);
  }

  #emitToolProgress(update: {
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
  }): void {
    this.#rendererStream.progress(update);
    this.#emit({
      kind: "tool-progress",
      sessionId: update.sessionId,
      throughJournalSeq: 0,
      agentRunId: update.agentRunId,
      turnId: update.turnId,
      stepId: update.stepId,
      callId: update.callId,
      pluginId: update.pluginId,
      name: update.name,
      phase: "executing",
      message: update.message,
      current: update.completed ?? null,
      total: update.total ?? null,
    });
  }

  #emitDurableChanged(sessionId: string, throughJournalSeq: number, message: string): void {
    this.#emit({ kind: "runtime-live", sessionId, throughJournalSeq, message });
  }

  #emitRuntimeLive(update: import("@actspace/runtime").AgentLoopLiveEvent): void {
    if (update.workspaceRoot) this.#streamWorkspaces.set(update.sessionId, update.workspaceRoot);
    this.#rendererStream.accept(update);
    if (update.kind === "run-state" && ["completed", "failed", "aborted", "step-limit"].includes(update.message)) this.#streamWorkspaces.delete(update.sessionId);
    if (update.kind === "assistant-delta" || update.kind === "reasoning-delta" || update.kind === "run-state") {
      this.#emit({ ...update, throughJournalSeq: 0 });
    }
  }

  async #boot(): Promise<void> {
    try {
      const module = await (this.options.loadModule ?? loadRuntimeV2Module)();
      const booted = await bootDesktopRuntimeV2({
        module,
        roots: this.options.roots,
        models: this.options.models,
        approvals: this.options.approvals,
        browser: this.options.browser,
        speech: this.options.speech,
        invocationId: randomUUID(),
        onToolProgress: (update) => this.#emitToolProgress(update),
        onRuntimeLive: (update) => this.#emitRuntimeLive(update),
      });
      this.#profile = booted.profile;
      this.#stopSessionRevisions = observeSessionRevisions(booted.profile.context, (sessionId, seq) => this.#emitDurableChanged(sessionId, seq, "journal-advanced"));
      this.#artifacts = booted.artifacts;
      this.#bootError = null;
      this.options.log?.("runtime v2 ready", {
        runtimeInstanceId: booted.profile.getState().runtimeInstanceId,
        browserReady: booted.browserReady,
        sessionRoot: booted.sessionRoot,
      });
    } catch (error) {
      this.#bootError = error instanceof Error ? error.message : String(error);
      this.options.log?.("runtime v2 boot failed", { error: this.#bootError });
      throw error;
    }
  }

  private requireProfile(): BootedRuntimeProfile {
    if (this.#profile === undefined) throw new Error(this.#bootError ?? "Runtime v2 is not ready.");
    return this.#profile;
  }

  private requireApp(): DesktopAppServiceContract {
    const app = this.requireProfile().context.get?.("desktop.app") as DesktopAppServiceContract | undefined;
    if (app === undefined) throw new Error(this.#bootError ?? "Desktop application service is not ready.");
    return app;
  }
}

function findArtifactRef(value: unknown, artifactId: string): { readonly mimeType: string } | null {
  if (Array.isArray(value)) {
    for (const item of value) { const match = findArtifactRef(item, artifactId); if (match !== null) return match; }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.artifactId === artifactId && typeof record.mediaType === "string") return { mimeType: record.mediaType };
  for (const child of Object.values(record)) { const match = findArtifactRef(child, artifactId); if (match !== null) return match; }
  return null;
}

function attachmentMediaType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".pdf": return "application/pdf";
    case ".json": return "application/json";
    case ".csv": return "text/csv";
    case ".md": return "text/markdown";
    default: return "text/plain";
  }
}
