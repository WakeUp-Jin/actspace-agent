import { createElement, type ReactNode } from "react";
import type { ConnectionState, ConnectionStore, HostConnection } from "../../connection/connection-store";
import { HostEventRouter } from "../../connection/host-events";
import { ConnectionContext } from "../../connection/use-connection";

export type Call = { method: string; params: Record<string, unknown> };
export type FakeClient = { calls: Call[]; call: (method: string, params?: Record<string, unknown>) => Promise<unknown> };

/** 按 method 返回结果的假 HostClient；handler 可抛错来模拟失败。 */
export function fakeClient(handler: (method: string, params: Record<string, unknown>, calls: Call[]) => unknown): FakeClient {
  const calls: Call[] = [];
  return { calls, call: async (method, params = {}) => { calls.push({ method, params }); return handler(method, params, calls); } };
}

let nextId = 1;
export function fakeConnection(client: FakeClient, options: { epoch?: string; models?: { id: string; provider: string; name: string }[] } = {}): HostConnection {
  return {
    id: nextId++, client: client as unknown as HostConnection["client"], events: new HostEventRouter(), hostId: "h1", epoch: options.epoch ?? "e1",
    description: { state: "ready", workspaces: [{ id: "main", name: "Main", path: "/work/main" }], models: options.models ?? [{ id: "mock/mock", provider: "mock", name: "mock" }], defaultModel: options.models?.[0]?.id ?? "mock/mock", capabilities: {} },
    hostSubscriptionId: "sub-host", hostSnapshot: { approvals: [], state: "ready", running: [] },
  } as HostConnection;
}

/** 只实现 useConnection* 用到的部分。 */
export class FakeConnectionStore {
  readonly errors: unknown[] = [];
  #state: ConnectionState;
  readonly #listeners = new Set<() => void>();
  constructor(connection: HostConnection | null, maintenance = false) {
    this.#state = { status: connection ? "ready" : "reconnecting", host: null, connection, description: connection?.description ?? null, maintenance, error: null, revokedReason: null, retryAt: null };
  }
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  getState = () => this.#state;
  reportError = (error: unknown) => { this.errors.push(error); };
  set(connection: HostConnection | null, maintenance = false) {
    this.#state = { ...this.#state, status: connection ? "ready" : "reconnecting", connection, maintenance };
    for (const listener of [...this.#listeners]) listener();
  }
}

export function connectionWrapper(store: FakeConnectionStore) {
  return ({ children }: { children: ReactNode }) => createElement(ConnectionContext.Provider, { value: store as unknown as ConnectionStore }, children);
}

const at = "2026-10-17T00:00:00.000Z";
export const taskSnapshot = (overrides: Record<string, unknown> = {}) => ({ sessionId: "s1", revision: 1, paused: false, tasks: [], queue: [], runs: [], ...overrides });

/** 最小的 sessions.observe / sessions.page 回包。 */
export function observationFixture(sessionId: string, options: { title?: string | null; seq?: number } = {}) {
  const seq = options.seq ?? 5;
  const metadata = { title: options.title ?? "测试会话", pinned: false, archived: false };
  const snapshot = {
    kind: "session-snapshot", schemaVersion: 1, sessionId, createdAt: at, updatedAt: at, workspaceRoot: "/work/main", agentForm: "agent", agentMode: "agent", agentModeRevision: 3, throughJournalSeq: seq, permissionMode: "default", sessionGrants: [], accessState: "read-write",
    metadata, messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null },
    activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } }, lineage: null,
  };
  const requestContext = { basis: "last-request", totalEstimatedTokens: 0, maxTokens: 1000, percentUsed: 0, buckets: [], entries: [], estimator: { name: "t", version: "1" }, throughJournalSeq: seq, sessionId, updatedAt: at };
  return {
    kind: "session-observation", schemaVersion: 1, sessionId, snapshot,
    projection: { kind: "session-projection-snapshot", schemaVersion: 1, sessionId, throughJournalSeq: seq, values: { metadata, requestContext } },
    window: { events: [], fromSeq: seq + 1, throughJournalSeq: seq, beforeSeq: null, turnOffset: 0, requestOffset: 0 }, activeMessageIds: [], deferredToolCalls: [], watermarks: {},
  };
}

export const observeResult = (sessionId: string, options: { subscriptionId?: string; title?: string | null; tasks?: unknown; approvals?: unknown[]; output?: unknown } = {}) => ({
  subscriptionId: options.subscriptionId ?? "sub-1", epoch: "e1", cursor: 1,
  snapshot: { observation: observationFixture(sessionId, options.title === undefined ? {} : { title: options.title }), tasks: options.tasks ?? taskSnapshot({ sessionId }), approvals: options.approvals ?? [], output: options.output ?? null },
});
