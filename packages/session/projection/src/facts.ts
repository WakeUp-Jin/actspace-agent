import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { isCommandPrefixSelector, type GrantSelector, type GrantAccess, type GrantAction, type PermissionMode, type RuntimeV2JsonValue, type RuntimeV2SessionSnapshot, type RuntimeV2SessionTiming, type RuntimeV2UsageSummary, type SessionGrant } from "@actspace/shared/runtime-v2";
import { SessionProjectionRegistry } from "./registry.js";

export type SessionFacts = Pick<RuntimeV2SessionSnapshot, "metadata" | "todos" | "delegations" | "usage" | "activity" | "pendingInbox" | "permissionMode" | "sessionGrants">;
type Data = Readonly<Record<string, RuntimeV2JsonValue>>;
type GrantState = { readonly grantId: string; readonly grant: SessionGrant | null; readonly revokedAt: string | null };
type UsageState = { activeStep: string | null; requests: Record<string, string>; selected: Record<string, { assistant: boolean; step: string | null; usage: RuntimeV2UsageSummary }>; knownCosts: number; total: RuntimeV2UsageSummary };
const emptyUsage = (): RuntimeV2UsageSummary => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null });
/** 进行中的一步：请求开始时间与首个非空 chunk 时间（毫秒）；step/end 时移除，状态不随会话增长。 */
type OpenStep = { readonly startedAt: number | null; readonly firstTokenAt: number | null };
type ActivityState = SessionFacts["activity"] & { readonly openSteps: Readonly<Record<string, OpenStep>> };
const emptyTiming = (): RuntimeV2SessionTiming => ({ llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 });

