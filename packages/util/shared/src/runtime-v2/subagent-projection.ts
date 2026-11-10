import type { RuntimeV2JsonValue } from "./host-dto";
import {
  SUBAGENT_ACTIVATION_STATUSES, SUBAGENT_DELIVERIES, SUBAGENT_KINDS, SUBAGENT_PRESETS,
  type SubagentActivationStatus, type SubagentActivationTrigger, type SubagentDelivery, type SubagentKind, type SubagentPreset, type SubagentStatus,
} from "./subagents";

/**
 * The subagent tree of one main Session, folded from its own Journal (design 02 §4.1):
 * `subagent/spawned` and `subagent/activation`, plus the read-only `delegation/*` of old Sessions.
 * The Host manager, `list_agents`, the running-subagents context source and the UI all read this one fold.
 */

export type SubagentActivationSettle = {
  readonly status: SubagentActivationStatus;
  readonly summary: string;
  readonly result?: string;
  readonly resultTruncated?: boolean;
  readonly delivery: SubagentDelivery;
  readonly endedAt: string;
};

export type SubagentActivationView = {
  readonly activationId: string;
  readonly trigger: SubagentActivationTrigger;
  readonly senderId?: string;
  readonly callId: string;
  readonly background: boolean;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly startedAt: string;
  readonly settle?: SubagentActivationSettle;
};

export type SubagentView = {
  readonly agentId: string;
  readonly kind: SubagentKind;
  readonly preset?: SubagentPreset;
  readonly description: string;
  readonly transcriptPath: string;
  readonly callId: string;
  readonly createdAt: string;
  readonly inheritedThroughSeq?: number;
  /** Tools fixed at creation and reused by every activation, so the child's prompt prefix stays stable. */
  readonly toolNames?: readonly string[];
  /** Recorded by `delegation/*` before subagents could be continued: shown, never listed to the model or messaged. */
  readonly legacy: boolean;
  readonly status: SubagentStatus;
  readonly activations: readonly SubagentActivationView[];
};

export type SubagentTree = { readonly order: readonly string[]; readonly agents: Readonly<Record<string, SubagentView>> };

export const EMPTY_SUBAGENT_TREE: SubagentTree = Object.freeze({ order: Object.freeze([]), agents: Object.freeze({}) });

type FoldableEvent = { readonly type: string; readonly time?: string; readonly data: RuntimeV2JsonValue };

export function reduceSubagentTree(state: SubagentTree, event: FoldableEvent): SubagentTree {
  const data = record(event.data);
  switch (event.type) {
    case "subagent/spawned": return spawned(state, data);
    case "subagent/activation": return activation(state, data);
    case "delegation/requested": return legacyRequested(state, data, event.time ?? "");
    case "delegation/completed": return legacyCompleted(state, data, event.time ?? "");
    default: return state;
  }
}

export function foldSubagentTree(events: Iterable<FoldableEvent>): SubagentTree {
  let state = EMPTY_SUBAGENT_TREE;
  for (const event of events) state = reduceSubagentTree(state, event);
  return state;
}

/** Subagents the model may see and message: everything except old `delegation/*` records. */
export function listedSubagents(tree: SubagentTree): readonly SubagentView[] {
  return tree.order.map(id => tree.agents[id]).filter(agent => !agent.legacy);
}

export function runningActivation(agent: SubagentView): SubagentActivationView | undefined {
  const last = agent.activations.at(-1);
  return last && !last.settle ? last : undefined;
}

/** Running activations across every kind; the per-Session limit counts these. */
export function runningSubagentCount(tree: SubagentTree): number {
  return listedSubagents(tree).filter(agent => runningActivation(agent) !== undefined).length;
}

/** The model the subagent ran with most recently, if any activation recorded one. */
export function lastActivationModel(agent: SubagentView): string | undefined {
  for (let index = agent.activations.length - 1; index >= 0; index -= 1) {
    const model = agent.activations[index].model;
    if (model) return model;
  }
  return undefined;
}

function spawned(state: SubagentTree, data: Readonly<Record<string, RuntimeV2JsonValue>>): SubagentTree {
  const agentId = text(data.agentId), callId = text(data.callId), description = typeof data.description === "string" ? data.description : null;
  const transcriptPath = text(data.transcriptPath), createdAt = text(data.createdAt);
  if (!agentId || !callId || description === null || !transcriptPath || !createdAt || !oneOf(data.kind, SUBAGENT_KINDS)) return state;
  if (state.agents[agentId]) return state;
  const toolNames = Array.isArray(data.toolNames) ? data.toolNames.filter((name): name is string => typeof name === "string") : undefined;
  const view: SubagentView = {
    agentId, kind: data.kind, description, transcriptPath, callId, createdAt, legacy: false, status: "inactive", activations: [],
    ...(oneOf(data.preset, SUBAGENT_PRESETS) ? { preset: data.preset } : {}),
    ...(typeof data.inheritedThroughSeq === "number" ? { inheritedThroughSeq: data.inheritedThroughSeq } : {}),
    ...(toolNames ? { toolNames } : {}),
  };
  return { order: [...state.order, agentId], agents: { ...state.agents, [agentId]: view } };
}

