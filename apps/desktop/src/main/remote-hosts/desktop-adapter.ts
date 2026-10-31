import { join } from "node:path";
import { isDelegatedSession } from "@actspace/shared/session-list-page";
import { toolPreview } from "@actspace/client/sessions";
import { RemoteArtifacts } from "./artifacts";
import { PendingSubmissions } from "./pending-submissions";
import { FixedRendererStreamAdapter } from "../runtime-v2/fixed-renderer-stream-adapter";
import { executionEnvironment } from "../runtime-v2/approval-broker";
import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS as C, type RuntimeV2SessionListItem, type RuntimeV2SessionObservation, type TaskSnapshot } from "@actspace/shared/runtime-v2";
import type { SessionListItem, SessionListPage, SessionListPageInput } from "@actspace/shared";
import { HOST_IPC, isRecord, type SessionRef } from "@actspace/shared/host-protocol";
import { RemoteSessionRouter, attachmentUploadSources, parseRemoteSessionKey, remoteSessionKey } from "./session-router";
import { RemoteSessionCache } from "./session-cache";
import { hasSessionLocatorPrefix } from "@actspace/shared/session-locator";
import { desktopRemoteObservation, desktopRemotePage } from "./projection";
import type { RemoteHostRegistry } from "./registry";
/**
 * renderer 看到的远端审批 id。格式沿用改造前的写法，已有的待审批项不受影响；
 * 路由看事件和列表里单独的 `hostId`（15 T10），不再从 id 里拆。
 */
export function remoteApprovalId(hostId: string, requestId: string): string {
  return `remote-approval:${hostId}:${requestId}`;
}

