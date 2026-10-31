import { taskOperation } from "@actspace/shared/runtime-v2";

import { SessionModeWriter } from "./session-commands.js";
import { emitNotification, type CordisContext } from "@actspace/cordis-adapter";
import type { EventCodecRegistry, SessionEventCandidateV1, SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { resolveSideChatBoundary, resolveTurnBoundary } from "@actspace/side-chat";
import { projectTasks } from "./task-projection.js";
import type { SessionHandle } from "@actspace/session-persistence";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  MainAgentForm,
  RuntimeV2AgentMode,
  RuntimeV2JsonValue,
  RuntimeV2RunTurnRequest,
  RuntimeV2RunTurnResponse,
  RuntimeV2SessionListItem,
  RuntimeV2SessionSnapshot,
} from "@actspace/shared/runtime-v2";
import type { ManagedContextProjection } from "@actspace/shared";

export type ApplicationSessionService = {
  creationProvenance(mode?: RuntimeV2AgentMode): SessionHandle["header"]["createdWith"];
  readProjection(input: import("@actspace/shared/runtime-v2").RuntimeV2SessionProjectionInput): Promise<import("@actspace/shared/runtime-v2").RuntimeV2DesktopSessionProjection>;
  readObservation(input: import("@actspace/shared/runtime-v2").RuntimeV2SessionProjectionInput): Promise<import("@actspace/shared/runtime-v2").RuntimeV2SessionObservation>;
  subscribeProjection(listener: (update: import("@actspace/shared/runtime-v2").RuntimeV2SessionUpdate) => void): () => void;
  readonly store: {
    inspect(sessionId: string): Promise<{ readonly header: SessionHandle["header"] | null; readonly events: readonly SessionEventEnvelopeV1[] }>;
    fork(options: {
      readonly parentSessionId: string;
      readonly boundarySeq: number;
      readonly newSessionId: string;
      readonly createdAt: string;
      readonly createdWith: SessionHandle["header"]["createdWith"];
      readonly origin?: "fork" | "side-chat";
    }): Promise<SessionHandle>;
  };
  create(sessionId?: string, workspaceRoot?: string, agentForm?: MainAgentForm, worktree?: import("@actspace/shared").SessionWorktreeContext): Promise<SessionHandle>;
  resume(sessionId: string): Promise<SessionHandle>;
  snapshot(session: SessionHandle): RuntimeV2SessionSnapshot;
  inspect(sessionId: string): Promise<RuntimeV2SessionSnapshot>;
  inspectEvents(sessionId: string): Promise<readonly SessionEventEnvelopeV1[]>;
  list(): Promise<readonly RuntimeV2SessionListItem[]>;
  browseSessions(): Promise<import("@actspace/shared/runtime-v2").RuntimeV2BrowseList>;
  querySource?(sessionId: string): Promise<import("@actspace/session-storage").SessionQuerySource | null>;
  querySources?(): Promise<import("@actspace/session-storage").SessionQueryCatalog | null>;
  readEventBatch?(sessionId: string, input: import("@actspace/session-storage").SessionEventBatchInput): Promise<import("@actspace/session-storage").SessionEventBatch>;
  globalSessionSummaries(): Promise<readonly import("@actspace/shared/runtime-v2").RuntimeV2GlobalSessionSummary[]>;
  browseToolDetail(sessionId: string, callId: string): Promise<DesktopBrowsePage>;
  export(sessionId: string): Promise<string>;
  getOpen(sessionId: string): SessionHandle | undefined;
};

export type ApplicationRunService = {
  readonly service: import("./service.js").AgentService;
  inspectCapability<T, R>(name: string, inspect: (service: T | undefined) => R, sessionId?: string): R | Promise<R>;
  configuration(sessionId: string): import("@actspace/shared/runtime-v2").TaskConfiguration;
  configure(sessionId: string, configuration: import("@actspace/shared/runtime-v2").TaskConfiguration): void;
  initialize(sessionId: string): Promise<void>;
  run(sessionId: string, input: Omit<RuntimeV2RunTurnRequest, "sessionId">): Promise<RuntimeV2RunTurnResponse>;
  isActive(sessionId: string): boolean;
  abort(sessionId: string): boolean;
  isIdle?: () => boolean;
};