function activation(state: SubagentTree, data: Readonly<Record<string, RuntimeV2JsonValue>>): SubagentTree {
  const agentId = text(data.agentId), activationId = text(data.activationId);
  const current = agentId ? state.agents[agentId] : undefined;
  if (!current || !activationId) return state;
  if (data.op === "start") {
    const callId = text(data.callId), startedAt = text(data.startedAt);
    if (!callId || !startedAt || (data.trigger !== "spawn" && data.trigger !== "message") || current.activations.some(item => item.activationId === activationId)) return state;
    const senderId = text(data.senderId), model = text(data.model), reasoningEffort = text(data.reasoningEffort);
    const started: SubagentActivationView = {
      activationId, trigger: data.trigger, callId, background: data.background === true, startedAt,
      ...(senderId ? { senderId } : {}), ...(model ? { model } : {}), ...(reasoningEffort ? { reasoningEffort } : {}),
    };
    return replace(state, { ...current, activations: [...current.activations, started], status: "running" });
  }
  if (data.op === "settle") {
    const index = current.activations.findIndex(item => item.activationId === activationId);
    const endedAt = text(data.endedAt);
    if (index < 0 || current.activations[index].settle || !endedAt || !oneOf(data.status, SUBAGENT_ACTIVATION_STATUSES) || !oneOf(data.delivery, SUBAGENT_DELIVERIES)) return state;
    const settle: SubagentActivationSettle = {
      status: data.status, summary: typeof data.summary === "string" ? data.summary : "", delivery: data.delivery, endedAt,
      ...(typeof data.result === "string" ? { result: data.result } : {}),
      ...(typeof data.resultTruncated === "boolean" ? { resultTruncated: data.resultTruncated } : {}),
    };
    const activations = current.activations.map((item, position) => position === index ? { ...item, settle } : item);
    return replace(state, { ...current, activations, status: statusOf(current.kind, activations) });
  }
  return state;
}

function legacyRequested(state: SubagentTree, data: Readonly<Record<string, RuntimeV2JsonValue>>, time: string): SubagentTree {
  const agentId = text(data.childSessionId), activationId = text(data.invocationId), callId = text(data.parentCallId);
  if (!agentId || !activationId || !callId || state.agents[agentId]) return state;
  const view: SubagentView = {
    agentId, kind: "local", preset: data.presetId === "actspace.explore" ? "explore" : "general", description: "", transcriptPath: "", callId, createdAt: time,
    legacy: true, status: "running", activations: [{ activationId, trigger: "spawn", callId, background: false, startedAt: time }],
  };
  return { order: [...state.order, agentId], agents: { ...state.agents, [agentId]: view } };
}

function legacyCompleted(state: SubagentTree, data: Readonly<Record<string, RuntimeV2JsonValue>>, time: string): SubagentTree {
  const agentId = text(data.childSessionId);
  const current = agentId ? state.agents[agentId] : undefined;
  if (!current?.legacy || current.activations[0]?.settle) return state;
  const status: SubagentActivationStatus = data.status === "completed" ? "completed" : data.status === "aborted" ? "interrupted" : "failed";
  const model = text(data.model);
  const first = { ...current.activations[0], ...(model ? { model } : {}), settle: { status, summary: "", delivery: "returned" as const, endedAt: time } };
  return replace(state, { ...current, status: "closed", activations: [first] });
}

/** External subagents end for good; local and forked ones idle until the next message. */
function statusOf(kind: SubagentKind, activations: readonly SubagentActivationView[]): SubagentStatus {
  if (activations.some(item => !item.settle)) return "running";
  return kind === "codex" || kind === "claude-code" ? "closed" : "inactive";
}

function replace(state: SubagentTree, view: SubagentView): SubagentTree { return { order: state.order, agents: { ...state.agents, [view.agentId]: view } }; }
function record(value: RuntimeV2JsonValue | undefined): Readonly<Record<string, RuntimeV2JsonValue>> { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {}; }
function text(value: RuntimeV2JsonValue | undefined): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function oneOf<T extends string>(value: RuntimeV2JsonValue | undefined, values: readonly T[]): value is T { return typeof value === "string" && (values as readonly string[]).includes(value); }