/** Domain reducers share one drive and one checkpoint protocol, never a second log. */
export function registerSessionFacts(registry: SessionProjectionRegistry, redact: (text: string, limit?: number) => string): void {
  registry.register<PermissionMode>({
    key: "permissionMode", stateVersion: 1, init: () => "default", view: state => state,
    apply: (state, event) => event.type === "permission/mode-set" && record(event.data).mode === "auto-review" ? "auto-review" : event.type === "permission/mode-set" && record(event.data).mode === "full-access" ? "full-access" : event.type === "permission/mode-set" && record(event.data).mode === "default" ? "default" : state,
  });
  registry.register<readonly GrantState[]>({
    key: "sessionGrants", stateVersion: 1, init: () => [],
    view: state => state.flatMap(item => item.grant !== null && item.revokedAt === null ? [item.grant] : []),
    apply: applySessionGrantEvent,
  });
  registry.register<SessionFacts["metadata"]>({
    key: "metadata", stateVersion: 1, init: () => ({ title: null, pinned: false, archived: false }), view: state => state,
    apply: (state, event) => {
      const data = record(event.data);
      if (event.type === "session/title-set") return { ...state, title: typeof data.title === "string" ? redact(data.title, 160) : null };
      if (event.type === "session/pinned-set" && typeof data.pinned === "boolean") return { ...state, pinned: data.pinned };
      if (event.type === "session/archived-set" && typeof data.archived === "boolean") return { ...state, archived: data.archived };
      return state;
    },
  });
  registry.register<SessionFacts["delegations"]>({
    key: "delegations", stateVersion: 1, init: () => [], view: state => state,
    apply: (state, event) => {
      if (event.type !== "delegation/requested" && event.type !== "delegation/completed") return state;
      const data = record(event.data); const invocationId = text(data.invocationId);
      if (!invocationId) return state;
      const prior = state.find(item => item.invocationId === invocationId);
      const item: SessionFacts["delegations"][number] = {
        invocationId, childSessionId: text(data.childSessionId) ?? prior?.childSessionId ?? null,
        agentKind: data.agentKind === "agent" || data.agentKind === "explore" ? data.agentKind : data.presetId === "actspace.agent" ? "agent" : data.presetId === "actspace.explore" ? "explore" : prior?.agentKind ?? "unknown",
        state: event.type === "delegation/completed" ? "completed" : "requested",
        summary: typeof data.summary === "string" ? redact(data.summary, 240) : prior?.summary ?? null,
      };
      return prior ? state.map(previous => previous.invocationId === invocationId ? item : previous) : [...state, item];
    },
  });
  registry.register<ActivityState, SessionFacts["activity"]>({
    key: "sessionStats", stateVersion: 3,
    init: () => ({ turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: emptyTiming(), openSteps: {} }),
    view: ({ openSteps: _openSteps, ...activity }) => activity,
    apply: (state, event) => {
      const data = record(event.data);
      switch (event.type) {
        case "turn/start": return { ...state, turnCount: state.turnCount + 1, activeTurnId: text(data.turnId) };
        case "turn/end": return { ...state, completedTurnCount: state.completedTurnCount + 1, activeTurnId: state.activeTurnId === text(data.turnId) ? null : state.activeTurnId };
        case "step/start": {
          const stepId = text(data.stepId);
          const openSteps = stepId === null || state.openSteps[stepId] ? state.openSteps : { ...state.openSteps, [stepId]: { startedAt: eventTime(event), firstTokenAt: null } };
          return { ...state, stepCount: state.stepCount + 1, activeStepId: stepId, openSteps };
        }
        case "step/end": {
          const stepId = text(data.stepId);
          const { [stepId ?? ""]: _closed, ...openSteps } = state.openSteps;
          return { ...state, activeStepId: state.activeStepId === stepId ? null : state.activeStepId, openSteps: stepId !== null && state.openSteps[stepId] ? openSteps : state.openSteps };
        }
        case "request/header": case "assistant/chunk": case "assistant/message": case "llm/retry": return applyTiming(state, event, data);
        case "compaction/start": return { ...state, activeCompactionId: text(data.compactionId) };
        case "compaction/summary": return { ...state, lastCompactionSummary: text(data.summary) ?? text(data.content) };
        case "compaction/end": return { ...state, compactionCount: state.compactionCount + 1, activeCompactionId: state.activeCompactionId === text(data.compactionId) ? null : state.activeCompactionId };
        default: return state;
      }
    },
  });
  registry.register<UsageState>({ key: "providerUsage", stateVersion: 3, init: () => ({ activeStep: null, requests: {}, selected: {}, knownCosts: 0, total: emptyUsage() }), apply: applyUsage, view: state => state.total });
  registry.register<SessionFacts["pendingInbox"]>({
    key: "pendingInbox", stateVersion: 2, init: () => [], view: state => state,
    apply: (state, event) => {
      if (event.type !== "agent/inbox/spliced") return state;
      const data = record(event.data); const messageId = text(data.messageId);
      if (!messageId || (data.target !== "next-step" && data.target !== "next-turn")) return state;
      if (data.operation === "enqueue") return [...state.filter(item => item.messageId !== messageId), { messageId, target: data.target, ...(data.source === "task_notification" || data.source === "steer" ? { source: data.source } : {}) }];
      if (data.operation === "claim" || data.operation === "discard") return state.filter(item => item.messageId !== messageId);
      return state;
    },
  });
}

export function sessionFacts(registry: SessionProjectionRegistry, sessionId: string): SessionFacts {
  const values = registry.snapshot(sessionId).values;
  return { permissionMode: values.permissionMode as PermissionMode, sessionGrants: values.sessionGrants as SessionFacts["sessionGrants"], metadata: values.metadata as SessionFacts["metadata"], todos: (values.todos ?? []) as SessionFacts["todos"], delegations: values.delegations as SessionFacts["delegations"], activity: values.sessionStats as SessionFacts["activity"], usage: values.providerUsage as SessionFacts["usage"], pendingInbox: values.pendingInbox as SessionFacts["pendingInbox"] };
}

export function projectPermissionMode(events: readonly SessionEventEnvelopeV1[]): PermissionMode {
  let mode: PermissionMode = "default";
  for (const event of events) {
    if (event.type !== "permission/mode-set") continue;
    const value = record(event.data).mode;
    if (value === "default" || value === "full-access" || value === "auto-review") mode = value;
  }
  return mode;
}