export class RemoteDesktopAdapter {
  readonly #router: RemoteSessionRouter;
  readonly #artifacts: RemoteArtifacts;
  readonly #pending: PendingSubmissions;
  readonly #approvalRefs = new Map<string, { ref: SessionRef; requestId: string }>();
  readonly #cache: RemoteSessionCache;
  readonly #cacheReady: Promise<void>;
  readonly #subscribed = new Map<string, string>();
  #activeKey: string | null = null;
  readonly #observing = new Map<string, Promise<void>>();
  readonly #replaying = new Map<string, (() => void)[]>();
  readonly #cursors = new Map<string, number>();
  readonly #stream = new FixedRendererStreamAdapter();
  readonly #cleanup: (() => void)[] = [];
  #sequence = 0;
  constructor(private readonly hosts: RemoteHostRegistry, private readonly getWindow: () => BrowserWindow | undefined, root: string) {
    this.#cache = new RemoteSessionCache(join(root, "remote-session-cache"));
    this.#cacheReady = this.#cache.open();
    this.#router = new RemoteSessionRouter(hosts);
    this.#pending = new PendingSubmissions(root);
    this.#artifacts = new RemoteArtifacts(this.#router, getWindow);
    this.#cleanup.push(this.#stream.subscribe(event => this.#send(C.agentStream, event)));
    this.#cleanup.push(hosts.subscribeEvents((hostId, envelope) => {
      const cursorKey = `${hostId}:${envelope.epoch}:${envelope.subscriptionId}`;
      if ((this.#cursors.get(cursorKey) ?? -1) >= envelope.cursor) return;
      this.#cursors.set(cursorKey, envelope.cursor);
      const value = envelope.value;
      if (!isRecord(value)) return;
      if (value.kind === "live" && isRecord(value.event) && typeof value.event.sessionId === "string") {
        const key = remoteSessionKey({ hostId, sessionId: value.event.sessionId });
        const accept = () => this.#stream.accept({ ...value.event as object, sessionId: key } as unknown as import("@actspace/runtime").AgentLoopLiveEvent);
        const buffer = this.#replaying.get(key); if (buffer) buffer.push(accept); else accept();
      } else if (value.kind === "projection" && isRecord(value.update) && typeof value.update.sessionId === "string") {
        const key = remoteSessionKey({ hostId, sessionId: value.update.sessionId });
        this.#emitLive(key, "journal-update", "session-title-updated", { ...value.update, sessionId: key, ...(isRecord(value.update.event) ? { event: { ...value.update.event, sessionId: key } } : {}) });
      } else if (value.kind === "tasks" && isRecord(value.snapshot) && typeof value.snapshot.sessionId === "string") this.#emitLive(remoteSessionKey({ hostId, sessionId: value.snapshot.sessionId }), "runtime-live", "task-queue-updated");
      else if (value.kind === "approvals" && Array.isArray(value.requests)) {
        if (isRecord(value.settled) && isRecord(value.settled.request) && isRecord(value.settled.decision)) {
          const request = value.settled.request;
          this.#send(C.agentStream, { type: "tool_approval_resolved", sessionId: remoteSessionKey({ hostId, sessionId: String(request.sessionId) }), agentRunId: request.agentRunId, toolCallId: request.callId, requestId: remoteApprovalId(hostId, String(request.requestId)), hostId, decision: value.settled.decision.kind });
        }
        this.#publishApprovals(hostId, value.requests as import("@actspace/shared/runtime-v2").ApprovalRequest[], typeof value.sessionId === "string" ? value.sessionId : undefined);
        this.#emitLive("", "runtime-live", "session-title-updated");
      }
      else this.#emitLive("", "runtime-live", "session-title-updated");
    }));
    this.#cleanup.push(hosts.subscribe(() => {
      for (const key of this.#subscribed.keys()) {
        const hostId = JSON.parse(key)[0];
        if (hosts.list().find(host => host.hostId === hostId)?.state !== "connected") this.#subscribed.delete(key);
      }
      this.#emitLive("", "runtime-live", "session-title-updated");
    }));
  }
  async activate(sessionId: string | null): Promise<void> {
    const ref = sessionId ? parseRemoteSessionKey(sessionId) : null;
    const key = ref ? JSON.stringify([ref.hostId, ref.sessionId]) : null;
    this.#activeKey = key;
    for (const [previous, subscriptionId] of this.#subscribed) {
      if (previous === key) continue;
      this.#subscribed.delete(previous);
      const hostId = (JSON.parse(previous) as string[])[0]!;
      if (subscriptionId) await this.hosts.call(hostId, "sessions.unobserve", { subscriptionId }).catch(() => undefined);
      for (const cursor of this.#cursors.keys()) if (cursor.endsWith(`:${subscriptionId}`)) this.#cursors.delete(cursor);
    }
    if (ref && this.#activeKey === key && this.hosts.list().find(host => host.hostId === ref.hostId)?.state === "connected") await this.#observe(ref);
  }
  #publishApprovals(hostId: string, requests: readonly import("@actspace/shared/runtime-v2").ApprovalRequest[], scope?: string) {
    const live = new Set(requests.map(request => remoteApprovalId(hostId, request.requestId)));
    for (const [id, known] of this.#approvalRefs) {
      if (known.ref.hostId === hostId && (!scope || known.ref.sessionId === scope) && !live.has(id)) {
        this.#approvalRefs.delete(id); this.#emitLive(remoteSessionKey(known.ref), "runtime-live", "session-title-updated");
      }
    }
    for (const request of requests) {
      const ref = { hostId, sessionId: request.sessionId }, requestId = remoteApprovalId(hostId, request.requestId);
      this.#approvalRefs.set(requestId, { ref, requestId: request.requestId });
      this.#send(C.agentStream, { type: "tool_approval_required", sessionId: remoteSessionKey(ref), agentRunId: request.agentRunId, toolCallId: request.callId, toolName: request.toolName, requestId, hostId, summary: JSON.stringify(request.resources), reason: request.reasons.join(", "), executionEnvironment: executionEnvironment(request.resources) });
    }
  }
  #send(channel: string, value: unknown) { const window = this.getWindow(); if (window && !window.isDestroyed()) window.webContents.send(channel, value); }
  #emitLive(sessionId: string, kind: "journal-update" | "runtime-live", message: string, update?: unknown) {
    this.#send(C.sessionLiveEvent, { emittedAt: new Date().toISOString(), event: { schemaVersion: 1, runtimeInstanceId: "remote", liveSeq: ++this.#sequence, throughJournalSeq: isRecord(update) ? update.throughJournalSeq : -1, sessionId, kind, message, ...(update ? { update } : {}) } });
  }
  #observe(ref: SessionRef): Promise<void> {
    const key = JSON.stringify([ref.hostId, ref.sessionId]);
    const existing = this.#observing.get(key); if (existing) return existing;
    const operation = (async () => {
      for (let attempt = 0; ; attempt++) {
        try { await this.#startObservation(ref); return; }
        catch (error) { if (attempt >= 2 || !isRecord(error) || error.kind !== "CONFLICT") throw error; }
      }
    })().finally(() => this.#observing.delete(key));
    this.#observing.set(key, operation); return operation;
  }
  async #startObservation(ref: SessionRef): Promise<void> {
    const key = JSON.stringify([ref.hostId, ref.sessionId]); if (this.#subscribed.has(key)) return;
    this.#subscribed.set(key, "");
    const sessionId = remoteSessionKey(ref), buffered: (() => void)[] = []; this.#replaying.set(sessionId, buffered);
    try {
      const value = await this.#router.call(ref, "sessions.observe") as { subscriptionId: string; cursor: number; snapshot: { observation: RuntimeV2SessionObservation; tasks: TaskSnapshot; approvals: import("@actspace/shared/runtime-v2").ApprovalRequest[]; output: { runId: string; chunks: number } | null } };
      if (this.#activeKey !== key) {
        await this.hosts.call(ref.hostId, "sessions.unobserve", { subscriptionId: value.subscriptionId });
        this.#subscribed.delete(key); return;
      }
      this.#subscribed.set(key, value.subscriptionId);
      await this.#cache.setObservation(ref, value.snapshot.observation);
      const running = value.snapshot.tasks.runs.find(run => run.state === "running");
      if (running) {
        this.#send(C.agentStream, { type: "agent_run_started", sessionId, agentRunId: running.runId, recoveredReset: true });
        const output = value.snapshot.output;
        if (output?.runId === running.runId) {
          let offset = 0;
          while (offset < output.chunks) {
            const page = await this.#router.call(ref, "sessions.output", { runId: output.runId, offset }) as { next: number; chunks: { kind: string; messageId: string; text: string }[] };
            if (page.next <= offset) throw new Error("Host output page did not advance");
            for (const chunk of page.chunks.slice(0, output.chunks - offset)) this.#send(C.agentStream, { type: chunk.kind === "assistant-delta" ? "assistant_text_delta" : "assistant_thinking_delta", sessionId, agentRunId: running.runId, messageId: chunk.messageId, delta: chunk.text });
            offset = page.next;
          }
        }
      }
      this.#publishApprovals(ref.hostId, value.snapshot.approvals, ref.sessionId);
      for (const accept of buffered) accept();
      this.#emitLive(sessionId, "runtime-live", "task-queue-updated");
    } catch (error) {
      const subscriptionId = this.#subscribed.get(key); this.#subscribed.delete(key);
      if (subscriptionId) await this.hosts.call(ref.hostId, "sessions.unobserve", { subscriptionId }).catch(() => undefined);
      throw error;
    }
    finally { this.#replaying.delete(sessionId); }
  }
  dispose(): void { this.#cleanup.forEach(cleanup => cleanup()); this.#stream.dispose(); }
  async create(input: Record<string, unknown>): Promise<unknown> {
    if (typeof input.hostId !== "string" || typeof input.workspaceId !== "string") throw new Error("Choose a Host workspace");
    const created = await this.hosts.call(input.hostId, "sessions.create", { workspaceId: input.workspaceId, agentForm: input.agentForm ?? "agent" }) as { sessionId: string };
    return this.handle(C.getSessionPage, {}, { hostId: input.hostId, sessionId: created.sessionId });
  }
  async decide(input: Record<string, unknown>): Promise<unknown> {
    const approval = this.#approvalRefs.get(String(input.requestId));
    if (!approval) throw new Error("Remote approval is no longer available; refresh the Session");
    if (input.hostId !== undefined && input.hostId !== approval.ref.hostId) throw new Error("Remote approval belongs to another Host");
    await this.#router.call(approval.ref, "approvals.decide", { requestId: approval.requestId, kind: input.decision, ...(input.suggestionId ? { suggestionId: input.suggestionId } : {}) });
    this.#approvalRefs.delete(String(input.requestId)); return { ok: true };
  }
  async list(archived = false): Promise<SessionListItem[]> {
    await this.#cacheReady;
    const connections = this.hosts.list();
    await Promise.all(connections.filter(host => host.state === "connected").map(async host => {
      try { await this.#cache.setList(host.hostId, await this.hosts.call(host.hostId, "sessions.list", {}) as RuntimeV2SessionListItem[]); }
      catch { /* preserve last known list on connection failure */ }
    }));
    return this.#cache.list(connections).filter(({ session }) => session.metadata.archived === archived && !isDelegatedSession(session.lineage)).map(({ hostId, hostName, connectionState, session }) => ({
      id: remoteSessionKey({ hostId, sessionId: session.sessionId }), hostId, hostName, connectionState,
      title: session.metadata.title ?? "New chat", updatedAt: session.updatedAt, agentRunCount: session.completedTurnCount ?? 0, workspaceRoot: session.workspaceRoot ?? undefined,
      ...(session.worktree ? { worktree: session.worktree } : {}),
      pinned: session.metadata.pinned, archived: session.metadata.archived, agentMode: session.agentMode, agentModeRevision: session.agentModeRevision, agentForm: session.agentForm, accessState: session.accessState, isChildSession: false,
    }));
  }
  async mergeList(channel: string, input: unknown, local: unknown): Promise<unknown> {
    if (channel === C.listPendingApprovals && (!isRecord(input) || !input.sessionId)) {
      const results = await Promise.all(this.hosts.list().filter(host => host.state === "connected").map(async host => {
        try {
          const requests = await this.hosts.call(host.hostId, "approvals.list", {}) as import("@actspace/shared/runtime-v2").ApprovalRequest[];
          return requests.map(request => ({ requestId: remoteApprovalId(host.hostId, request.requestId), hostId: host.hostId, toolName: request.toolName, summary: JSON.stringify(request.resources), reason: request.reasons.join(", "), createdAt: Date.parse(request.requestedAt), expiresAt: Date.parse(request.expiresAt), grantSuggestions: request.grantSuggestions, supportedLifetimes: request.supportedLifetimes }));
        } catch { return []; }
      }));
      return [...local as unknown[], ...results.flat()];
    }
    if (channel === C.listSessions) return [...local as SessionListItem[], ...await this.list(isRecord(input) && input.archived === true)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (channel === C.listSessionPage) {
      const page = local as SessionListPage, query = (isRecord(input) ? input : {}) as SessionListPageInput;
      const connections = this.hosts.list().filter(host => query.hostId ? host.hostId === query.hostId : query.workspaceRoot === undefined);
      const remote = await Promise.all(connections.map(async host => {
        const { hostId: _host, after, ...filter } = query;
        const originalAfter = after ? parseRemoteSessionKey(after) : null;
        if (originalAfter && originalAfter.hostId !== host.hostId) throw new Error("List cursor belongs to another Host");
        const key = JSON.stringify([host.hostId, filter.workspaceRoot, filter.pinned, originalAfter?.sessionId]);
        try {
          if (host.state !== "connected") throw new Error("offline");
          const value = await this.hosts.call(host.hostId, "sessions.browse", { ...filter, ...(originalAfter ? { after: originalAfter.sessionId } : {}) }) as SessionListPage;
          await this.#cache.setPage(key, value);
        } catch { /* Retain the last displayed page while offline. */ }
        const value = await this.#cache.readPage(key);
        const items = value?.items ?? (await this.list()).filter(item => item.hostId === host.hostId);
        return { items: items.map(item => ({ ...item, id: hasSessionLocatorPrefix(item.id) ? item.id : remoteSessionKey({ hostId: host.hostId, sessionId: item.id }), hostId: host.hostId, hostName: host.name, connectionState: host.state })), groups: (value?.groups ?? []).map(group => ({ ...group, hostId: host.hostId })) };
      }));
      return { ...page, items: [...page.items, ...remote.flatMap(value => value.items)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), groups: [...page.groups, ...remote.flatMap(value => value.groups)] };
    }
    return local;
  }
  async handle(channel: string, input: Record<string, unknown>, ref: SessionRef): Promise<unknown> {
    const sessionId = remoteSessionKey(ref), call = (method: Parameters<RemoteSessionRouter["call"]>[1], params: Record<string, unknown> = {}) => this.#router.call(ref, method, params);
    const observation = async () => {
      const connected = this.hosts.list().find(host => host.hostId === ref.hostId)?.state === "connected";
      if (!connected) { const cached = await this.#cache.readObservation(ref); if (!cached) throw new Error("Host is offline; no cached history"); return cached; }
      if (this.#activeKey === JSON.stringify([ref.hostId, ref.sessionId])) await this.#observe(ref);
      const value = await call("sessions.page", input.beforeSeq === undefined ? {} : { beforeSeq: input.beforeSeq }) as RuntimeV2SessionObservation;
      if (input.beforeSeq === undefined) await this.#cache.setObservation(ref, value); return value;
    };
    switch (channel) {
      case C.getSessionToolDetail: {
        const page = await call("sessions.tool", { callId: input.callId }) as { snapshot: Record<string, unknown>; journal: Record<string, unknown>[] };
        return { ...page, snapshot: { ...page.snapshot, sessionId }, journal: page.journal.map(event => ({ ...event, sessionId })) };
      }
      case C.readSessionArtifact: return this.#artifacts.preview(ref, String(input.artifactPath));
      case C.showArtifactContextMenu: return this.#artifacts.menu(ref, String(input.artifactPath));
      case C.getSession: case C.getSessionPage: case C.getSessionProjectionSnapshot: return desktopRemotePage(ref.hostId, await observation());
      case C.getSessionObservation: return desktopRemoteObservation(ref.hostId, await observation());
      case C.getSessionPreview: { const value = await observation(); return { sessionId, workspaceRoot: value.snapshot.workspaceRoot, contextSnapshot: null }; }
      case C.taskCommand: { const { sessionId: _ignored, ...command } = input; const result = await call("tasks.command", command) as { snapshot: TaskSnapshot; error?: string }; return { ...result, snapshot: { ...result.snapshot, sessionId } }; }
      case C.pinSession: case C.renameSession: case C.archiveSession: {
        const field = channel === C.pinSession ? "pinned" : channel === C.renameSession ? "title" : "archived";
        await call("sessions.update", { patch: { [field]: input[field] } }); return { ok: true };
      }
      case C.setSessionAgentMode: { const result = await call("sessions.update", { patch: { mode: input.mode, expectedRevision: input.expectedRevision } }) as { agentMode: string; agentModeRevision: number }; return { ok: true, mode: result.agentMode, revision: result.agentModeRevision }; }
      case C.setSessionPermissionMode: await call("sessions.update", { patch: { permissionMode: input.mode } }); return { ok: true, mode: input.mode };
      case C.revokeSessionGrant: await call("sessions.revokeGrant", { grantId: input.grantId }); return { ok: true };
      case C.forkSession: { const boundary = input.turnId !== undefined ? { turnId: input.turnId } : { boundarySeq: (await observation()).snapshot.throughJournalSeq }; const next = await call("sessions.fork", { ...boundary, newSessionId: randomUUID() }) as { sessionId: string }; return this.handle(C.getSessionPage, {}, { hostId: ref.hostId, sessionId: next.sessionId }); }
      case C.submitTask: {
        const paths = attachmentUploadSources(ref, input.attachments);
        if (typeof input.submissionId !== "string") throw new Error("Missing submission identity");
        return this.#pending.withRecord(ref, input.submissionId, JSON.stringify({ text: input.userInput, paths, fileReferences: input.fileReferences ?? [], responseAnnotations: input.responseAnnotations ?? [] }), async (record, save) => {
          // Once prepared, the exact same Host content is used even after Main restarts.
          const progress = (bytes: number, total: number, state = "uploading") => this.#send(HOST_IPC.uploadProgress, { sessionId, submissionId: input.submissionId, bytes, total, state });
          let submitted = false;
          try {
          if (!record.ready) { await this.#router.upload(ref, paths, (bytes, total) => progress(bytes, total), record.uploadIds, save, id => this.#artifacts.read(ref, id)); record.ready = true; await save(); }
          progress(0, 0, "submitting");
          submitted = true;
          return await call("tasks.submit", { submissionId: input.submissionId, content: input.userInput, fileReferences: input.fileReferences ?? [], responseAnnotations: input.responseAnnotations ?? [], ...(record.uploadIds.length ? { uploadIds: record.uploadIds } : {}) });
          } catch (error) {
            const rejected = !submitted || (isRecord(error) && typeof error.kind === "string");
            return { status: "submission-failed", acknowledgement: rejected ? "rejected" : "unknown", message: error instanceof Error ? error.message : "提交失败，请稍后重试。" };
          } finally { progress(0, 0, "finished"); }
        });
      }
      case C.listPendingApprovals: {
        const requests = await call("approvals.list") as import("@actspace/shared/runtime-v2").ApprovalRequest[];
        return requests.map(request => {
          const requestId = remoteApprovalId(ref.hostId, request.requestId);
          this.#approvalRefs.set(requestId, { ref, requestId: request.requestId });
          return { requestId, hostId: ref.hostId, recovery: { agentRunId: request.agentRunId, toolCallId: request.callId, preview: toolPreview(request.toolName, undefined, { summary: JSON.stringify(request.resources) }, { args: {} }, undefined, sessionId, request.agentRunId, "running") }, toolName: request.toolName, summary: JSON.stringify(request.resources), reason: request.reasons.join(", "), createdAt: Date.parse(request.requestedAt), expiresAt: Date.parse(request.expiresAt), grantSuggestions: request.grantSuggestions, supportedLifetimes: request.supportedLifetimes };
        });
      }
      case C.abortAgentRun: await call("tasks.command", { op: "stop", runId: input.agentRunId }); return true;
      default: throw new Error("This operation is unavailable for remote sessions");
    }
  }
}
