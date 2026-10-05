import type {
  AppSettings,
  BootstrapState,
  PendingApprovalInfo,
  SessionCreateInput,
  SessionListItem,
  SettingsV4Snapshot,
  WorkspaceRegistry,
} from "@actspace/shared";
import type { HostConnection } from "@actspace/shared/host-protocol";
import type {
  RuntimeV2DesktopSessionProjection,
  RuntimeV2SessionObservation,
  RuntimeV2SessionSnapshot,
  SessionEventEnvelopeV1,
  TaskSnapshot,
} from "@actspace/shared/runtime-v2";
import { MOCK_WORKSPACE_ROOT, mockAppSettings, mockBootstrapState, mockSettingsV4 } from "./fixtures";

/**
 * 浏览器 mock 的内存表。会话以「消息列表」保存，读取时投影成和 Electron 相同的
 * `RuntimeV2DesktopSessionProjection`，App 走的是同一条 `sessions.getPage` 路径。
 */

export type MockMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly createdAt: string;
  readonly agentRunId: string;
};

export type MockSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workspaceRoot?: string;
  agentForm: "agent" | "chat";
  agentMode: "agent" | "plan" | "chat";
  agentModeRevision: number;
  pinned: boolean;
  archived: boolean;
  hostId?: string;
  hostName?: string;
  messages: MockMessage[];
};

export type MockDb = {
  readonly bootstrap: BootstrapState;
  workspaces: WorkspaceRegistry;
  readonly sessions: Map<string, MockSession>;
  hosts: HostConnection[];
  readonly pendingApprovals: Map<string, PendingApprovalInfo[]>;
  readonly tasks: Map<string, TaskSnapshot>;
  settings: AppSettings;
  settingsV4: SettingsV4Snapshot;
  /** 递增序号，生成稳定可读的 id。 */
  nextId(prefix: string): string;
};