type AgentRuntimeService = { readonly runs: ApplicationRunService; readonly subagents?: { readonly activeCount: number }; readonly backgroundTasks?: { hasRunning(sessionId?: string): boolean } };

export type AgentApplicationContract = {
  readonly browserAvailable: () => Promise<boolean>;
  readonly taskCommand: (input: import("@actspace/shared/runtime-v2").TaskCommand) => Promise<import("@actspace/shared/runtime-v2").TaskCommandResult>;
  readonly submitTask: (sessionId: string, submissionId: string, content: RuntimeV2JsonValue) => Promise<import("@actspace/shared/runtime-v2").TaskReceipt>;
  readonly isIdleForReconfigure: () => Promise<boolean>;
  readonly readSessionProjection: ApplicationSessionService["readProjection"];
  readonly readSessionObservation: ApplicationSessionService["readObservation"];
  readonly subscribeSessionProjection: ApplicationSessionService["subscribeProjection"];
  readonly listSessions: () => Promise<readonly RuntimeV2SessionListItem[]>;
  readonly browseSessions: () => Promise<import("@actspace/shared/runtime-v2").RuntimeV2BrowseList>;
  readonly sessionQuerySource: (sessionId: string) => Promise<import("@actspace/session-storage").SessionQuerySource | null>;
  readonly sessionQuerySources: () => Promise<import("@actspace/session-storage").SessionQueryCatalog | null>;
  readonly globalSessionSummaries: () => Promise<readonly import("@actspace/shared/runtime-v2").RuntimeV2GlobalSessionSummary[]>;
  readonly browseToolDetail: (sessionId: string, callId: string) => Promise<DesktopBrowsePage>;
  readonly inspectSession: (sessionId: string) => Promise<RuntimeV2SessionSnapshot>;
  readonly readSessionEventBatch: (sessionId: string, input: import("@actspace/session-storage").SessionEventBatchInput) => Promise<import("@actspace/session-storage").SessionEventBatch>;
  readonly inspectSessionEvents: (sessionId: string) => Promise<readonly SessionEventEnvelopeV1[]>;
  readonly readContextEntryText: (sessionId: string, scope: string, key: string, revision: number, generation: string) => Promise<string | null>;
  readonly readContextProjection: (sessionId: string, logicalAgentScopeId?: string) => Promise<ManagedContextProjection | null>;
  readonly exportSession: (sessionId: string) => Promise<string>;
  readonly createMainSession: (sessionId?: string, workspaceRoot?: string, agentForm?: MainAgentForm, worktree?: import("@actspace/shared").SessionWorktreeContext) => Promise<RuntimeV2SessionSnapshot>;
  readonly resumeMainSession: (sessionId: string) => Promise<RuntimeV2SessionSnapshot>;
  readonly forkMainSession: (parentSessionId: string, boundary: number | ForkBoundary, newSessionId: string) => Promise<RuntimeV2SessionSnapshot>;
  readonly openSideChat: (parentSessionId: string, newSessionId: string) => Promise<SideChatOpened>;
  readonly abortRun: (sessionId: string, reason?: string) => boolean;
  readonly isRunActive: (sessionId: string) => boolean;
  readonly flushSession: (sessionId: string) => Promise<void>;
  readonly updateSessionMetadata: (sessionId: string, patch: { readonly title?: string | null; readonly pinned?: boolean; readonly archived?: boolean }) => Promise<RuntimeV2SessionSnapshot>;
  readonly updateSessionWorkspace: (sessionId: string, workspaceRoot: string) => Promise<RuntimeV2SessionSnapshot>;
  readonly updateSessionPermissionMode: (sessionId: string, mode: import("@actspace/shared/runtime-v2").PermissionMode) => Promise<RuntimeV2SessionSnapshot>;
  readonly updateSessionAgentMode: (sessionId: string, mode: RuntimeV2AgentMode, expectedRevision?: number) => Promise<RuntimeV2SessionSnapshot>;
  readonly revokeSessionGrant: (sessionId: string, grantId: string) => Promise<RuntimeV2SessionSnapshot>;
};

/** Fork at a Journal position, or at the end of one finished Turn (a fork from an assistant reply). */
export type ForkBoundary = { readonly turnId: string };
const FORK_TITLE_SUFFIX = "（分叉）";

