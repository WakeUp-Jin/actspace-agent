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
import { encodeSessionLocator } from "@actspace/shared/session-locator";
import type {
  RuntimeV2DesktopSessionProjection,
  RuntimeV2JsonValue,
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
  readonly role: "user" | "assistant" | "tool";
  readonly content: string;
  readonly createdAt: string;
  readonly agentRunId: string;
  /** role 为 tool 时：一次已完成的工具调用，投影成 tool/call + tool/result 两条事件。 */
  readonly tool?: MockToolCall;
  /** role 为 assistant 时：这次请求的用量，紧跟着投影成一条带 usage 的 step/end。 */
  readonly usage?: Readonly<Record<string, RuntimeV2JsonValue>>;
  /** 原样写入的 journal 事件（如 background/task、delegation/*、收件箱领取），排在本条消息的事件之前。 */
  readonly events?: readonly MockRawEvent[];
};

export type MockRawEvent = { readonly type: string; readonly data: Readonly<Record<string, RuntimeV2JsonValue>>; readonly surface?: SessionEventEnvelopeV1["surface"] };

export type MockToolCall = {
  readonly name: string;
  readonly args: Readonly<Record<string, RuntimeV2JsonValue>>;
  /** tool/result 的 data（除 callId 外），例如 status、summary、modelOutput、detail。 */
  readonly result: Readonly<Record<string, RuntimeV2JsonValue>>;
  /** 这次调用委派出的子会话：紧跟 tool/call 投影一条 delegation/requested。 */
  readonly delegation?: { readonly childSessionId: string; readonly presetId: string; readonly model?: string };
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
  /** 侧边对话：所属主会话与继承的消息数（这些消息不在侧边面板里显示）。 */
  sideChat?: { parentId: string; inheritedMessages: number };
  /** 子智能体的会话：和真实 listPage 一样不进侧栏。 */
  parentSessionId?: string;
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

/** 与 main 的 `remoteSessionKey` 同一份编码（shared 的 session-locator）。 */
export function remoteSessionId(hostId: string, sessionId: string): string {
  return encodeSessionLocator({ hostId, sessionId });
}

const SEED_TIME = Date.parse("2026-10-01T09:00:00.000Z");

export function createMockDb(): MockDb {
  let counter = 0;
  const now = new Date(SEED_TIME).toISOString();
  return {
    bootstrap: mockBootstrapState,
    workspaces: {
      version: 1,
      items: [{ id: "ws_actspace_demo", kind: "folder", label: "actspace-demo", path: MOCK_WORKSPACE_ROOT, order: 0, createdAt: now, updatedAt: now }],
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

/**
 * 侧边对话：复制主会话到最后一个已完成轮（以助手回复结尾）为止的消息，默认 Plan，与真实 fork 一样带 lineage。
 * 之后还没有回复的那一轮算进行中，不复制。
 */
export function openMockSideChat(db: MockDb, parentId: string): { session: MockSession; inheritedTurnCount: number; runningTurnExcluded: boolean } {
  const parent = requireSession(db, parentId);
  const lastAnswer = parent.messages.findLastIndex((message) => message.role === "assistant");
  const inherited = parent.messages.slice(0, lastAnswer + 1);
  const runs = new Set(inherited.map((message) => message.agentRunId));
  if (runs.size === 0) throw new Error("SIDE_CHAT_NO_COMPLETED_TURN");
  const now = new Date().toISOString();
  const session: MockSession = {
    ...parent,
    id: db.nextId("mock-side-chat"),
    createdAt: now,
    updatedAt: now,
    agentMode: parent.agentMode === "chat" ? "chat" : "plan",
    agentModeRevision: parent.agentModeRevision + 1,
    pinned: false,
    archived: false,
    sideChat: { parentId, inheritedMessages: inherited.length },
    messages: inherited.map((message) => ({ ...message })),
  };
  db.sessions.set(session.id, session);
  return { session, inheritedTurnCount: runs.size, runningTurnExcluded: inherited.length < parent.messages.length };
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
    ...(session.parentSessionId ? { isChildSession: true } : {}),
    ...(session.sideChat ? { sideChatParentId: session.sideChat.parentId } : {}),
    ...(sideChatCount(db, session.id) ? { sideChatCount: sideChatCount(db, session.id) } : {}),
    ...(session.hostId ? { hostId: session.hostId, hostName: session.hostName ?? host?.name, connectionState: host?.state ?? "offline" } : {}),
  };
}

function sideChatCount(db: MockDb, parentId: string): number {
  let count = 0;
  for (const session of db.sessions.values()) if (session.sideChat?.parentId === parentId && !session.archived) count++;
  return count;
}

export function listMockSessions(db: MockDb, archived = false): SessionListItem[] {
  return [...db.sessions.values()]
    .filter((session) => session.archived === archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((session) => sessionListItem(session, db));
}

function journal(session: MockSession): SessionEventEnvelopeV1[] {
  const events: SessionEventEnvelopeV1[] = [];
  const base = (message: MockMessage) => ({
    recordKind: "event" as const,
    eventVersion: 1,
    criticality: "ignorable" as const,
    time: message.createdAt,
    source: { ownerPluginId: "@actspace/core" },
    provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null },
  });
  let currentRun: string | null = null;
  for (const message of session.messages) {
    // 每个 agentRun 开头一条 turn/start，和真实 Journal 一样能数出轮数。
    if (message.agentRunId !== currentRun) {
      currentRun = message.agentRunId;
      events.push({ ...base(message), seq: events.length, type: "turn/start", data: { agentRunId: message.agentRunId }, surface: null });
    }
    for (const raw of message.events ?? []) events.push({ ...base(message), seq: events.length, type: raw.type, data: { agentRunId: message.agentRunId, ...raw.data }, surface: raw.surface ?? null });
    if (message.role === "tool" && message.tool) {
      const callId = message.id;
      events.push({ ...base(message), seq: events.length, type: "tool/call", data: { agentRunId: message.agentRunId, callId, name: message.tool.name, args: message.tool.args }, surface: null });
      if (message.tool.delegation) {
        const { childSessionId, presetId } = message.tool.delegation;
        events.push({ ...base(message), seq: events.length, type: "delegation/requested", data: { invocationId: `${callId}:delegation`, presetId, parentCallId: callId, childSessionId }, surface: null });
      }
      events.push({ ...base(message), seq: events.length, type: "tool/result", data: { agentRunId: message.agentRunId, callId, ...message.tool.result }, surface: null });
      if (message.tool.delegation?.model) {
        const { childSessionId, presetId, model } = message.tool.delegation;
        events.push({ ...base(message), seq: events.length, type: "delegation/completed", data: { invocationId: `${callId}:delegation`, presetId, childSessionId, status: "completed", model }, surface: null });
      }
      continue;
    }
    if (message.role === "tool") continue;
    events.push({
      ...base(message),
      seq: events.length,
      type: message.role === "user" ? "user/message" : "assistant/message",
      data: { agentRunId: message.agentRunId, messageId: message.id, content: message.content },
      surface: { kind: "append", node: { kind: message.role, messageId: message.id, content: message.content } },
    });
    if (message.usage) {
      events.push({ ...base(message), seq: events.length, type: "step/end", data: { agentRunId: message.agentRunId, reason: "completed", usage: message.usage }, surface: null });
    }
  }
  return events;
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
    messages: session.messages.flatMap((message) => [
      // 原始事件里的 surface append（如唤醒回合领取的任务通知）也是可见消息。
      ...(message.events ?? []).flatMap((raw) => raw.surface?.kind === "append" && raw.surface.node.kind === "user" ? [{ kind: "user" as const, messageId: raw.surface.node.messageId, content: raw.surface.node.content }] : []),
      ...(message.role === "tool" && !message.tool ? [] : [message.role === "tool"
        ? { kind: "tool-result" as const, messageId: message.id, content: message.content, callId: message.id }
        : { kind: message.role, messageId: message.id, content: message.content }]),
    ]),
    tools: [],
    pendingInbox: [],
    todos: [],
    delegations: [],
    lineage: session.sideChat ? {
      parentSessionId: session.sideChat.parentId,
      parentBoundarySeq: journal({ ...session, messages: session.messages.slice(0, session.sideChat.inheritedMessages) }).length - 1,
      origin: "side-chat",
      delegationDepth: 0,
    } : null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null },
    activity: { turnCount: runs, completedTurnCount: runs, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } },
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
    activeMessageIds: snap.messages.map((message) => message.messageId),
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