/** 与 main 的 `remoteSessionKey` 同格式：`host:` + base64url(JSON [hostId, sessionId])。 */
export function remoteSessionId(hostId: string, sessionId: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify([hostId, sessionId]));
  const base64 = btoa(String.fromCharCode(...bytes));
  return `host:${base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

const SEED_TIME = Date.parse("2026-10-01T09:00:00.000Z");

export function createMockDb(): MockDb {
  let counter = 0;
  const now = new Date(SEED_TIME).toISOString();
  return {
    bootstrap: mockBootstrapState,
    workspaces: {
      version: 1,
      defaultWorkspaceId: "default",
      items: [{ id: "default", kind: "default", label: "actspace-demo", path: MOCK_WORKSPACE_ROOT, order: 0, createdAt: now, updatedAt: now }],
    },
    sessions: new Map(),
    hosts: [],
    pendingApprovals: new Map(),
    tasks: new Map(),
    settings: mockAppSettings(),
    settingsV4: mockSettingsV4(),
    nextId: (prefix) => `${prefix}-${++counter}`,
  };
}

/** 原 App 里 `createLocalEmptySession` 的 mock 版本：新会话写进内存表。 */
export function createMockSession(db: MockDb, input: SessionCreateInput & { id?: string; updatedAt?: string } = {}): MockSession {
  const createdAt = input.updatedAt ?? new Date().toISOString();
  const host = input.hostId ? db.hosts.find((item) => item.hostId === input.hostId) : undefined;
  const session: MockSession = {
    id: input.hostId ? remoteSessionId(input.hostId, input.id ?? db.nextId("session")) : input.id ?? db.nextId("mock-session"),
    title: input.title ?? "New chat",
    createdAt,
    updatedAt: createdAt,
    workspaceRoot: input.workspaceRoot ?? (input.hostId ? undefined : db.bootstrap.workspaceRoot),
    agentForm: input.agentForm ?? "agent",
    agentMode: input.agentMode ?? (input.agentForm === "chat" ? "chat" : "agent"),
    agentModeRevision: 0,
    pinned: false,
    archived: false,
    ...(input.hostId ? { hostId: input.hostId, hostName: host?.name } : {}),
    messages: [],
  };
  db.sessions.set(session.id, session);
  return session;
}

/** 原 App 里 `createLocalForkSession` 的 mock 版本：复制消息，换新 id。 */
export function forkMockSession(db: MockDb, sourceId: string): MockSession {
  const source = requireSession(db, sourceId);
  const now = new Date().toISOString();
  const fork: MockSession = {
    ...source,
    id: source.hostId ? remoteSessionId(source.hostId, db.nextId("session")) : db.nextId("mock-session"),
    title: `${source.title} (fork)`,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    archived: false,
    messages: source.messages.map((message) => ({ ...message })),
  };
  db.sessions.set(fork.id, fork);
  return fork;
}

export function requireSession(db: MockDb, sessionId: string): MockSession {
  const session = db.sessions.get(sessionId);
  if (!session) throw new Error(`Mock session not found: ${sessionId}`);
  return session;
}

export function appendMockMessage(db: MockDb, session: MockSession, role: MockMessage["role"], content: string, agentRunId: string): MockMessage {
  const message: MockMessage = { id: db.nextId(role), role, content, createdAt: new Date().toISOString(), agentRunId };
  session.messages.push(message);
  session.updatedAt = message.createdAt;
  return message;
}

export function sessionListItem(session: MockSession, db: MockDb): SessionListItem {
  const host = session.hostId ? db.hosts.find((item) => item.hostId === session.hostId) : undefined;
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    agentRunCount: new Set(session.messages.map((message) => message.agentRunId)).size,
    agentForm: session.agentForm,
    agentMode: session.agentMode,
    agentModeRevision: session.agentModeRevision,
    workspaceId: session.hostId ? undefined : db.workspaces.items.find((item) => item.path === session.workspaceRoot)?.id,
    workspaceRoot: session.workspaceRoot,
    pinned: session.pinned,
    archived: session.archived,
    ...(session.hostId ? { hostId: session.hostId, hostName: session.hostName ?? host?.name, connectionState: host?.state ?? "offline" } : {}),
  };
}

export function listMockSessions(db: MockDb, archived = false): SessionListItem[] {
  return [...db.sessions.values()]
    .filter((session) => session.archived === archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((session) => sessionListItem(session, db));
}

function journal(session: MockSession): SessionEventEnvelopeV1[] {
  return session.messages.map((message, seq) => ({
    recordKind: "event",
    seq,
    type: message.role === "user" ? "user/message" : "assistant/message",
    eventVersion: 1,
    criticality: "ignorable",
    time: message.createdAt,
    source: { ownerPluginId: "@actspace/core" },
    data: { agentRunId: message.agentRunId, messageId: message.id, content: message.content },
    surface: { kind: "append", node: { kind: message.role, messageId: message.id, content: message.content } },
    provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null },
  }));
}

function snapshot(session: MockSession, throughJournalSeq: number): RuntimeV2SessionSnapshot {
  const runs = new Set(session.messages.map((message) => message.agentRunId)).size;
  return {
    kind: "session-snapshot",
    schemaVersion: 1,
    sessionId: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    throughJournalSeq,
    workspaceRoot: session.workspaceRoot,
    agentForm: session.agentForm,
    agentMode: session.agentMode,
    agentModeRevision: session.agentModeRevision,
    permissionMode: "default",
    sessionGrants: [],
    accessState: "read-write",
    metadata: { title: session.title, pinned: session.pinned, archived: session.archived },
    messages: session.messages.map((message) => ({ kind: message.role, messageId: message.id, content: message.content })),
    tools: [],
    pendingInbox: [],
    todos: [],
    delegations: [],
    lineage: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null },
    activity: { turnCount: runs, completedTurnCount: runs, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null },
  };
}

export function sessionProjection(session: MockSession): RuntimeV2DesktopSessionProjection {
  const events = journal(session);
  const throughJournalSeq = events.length - 1;
  const snap = snapshot(session, throughJournalSeq);
  return {
    kind: "session-projection",
    schemaVersion: 1,
    sessionId: session.id,
    throughJournalSeq,
    snapshot: snap,
    activeMessageIds: session.messages.map((message) => message.id),
    deferredToolCalls: [],
    values: {
      metadata: snap.metadata,
      providerUsage: snap.usage,
      sessionStats: snap.activity,
      requestContext: {
        sessionId: session.id,
        throughJournalSeq,
        updatedAt: session.updatedAt,
        basis: "last-request",
        estimator: { name: "runtime-v2-request-snapshot", version: "2" },
        totalEstimatedTokens: 0,
        maxTokens: 0,
        percentUsed: 0,
        entries: [],
        buckets: [],
      },
    },
    window: { events, fromSeq: 0, throughJournalSeq, beforeSeq: null, turnOffset: 0, requestOffset: 0 },
  };
}

export function sessionObservation(session: MockSession): RuntimeV2SessionObservation {
  const projection = sessionProjection(session);
  const seq = projection.throughJournalSeq;
  return {
    kind: "session-observation",
    schemaVersion: 1,
    sessionId: session.id,
    projection: { kind: "session-projection", schemaVersion: 1, sessionId: session.id, throughJournalSeq: seq, values: projection.values },
    snapshot: projection.snapshot,
    window: projection.window,
    activeMessageIds: projection.activeMessageIds,
    deferredToolCalls: [],
    watermarks: { acceptedThroughSeq: seq, durableThroughSeq: seq, projectionThroughSeq: seq, windowThroughSeq: seq, indexGeneration: null },
  };
}

export function emptyTaskSnapshot(sessionId: string): TaskSnapshot {
  return { sessionId, revision: 0, paused: false, tasks: [], queue: [], runs: [] };
}