/** A side chat forked from the parent's last completed Turn. */
export type SideChatOpened = {
  readonly snapshot: RuntimeV2SessionSnapshot;
  readonly inheritedTurnCount: number;
  readonly runningTurnExcluded: boolean;
};

export class AgentApplication implements AgentApplicationContract {
  readonly #sessions: ApplicationSessionService;
  readonly #runs: ApplicationRunService;
  readonly #subagents: { readonly activeCount: number } | undefined;
  readonly #backgroundTasks: AgentRuntimeService["backgroundTasks"];
  readonly #modeWriter = new SessionModeWriter();

  constructor(private readonly ctx: CordisContext, private readonly source = "application") {
    this.#sessions = required(ctx, "session.runtime");
    const agentRuntime = required<AgentRuntimeService>(ctx, "agent.runtime");
    this.#runs = agentRuntime.runs;
    this.#subagents = agentRuntime.subagents;
    this.#backgroundTasks = agentRuntime.backgroundTasks;
  }

  async browserAvailable(): Promise<boolean> {
    return this.#runs.inspectCapability<{ available?: boolean; registrations?: readonly unknown[]; definitions?: readonly unknown[] }, boolean>("tools.browser", browser => browser?.available === true && (browser.registrations?.length ?? 0) > 0 && browser.registrations?.length === browser.definitions?.length);
  }
  async submitTask(sessionId: string, submissionId: string, content: RuntimeV2JsonValue) {
    this.#modeWriter.assertAvailable(sessionId);
    const session = await this.#sessions.resume(sessionId);
    const model = this.#runs.configuration(sessionId).model;
    const receipt = await this.#runs.service.submit(sessionId, submissionId, content);
    if (!taskOperation(content)) emitNotification(this.ctx, "application/run-preparing", { session, input: { sessionId, content, model }, snapshot: this.#sessions.snapshot(session) });
    return receipt;
  }
  async taskCommand(input: import("@actspace/shared/runtime-v2").TaskCommand): Promise<import("@actspace/shared/runtime-v2").TaskCommandResult> {
    const service = this.#runs.service;
    try {
      switch (input.op) {
        case "snapshot": break;
        case "configure": this.#runs.configure(input.sessionId, input.configuration); break;
        case "designate": await service.designate(input.sessionId, input.taskId, input.runId, input.revision); break;
        case "cancel": await service.cancel(input.sessionId, input.taskId, input.revision); break;
        case "move": await service.move(input.sessionId, input.taskId, input.beforeTaskId, input.revision); break;
        case "resume": await service.resume(input.sessionId, input.revision); break;
        case "stop": await service.stop(input.sessionId, input.runId); break;
      }
      return { snapshot: await service.snapshot(input.sessionId) };
    } catch (error) {
      if (error && typeof error === "object" && "snapshot" in error && error.snapshot) return { snapshot: error.snapshot as import("@actspace/shared/runtime-v2").TaskSnapshot, error: error instanceof Error ? error.message : String(error) };
      throw error;
    }
  }
  listSessions() { return this.#sessions.list(); }
  async isIdleForReconfigure(): Promise<boolean> {
    if (this.#runs.isIdle?.() !== true) return false;
    if (this.#subagents?.activeCount || this.#backgroundTasks?.hasRunning()) return false;
    for (const item of await this.#sessions.list()) {
      const snapshot = await this.#sessions.inspect(item.sessionId);
      // An unread background notification waits for the next Run; it does not hold a reconfigure.
      if (snapshot.pendingInbox.some(entry => entry.source !== "task_notification")) return false;
    }
    return this.#runs.isIdle?.() === true;
  }
  readSessionProjection(input: import("@actspace/shared/runtime-v2").RuntimeV2SessionProjectionInput) { return this.#sessions.readProjection(input); }
  readSessionObservation(input: import("@actspace/shared/runtime-v2").RuntimeV2SessionProjectionInput) { return this.#sessions.readObservation(input); }
  subscribeSessionProjection(listener: (update: import("@actspace/shared/runtime-v2").RuntimeV2SessionUpdate) => void) { return this.#sessions.subscribeProjection(listener); }
  browseSessions() { return this.#sessions.browseSessions(); }
  async sessionQuerySource(sessionId: string) { return this.#sessions.querySource?.(sessionId) ?? null; }
  async sessionQuerySources() {
    if (!this.#sessions.querySources) return null;
    return this.#sessions.querySources();
  }
  globalSessionSummaries() { return this.#sessions.globalSessionSummaries(); }
  browseToolDetail(sessionId: string, callId: string) { return this.#sessions.browseToolDetail(sessionId, callId); }
  inspectSession(sessionId: string) { return this.#sessions.inspect(sessionId); }
  async readSessionEventBatch(sessionId: string, input: import("@actspace/session-storage").SessionEventBatchInput) {
    if (!this.#sessions.readEventBatch) throw new Error("Session provider does not support bounded query reads.");
    return this.#sessions.readEventBatch(sessionId, input);
  }
  inspectSessionEvents(sessionId: string) { return this.#sessions.inspectEvents(sessionId); }
  async readContextProjection(sessionId: string, logicalAgentScopeId = `main:${sessionId}`): Promise<ManagedContextProjection | null> {
    const projection = await this.#runs.inspectCapability<{ readonly getProjection?: (id: string, scope?: string, basis?: "current-context" | "request") => ManagedContextProjection | undefined }, ManagedContextProjection | undefined>("context.engine", service => service?.getProjection?.(sessionId, logicalAgentScopeId, "current-context"), sessionId);
    return projection ?? null;
  }
  async readContextEntryText(sessionId: string, scope: string, key: string, revision: number, generation: string): Promise<string | null> {
    return await this.#runs.inspectCapability<{ readEntry?: (id: string, scope: string, key: string, revision: number, generation: string) => string | null }, string | null>("context.engine", service => service?.readEntry?.(sessionId, scope, key, revision, generation) ?? null, sessionId);
  }
  exportSession(sessionId: string) { return this.#sessions.export(sessionId); }

  async createMainSession(sessionId?: string, workspaceRoot?: string, agentForm: MainAgentForm = "agent", worktree?: import("@actspace/shared").SessionWorktreeContext): Promise<RuntimeV2SessionSnapshot> {
    const session = await this.#sessions.create(sessionId, workspaceRoot, agentForm, worktree);
    await this.#runs.initialize(session.header.sessionId);
    return this.#sessions.snapshot(session);
  }

  async resumeMainSession(sessionId: string): Promise<RuntimeV2SessionSnapshot> {
    const session = await this.#sessions.resume(sessionId);
    if (session.header.lineage?.origin === "delegation") throw new Error("Child Sessions cannot be resumed through the main application entry.");
    await this.#runs.initialize(session.header.sessionId);
    return this.#sessions.snapshot(session);
  }

  async forkMainSession(parentSessionId: string, boundary: number | ForkBoundary, newSessionId: string): Promise<RuntimeV2SessionSnapshot> {
    await this.#sessions.getOpen(parentSessionId)?.flush();
    const parent = await this.#sessions.store.inspect(parentSessionId);
    if (parent.header === null) throw new Error(`Parent Session ${parentSessionId} has no header.`);
    // A reply's fork ends with its Turn plus the Host's run-finish fact, so the copy holds no unfinished Run.
    const boundarySeq = typeof boundary === "number" ? boundary : resolveTurnBoundary(
      parent.events,
      required<{ readonly registry: EventCodecRegistry }>(this.ctx, "session.journal").registry,
      boundary.turnId,
      prefix => { const tasks = projectTasks(parentSessionId, prefix); return tasks.runs.every(run => run.state !== "running") && tasks.tasks.every(task => task.state !== "claimed"); },
    );
    const forked = this.#sessions.snapshot(await this.#fork(parent.header, boundarySeq, newSessionId, "fork"));
    const title = forked.metadata.title;
    if (title === null || title.endsWith(FORK_TITLE_SUFFIX)) return forked;
    return this.updateSessionMetadata(newSessionId, { title: `${title}${FORK_TITLE_SUFFIX}` });
  }

  /**
   * Fork a side chat at the parent's last completed Turn, so a running Turn
   * stays with the parent. Side chats start in Plan mode when the parent has
   * tools and a workspace; Chat-form parents stay Chat.
   */
  async openSideChat(parentSessionId: string, newSessionId: string): Promise<SideChatOpened> {
    await this.#sessions.getOpen(parentSessionId)?.flush();
    const parent = await this.#sessions.store.inspect(parentSessionId);
    if (parent.header === null) throw new Error(`Parent Session ${parentSessionId} has no header.`);
    if (parent.header.lineage?.origin === "side-chat" || parent.header.lineage?.origin === "delegation") throw new Error("SIDE_CHAT_PARENT_NOT_MAIN");
    const { boundarySeq, inheritedTurnCount, runningTurnExcluded } = resolveSideChatBoundary(parent.events, required<{ readonly registry: EventCodecRegistry }>(this.ctx, "session.journal").registry);
    const session = await this.#fork(parent.header, boundarySeq, newSessionId, "side-chat");
    const forked = this.#sessions.snapshot(session);
    const snapshot = forked.agentMode !== "chat" && forked.workspaceRoot !== null ? await this.#changeAgentMode(session, "plan") : forked;
    return { snapshot, inheritedTurnCount, runningTurnExcluded };
  }

  async #fork(parentHeader: SessionHandle["header"], boundarySeq: number, newSessionId: string, origin: "fork" | "side-chat"): Promise<SessionHandle> {
    const fork = await this.#sessions.store.fork({
      parentSessionId: parentHeader.sessionId,
      boundarySeq,
      newSessionId,
      createdAt: new Date().toISOString(),
      createdWith: this.#sessions.creationProvenance(parentHeader.createdWith.initialAgentMode),
      origin,
    });
    // Store.fork owns a temporary writer. Reopen through the controller so the
    // run, projection callbacks and shutdown all share one managed handle.
    await fork.close();
    const session = await this.#sessions.resume(newSessionId);
    await session.flush();
    await this.#runs.initialize(session.header.sessionId);
    return session;
  }

  async updateSessionAgentMode(sessionId: string, mode: RuntimeV2AgentMode, expectedRevision?: number): Promise<RuntimeV2SessionSnapshot> {
    this.#modeWriter.assertAvailable(sessionId);
    return this.#runs.service.exclusive(sessionId, async () => {
      if (this.#backgroundTasks?.hasRunning(sessionId)) throw new Error("SESSION_BUSY");
      const session = await this.#sessions.resume(sessionId);
      const snapshot = this.#sessions.snapshot(session);
      if (expectedRevision !== undefined && expectedRevision !== (snapshot.agentModeRevision ?? 0)) throw new Error("AGENT_MODE_CONFLICT");
      if (snapshot.activity.activeTurnId !== null || snapshot.delegations.some(item => item.state !== "completed")) throw new Error("SESSION_BUSY");
      return this.#changeAgentMode(session, mode);
    });
  }

  async #changeAgentMode(session: SessionHandle, mode: RuntimeV2AgentMode): Promise<RuntimeV2SessionSnapshot> {
    return this.#modeWriter.change(session, mode, value => this.#sessions.snapshot(value), this.source);
  }

  abortRun(sessionId: string, _reason?: string) { return this.#runs.abort(sessionId); }
  isRunActive(sessionId: string) { return this.#runs.isActive(sessionId); }

  async flushSession(sessionId: string): Promise<void> {
    const session = this.#sessions.getOpen(sessionId);
    if (session === undefined) throw new Error(`Session ${sessionId} is not open.`);
    await session.flush();
  }

  async updateSessionMetadata(sessionId: string, patch: { readonly title?: string | null; readonly pinned?: boolean; readonly archived?: boolean }) {
    if (patch.title !== undefined) emitNotification(this.ctx, "application/title-changing", { sessionId });
    const session = await this.#sessions.resume(sessionId);
    const events: SessionEventCandidateV1[] = [];
    if (patch.title !== undefined) events.push(core("session/title-set", { title: patch.title === null ? null : patch.title.trim().slice(0, 160) || null }));
    if (patch.pinned !== undefined) events.push(core("session/pinned-set", { pinned: patch.pinned }));
    if (patch.archived !== undefined) events.push(core("session/archived-set", { archived: patch.archived }));
    if (events.length > 0) { await session.appendMany(events); await session.flush(); }
    return this.#sessions.snapshot(session);
  }

  async updateSessionWorkspace(sessionId: string, workspaceRoot: string) {
    const next = workspaceRoot.trim();
    if (!next) throw new Error("workspaceRoot must not be empty.");
    return this.#runs.service.exclusive(sessionId, async () => {
      const session = await this.#sessions.resume(sessionId);
      if (session.header.worktree && next !== session.header.worktree.workspaceRoot) throw new Error("A worktree Session cannot change workspace.");
      const snapshot = this.#sessions.snapshot(session);
      const events: SessionEventCandidateV1[] = [];
      if (snapshot.workspaceRoot !== next) {
        for (const grant of snapshot.sessionGrants) {
          if (grant.selector.kind === "command_prefix") events.push(core("permission/grant-revoked", { schemaVersion: 1, grantId: grant.grantId, sessionId, agentId: grant.agentId, revokedAt: new Date().toISOString(), reason: "workspace-changed" }));
        }
      }
      events.push(core("session/workspace-set", { workspaceRoot: next }));
      await session.appendMany(events);
      await session.flush();
      return this.#sessions.snapshot(session);
    });
  }

  async updateSessionPermissionMode(sessionId: string, mode: import("@actspace/shared/runtime-v2").PermissionMode) {
    const session = await this.#sessions.resume(sessionId);
    const snapshot = this.#sessions.snapshot(session);
    if (snapshot.permissionMode === mode) return snapshot;
    const changedAt = new Date().toISOString();
    const events: SessionEventCandidateV1[] = [];
    if (snapshot.permissionMode === "full-access" && mode === "default") {
      for (const grant of snapshot.sessionGrants) {
        if (grant.selector.kind === "command_prefix") continue;
        const path = grant.selector.kind === "exact" ? grant.selector.canonicalPath : grant.selector.canonicalRoot;
        if (snapshot.workspaceRoot === null || !isPathWithin(snapshot.workspaceRoot, path)) events.push(core("permission/grant-revoked", { schemaVersion: 1, grantId: grant.grantId, sessionId, agentId: grant.agentId, revokedAt: changedAt, reason: "permission-mode-downgrade" }));
      }
    }
    events.push(core("permission/mode-set", { mode, changedAt, source: this.source }));
    await session.appendMany(events);
    await session.flush();
    return this.#sessions.snapshot(session);
  }

  async revokeSessionGrant(sessionId: string, grantId: string) {
    const session = await this.#sessions.resume(sessionId);
    const snapshot = this.#sessions.snapshot(session);
    const grant = snapshot.sessionGrants.find((candidate) => candidate.grantId === grantId);
    if (grant === undefined || grant.sessionId !== sessionId || grant.agentId !== `main:${sessionId}`) throw new Error("Session Grant is not active for this main Agent.");
    await session.append(core("permission/grant-revoked", { schemaVersion: 1, grantId, sessionId, agentId: grant.agentId, revokedAt: new Date().toISOString(), reason: "user-revoked" }));
    await session.flush();
    return this.#sessions.snapshot(session);
  }

}

function isPathWithin(root: string, candidate: string): boolean {
  const nested = relative(resolve(root), resolve(candidate));
  return nested === "" || (!nested.startsWith(`..${sep}`) && nested !== ".." && !isAbsolute(nested));
}

function required<T>(ctx: CordisContext, id: string): T {
  const value = ctx.get?.(id) as T | undefined;
  if (value === undefined) throw new Error(`Agent application requires ${id}.`);
  return value;
}

function core(type: string, data: RuntimeV2JsonValue): SessionEventCandidateV1 { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never; }

export type DesktopBrowsePage = { deferredToolCalls?: string[]; snapshot: RuntimeV2SessionSnapshot; journal: readonly SessionEventEnvelopeV1[]; history: { before: number | null; throughJournalSeq: number } };

/** Same-process application observations; listeners own any background work. */
export interface ApplicationEvents {
  /** @mode emit */
  "application/run-preparing": (event: { session: SessionHandle; input: RuntimeV2RunTurnRequest; snapshot: RuntimeV2SessionSnapshot }) => void;
  /** @mode emit */
  "application/title-changing": (event: { sessionId: string }) => void;
}
declare module "@actspace/cordis-adapter" { interface DomainEvents extends ApplicationEvents {} }