export function projectSessionGrants(events: readonly SessionEventEnvelopeV1[]): readonly SessionGrant[] {
  return events.reduce(applySessionGrantEvent, [] as readonly GrantState[]).flatMap(item => item.grant !== null && item.revokedAt === null ? [item.grant] : []);
}

function grantFromData(data: Data): SessionGrant | null {
  const audience = record(data.audience);
  const selector = record(data.selector);
  if (data.schemaVersion !== 1 || !isText(data.grantId) || !isText(data.sessionId) || !isText(data.agentId) || !isText(data.sourceRequestId) || !isText(data.sourceCallId) || !isText(data.sourceToolName) || !isText(data.issuedAt)) return null;
  const process = data.action === "process.execute";
  if (!process && data.action !== "file.read" && data.action !== "file.write") return null;
  if (data.access !== (process ? "execute" : data.action === "file.read" ? "read" : "write")) return null;
  if (!isText(audience.pluginId) || !isText(audience.permissionDomain) || !Number.isSafeInteger(audience.policyVersion)) return null;
  let parsedSelector: GrantSelector;
  if (process && isCommandPrefixSelector(selector)) parsedSelector = selector;
  else if (!process && selector.kind === "exact" && isText(selector.canonicalPath)) parsedSelector = { kind: "exact", canonicalPath: selector.canonicalPath };
  else if (!process && selector.kind === "subtree" && isText(selector.canonicalRoot)) parsedSelector = { kind: "subtree", canonicalRoot: selector.canonicalRoot };
  else return null;
  return { schemaVersion: 1, grantId: data.grantId, sessionId: data.sessionId, agentId: data.agentId, audience: { pluginId: audience.pluginId, permissionDomain: audience.permissionDomain, policyVersion: audience.policyVersion as number }, action: data.action as GrantAction, access: data.access as GrantAccess, selector: parsedSelector, sourceRequestId: data.sourceRequestId, sourceCallId: data.sourceCallId, sourceToolName: data.sourceToolName, issuedAt: data.issuedAt, ...(isText(data.expiresAt) ? { expiresAt: data.expiresAt } : {}) };
}

function applyUsage(state: UsageState, event: SessionEventEnvelopeV1): UsageState {
  const next = applyUsageValue(state, event);
  if (event.type !== "step/end") return next;
  const step = text(record(event.data).stepId) ?? state.activeStep;
  const requests = { ...next.requests }; if (step) delete requests[step];
  const selected = Object.fromEntries(Object.entries(next.selected).filter(([, value]) => value.step !== step));
  return { ...next, activeStep: next.activeStep === step ? null : next.activeStep, requests, selected };
}

function applyUsageValue(state: UsageState, event: SessionEventEnvelopeV1): UsageState {
  const data = record(event.data);
  if (event.type === "step/start") return { ...state, activeStep: text(data.stepId) };
  const step = text(data.stepId) ?? state.activeStep;
  if (event.type === "request/header" && step && typeof data.requestId === "string") return { ...state, requests: { ...state.requests, [step]: data.requestId } };
  const raw = record(data.usage);
  if (!["assistant/message", "step/end", "llm/retry", "llm/auxiliary-end"].includes(event.type) || !Object.keys(raw).length) return state;
  const key = event.type === "llm/auxiliary-end" ? `auxiliary:${data.attemptId}` : text(data.requestId) ?? (step ? state.requests[step] ?? `step:${step}` : `event:${event.seq}`);
  const previous = state.selected[key]; const assistant = event.type === "assistant/message";
  if (previous?.assistant && !assistant) return state;
  const provenance = record(raw.costProvenance);
  const costKnown = (raw.costCurrency === "USD" || raw.costCurrency === "usd") && typeof raw.cost === "number" && Number.isFinite(raw.cost) && (raw.cost > 0 || (provenance.version === 1 && (provenance.basis === "estimated" || provenance.basis === "provider-reported")));
  const usage = { inputTokens: number(raw.inputTokens), outputTokens: number(raw.outputTokens), cacheReadTokens: number(raw.cacheReadTokens), cacheWriteTokens: number(raw.cacheWriteTokens), totalTokens: 0, costUsd: costKnown ? number(raw.cost) : null };
  usage.totalTokens = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const selected = key.startsWith("event:") ? state.selected : { ...state.selected, [key]: { assistant, step, usage } };
  const knownCosts = state.knownCosts - (previous?.usage.costUsd != null ? 1 : 0) + (usage.costUsd !== null ? 1 : 0);
  const total = { ...state.total };
  for (const field of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "totalTokens"] as const) total[field] = state.total[field] - (previous?.usage[field] ?? 0) + usage[field];
  total.costUsd = knownCosts > 0 ? (state.total.costUsd ?? 0) - (previous?.usage.costUsd ?? 0) + (usage.costUsd ?? 0) : null;
  return { ...state, selected, knownCosts, total };
}

/**
 * 模型侧计时：request/header 标请求开始，首个非空 chunk 标首 token，assistant/message 结算一次请求。
 * 一步可能有多次请求（重试），llm/retry 结算失败请求；结算后清空起点，不计重试等待。
 * 只有状态真的变了才返回新对象，流式 chunk 不会逐条触发投影推送。
 */
function applyTiming(state: ActivityState, event: SessionEventEnvelopeV1, data: Data): ActivityState {
  const stepId = text(data.stepId) ?? state.activeStepId;
  const at = eventTime(event);
  if (stepId === null) return state;
  const open = state.openSteps[stepId] ?? { startedAt: null, firstTokenAt: null };
  const withStep = (next: OpenStep): ActivityState => ({ ...state, openSteps: { ...state.openSteps, [stepId]: next } });
  if (event.type === "request/header") return at === null ? state : withStep({ startedAt: at, firstTokenAt: null });
  if (event.type === "assistant/chunk") {
    if (open.firstTokenAt !== null || at === null || !(isText(data.delta) || isText(data.content))) return state;
    return withStep({ ...open, firstTokenAt: at });
  }
  if (at === null) return state;
  const timing = { ...state.timing };
  if (open.startedAt !== null) timing.llmMs += Math.max(0, at - open.startedAt);
  if (open.firstTokenAt !== null) {
    timing.ttftMs += Math.max(0, open.firstTokenAt - (open.startedAt ?? open.firstTokenAt));
    timing.ttftSteps += 1;
    const output = number(record(data.usage).outputTokens);
    if (output > 0) {
      timing.decodeMs += Math.max(0, at - open.firstTokenAt);
      timing.decodeTokens += output;
    }
  }
  return { ...withStep({ startedAt: null, firstTokenAt: null }), timing };
}

function eventTime(event: SessionEventEnvelopeV1): number | null {
  const parsed = Date.parse(event.time);
  return Number.isFinite(parsed) ? parsed : null;
}

function record(value: RuntimeV2JsonValue | undefined): Data { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : {}; }
function text(value: RuntimeV2JsonValue | undefined): string | null { return typeof value === "string" && value.length ? value : null; }
function isText(value: RuntimeV2JsonValue | undefined): value is string { return typeof value === "string" && value.length > 0; }
function number(value: RuntimeV2JsonValue | undefined): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0; }

export function applySessionGrantEvent(state: readonly GrantState[], event: SessionEventEnvelopeV1): readonly GrantState[] {
  const data = record(event.data);
  if (event.type === "permission/grant-added") {
    const grant = grantFromData(data);
    if (grant === null || state.some(item => item.grantId === grant.grantId)) return state;
    return [...state, { grantId: grant.grantId, grant, revokedAt: null }];
  }
  if (event.type === "permission/grant-revoked") {
    const grantId = text(data.grantId);
    if (!grantId) return state;
    const revokedAt = text(data.revokedAt) ?? event.time;
    if (!state.some(item => item.grantId === grantId)) return [...state, { grantId, grant: null, revokedAt }];
    return state.map(item => item.grantId === grantId && item.revokedAt === null ? { ...item, revokedAt } : item);
  }
  return state;

}
