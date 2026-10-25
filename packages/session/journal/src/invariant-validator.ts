import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { EventCodecRegistry } from "./codec-registry.js";
import { validateEventEnvelopeShape, type SessionEventEnvelopeV1 } from "./event-envelope.js";
import { SessionError } from "./errors.js";
import { AUXILIARY_IDENTITY_FIELDS } from "./auxiliary-codec.js";

export type SessionAccessState = "read-write" | "degraded" | "browse-only" | "corrupt";

export type SessionValidationDiagnostic = {
  readonly code: "UNKNOWN_REQUIRED_CODEC" | "UNKNOWN_IGNORABLE_CODEC" | "UNSUPPORTED_REQUIRED_VERSION" | "UNSUPPORTED_IGNORABLE_VERSION" | "INVALID_EVENT";
  readonly seq: number;
  readonly type: string;
  readonly message: string;
};

export type SessionRelationState = {
  readonly openTurnId: string | null;
  readonly openStepId: string | null;
  readonly openRequestIds: readonly string[];
  readonly openToolCallIds: readonly string[];
  readonly pendingInboxMessageIds: readonly string[];
  readonly committedRepairIds: readonly string[];
};

export type SessionValidationResult = {
  readonly accessState: SessionAccessState;
  readonly diagnostics: readonly SessionValidationDiagnostic[];
  readonly relations: SessionRelationState;
};

type MutableRelations = {
  openTurnId: string | null;
  openStepId: string | null;
  openAgentRunId: string | null;
  auxiliary: Map<string, Readonly<Record<string, RuntimeV2JsonValue>>>;
  auxiliaryIds: Set<string>;
  requests: Map<string, { header: boolean; context: boolean; terminal: boolean }>;
  tools: Map<string, { terminal: boolean; order: number }>;
  inbox: Map<string, { status: "pending" | "claimed" | "discarded"; target: "next-step" | "next-turn"; seq: number }>;
  requestIds: Set<string>;
  toolIds: Set<string>;
  inboxIds: Set<string>;
  activeRepairId: string | null;
  committedRepairIds: Set<string>;
};

/** Incremental validator. Atomic batches undo only touched relations, never replay history. */
export class SessionEventValidator {
  private readonly relations = createRelations();
  private readonly diagnostics: SessionValidationDiagnostic[] = [];
  private accessState: SessionAccessState = "read-write";
  private nextSeq = 0;
  private pending: Array<{ event: SessionEventEnvelopeV1; data: RuntimeV2JsonValue }> = [];
  private kind: "recovery" | "compaction" | null = null;
  private transactionId: string | null = null;

  constructor(private readonly registry: EventCodecRegistry) {}

  /** publish runs before commit; a Surface failure rolls validation back too. */
  append(events: readonly SessionEventEnvelopeV1[], previous: () => readonly SessionEventEnvelopeV1[] = () => [], publish?: (effective: readonly SessionEventEnvelopeV1[]) => void): SessionValidationResult {
    const checkpoint = { nextSeq: this.nextSeq, accessState: this.accessState, diagnostics: this.diagnostics.length, pending: this.pending, pendingLength: this.pending.length, kind: this.kind, transactionId: this.transactionId };
    const undo: Array<() => void> = [];
    const effective: SessionEventEnvelopeV1[] = [];
    const apply = (event: SessionEventEnvelopeV1, data: RuntimeV2JsonValue) => {
      undo.push(relationUndo(this.relations, data));
      applyRelations(this.relations, event, data);
      effective.push(event);
    };
    try {
      for (let index = 0; index < events.length; index++) {
        const event = events[index]!;
        validateEventEnvelopeShape(event);
        if (event.seq !== this.nextSeq) throw new SessionError("SESSION_CORRUPT", `Expected seq ${this.nextSeq}, received ${event.seq}.`);
        validateReferences(event);
        const resolution = this.registry.resolve(event);
        this.nextSeq++;
        if (resolution.kind !== "known") {
          const required = resolution.kind.endsWith("required") && !resolution.kind.endsWith("ignorable");
          if (required) this.accessState = "browse-only";
          else if (this.accessState === "read-write") this.accessState = "degraded";
          const code = resolution.kind === "unknown-required" ? "UNKNOWN_REQUIRED_CODEC" : resolution.kind === "unknown-ignorable" ? "UNKNOWN_IGNORABLE_CODEC" : resolution.kind === "unsupported-required" ? "UNSUPPORTED_REQUIRED_VERSION" : "UNSUPPORTED_IGNORABLE_VERSION";
          this.diagnostics.push(diagnostic(code, event, `Unavailable codec or version for ${event.type}.`));
          continue;
        }
        if (resolution.codec.validateRelations) resolution.codec.validateRelations({ previous: [...previous(), ...events.slice(0, index)], candidate: event });
        if (this.kind !== null) {
          if (isTransactionStart(event.type) || transactionIdOf(resolution.data, this.kind) !== this.transactionId) invalid(`${this.kind} transaction ${this.transactionId} must be contiguous.`);
          this.pending.push({ event, data: resolution.data });
          if (isTransactionEnd(event.type, this.kind)) {
            for (const item of this.pending) apply(item.event, item.data);
            this.pending = []; this.kind = null; this.transactionId = null;
          }
        } else if (isTransactionStart(event.type)) {
          this.kind = event.type === "recovery/start" ? "recovery" : "compaction";
          this.transactionId = transactionIdOf(resolution.data, this.kind);
          if (this.transactionId === null) invalid(`${this.kind} start must carry its transaction identity.`);
          this.pending = [{ event, data: resolution.data }];
        } else {
          if (["recovery/committed", "compaction/summary", "compaction/end", "surface/replaced", "tool/recovery-outcome"].includes(event.type)) invalid(`${event.type} must be part of its matching transaction.`);
          apply(event, resolution.data);
        }
      }
      publish?.(effective);
      return this.result;
    } catch (error) {
      for (let index = undo.length - 1; index >= 0; index--) undo[index]!();
      this.nextSeq = checkpoint.nextSeq; this.accessState = checkpoint.accessState;
      this.diagnostics.length = checkpoint.diagnostics;
      this.pending = checkpoint.pending; this.pending.length = checkpoint.pendingLength;
      this.kind = checkpoint.kind; this.transactionId = checkpoint.transactionId;
      if (error instanceof SessionError) throw error;
      throw new SessionError("SESSION_CORRUPT", `Invalid event batch at seq ${checkpoint.nextSeq}.`, error);
    }
  }

  get result(): SessionValidationResult {
    return Object.freeze({ accessState: this.accessState, diagnostics: Object.freeze([...this.diagnostics]), relations: Object.freeze({
      openTurnId: this.relations.openTurnId, openStepId: this.relations.openStepId,
      openRequestIds: Object.freeze([...this.relations.requests.keys()]),
      openToolCallIds: Object.freeze([...this.relations.tools].sort((a, b) => a[1].order - b[1].order).map(([id]) => id)),
      pendingInboxMessageIds: Object.freeze([...this.relations.inbox].sort((a, b) => a[1].seq - b[1].seq).map(([id]) => id)),
      committedRepairIds: Object.freeze([...this.relations.committedRepairIds].sort()),
    }) });
  }
}

export function validateSessionEvents(events: readonly SessionEventEnvelopeV1[], registry: EventCodecRegistry): SessionValidationResult {
  return new SessionEventValidator(registry).append(events);
}

/** Preserve duplicate-ID checks without retaining settled request/tool payloads. */
function relationUndo(state: MutableRelations, dataValue: RuntimeV2JsonValue): () => void {
  const data = asRecord(dataValue, "relation");
  const turn = state.openTurnId, step = state.openStepId, repair = state.activeRepairId, run = state.openAgentRunId;
  const restores: Array<() => void> = [];
  const save = <T extends object>(map: Map<string, T>, key: unknown) => {
    if (typeof key !== "string") return;
    const prior = map.get(key); const copy = prior ? { ...prior } : undefined;
    restores.push(() => { if (copy) map.set(key, copy); else map.delete(key); });
  };
  const saveSet = (set: Set<string>, key: unknown) => { if (typeof key === "string" && !set.has(key)) restores.push(() => { set.delete(key); }); };
  save(state.requests, data.requestId); save(state.tools, data.callId ?? data.toolCallId); save(state.inbox, data.messageId);
  save(state.auxiliary, data.attemptId); saveSet(state.auxiliaryIds, data.attemptId);
  saveSet(state.requestIds, data.requestId); saveSet(state.toolIds, data.callId ?? data.toolCallId); saveSet(state.inboxIds, data.messageId); saveSet(state.committedRepairIds, data.repairId);
  return () => { state.openTurnId = turn; state.openStepId = step; state.activeRepairId = repair; state.openAgentRunId = run; restores.forEach(restore => restore()); };
}

export function effectiveSessionEvents(events: readonly SessionEventEnvelopeV1[]): readonly SessionEventEnvelopeV1[] {
  const effective: SessionEventEnvelopeV1[] = [];
  let buffer: SessionEventEnvelopeV1[] | null = null;
  let kind: "recovery" | "compaction" | null = null;
  let id: string | null = null;
  for (const event of events) {
    if (buffer === null) {
      if (event.type === "recovery/start" || event.type === "compaction/start") {
        kind = event.type === "recovery/start" ? "recovery" : "compaction";
        id = transactionIdOf(event.data, kind);
        buffer = [event];
      } else effective.push(event);
      continue;
    }
    buffer.push(event);
    if (kind !== null && isTransactionEnd(event.type, kind) && transactionIdOf(event.data, kind) === id) {
      effective.push(...buffer);
      buffer = null;
      kind = null;
      id = null;
    }
  }
  return Object.freeze(effective);
}

export function assertSessionCanClose(result: SessionValidationResult): void {
  if (result.relations.openTurnId !== null || result.relations.openStepId !== null || result.relations.openRequestIds.length > 0 || result.relations.openToolCallIds.length > 0) {
    throw new SessionError("INVALID_EVENT", "A closed Session cannot retain an open Turn, Step, request, or tool call.");
  }
}

function createRelations(): MutableRelations {
  return { openTurnId: null, openStepId: null, openAgentRunId: null, auxiliary: new Map(), auxiliaryIds: new Set(), requests: new Map(), tools: new Map(), inbox: new Map(), requestIds: new Set(), toolIds: new Set(), inboxIds: new Set(), activeRepairId: null, committedRepairIds: new Set() };
}

function applyRelations(state: MutableRelations, event: SessionEventEnvelopeV1, dataValue: RuntimeV2JsonValue): void {
  const data = asRecord(dataValue, event.type);
  switch (event.type) {
    case "turn/start": {
      const turnId = id(data.turnId, event.type);
      if (state.openTurnId !== null) invalid(`Cannot start Turn ${turnId} while ${state.openTurnId} is open.`);
      state.openTurnId = turnId;
      state.openAgentRunId = typeof data.agentRunId === "string" ? data.agentRunId : null;
      break;
    }
    case "turn/end": {
      const turnId = id(data.turnId, event.type);
      if (state.openTurnId !== turnId || state.openStepId !== null) invalid(`Turn ${turnId} cannot end in the current relation state.`);
      if ([...state.tools.values()].some((tool) => !tool.terminal)) invalid(`Turn ${turnId} has an open tool call.`);
      if ([...state.requests.values()].some((request) => !request.terminal)) invalid(`Turn ${turnId} has an open request.`);
      state.openTurnId = null;
      state.openAgentRunId = null;
      break;
    }
    case "step/start": {
      const turnId = id(data.turnId, event.type);
      const stepId = id(data.stepId, event.type);
      if (state.openTurnId !== turnId || state.openStepId !== null) invalid(`Step ${stepId} requires its open Turn and no prior open Step.`);
      state.openStepId = stepId;
      break;
    }
    case "step/end": {
      const stepId = id(data.stepId, event.type);
      if (state.openStepId !== stepId || [...state.tools.values()].some((tool) => !tool.terminal) || [...state.requests.values()].some((request) => !request.terminal)) invalid(`Step ${stepId} cannot end with open requests or tools.`);
      state.openStepId = null;
      break;
    }
    case "request/header": {
      requireOpenStep(state, data, event.type);
      const requestId = id(data.requestId, event.type);
      if (state.requestIds.has(requestId)) invalid(`Duplicate request ${requestId}.`);
      state.requestIds.add(requestId);
      state.requests.set(requestId, { header: true, context: false, terminal: false });
      break;
    }
    case "request/context": {
      requireOpenStep(state, data, event.type);
      const request = state.requests.get(id(data.requestId, event.type));
      if (request === undefined || !request.header || request.context || request.terminal) invalid("Request context requires one open request header.");
      request.context = true;
      break;
    }
    // A retry records a completed failed attempt, before waiting or starting
    // another request. Keeping it open breaks settlement and cold recovery.
    case "llm/retry": {
      const requestId = id(data.requestId, event.type);
      const request = state.requests.get(requestId);
      if (request === undefined || !request.context || request.terminal) invalid(`Retry references an invalid request ${requestId}.`);
      state.requests.delete(requestId);
      break;
    }
    case "assistant/message": {
      const requestId = typeof data.requestId === "string" ? data.requestId : null;
      if (requestId !== null) {
        const request = state.requests.get(requestId);
        if (request === undefined || !request.context || request.terminal) invalid(`Assistant message references an invalid request ${requestId}.`);
        state.requests.delete(requestId);
      }
      break;
    }
    case "tool/call": {
      if (state.openStepId === null) invalid("Tool call requires an open Step.");
      const callId = id(data.callId ?? data.toolCallId, event.type);
      if (state.toolIds.has(callId)) invalid(`Duplicate tool call ${callId}.`);
      state.toolIds.add(callId);
      state.tools.set(callId, { terminal: false, order: event.seq });
      break;
    }
    case "llm/auxiliary-start":
    case "llm/auxiliary-end": {
      if (event.surface !== null) invalid("Auxiliary requests cannot modify Surface.");
      if (data.purpose === "image-inspection" || data.purpose === "auto-review") {
        if (data.turnId !== state.openTurnId || data.stepId !== state.openStepId || !state.tools.has(id(data.callId, event.type)) || (state.openAgentRunId !== null && data.agentRunId !== state.openAgentRunId)) invalid("Auxiliary request requires its active parent run, Turn, Step and tool call.");
      } else if (event.type === "llm/auxiliary-start" && data.turnId !== undefined && data.turnId !== state.openTurnId) invalid("Compaction requires its active Turn.");
      const attemptId = id(data.attemptId, event.type);
      if (event.type === "llm/auxiliary-start") {
        if (state.auxiliaryIds.has(attemptId)) invalid(`Duplicate auxiliary attempt ${attemptId}.`);
        state.auxiliaryIds.add(attemptId);
        state.auxiliary.set(attemptId, data);
      } else {
        const start = state.auxiliary.get(attemptId);
        if (start === undefined || AUXILIARY_IDENTITY_FIELDS.some(field => start[field] !== data[field])) invalid(`Auxiliary terminal ${attemptId} requires its matching open start.`);
        state.auxiliary.delete(attemptId);
      }
      break;
    }
    case "tool/result": {
      const callId = id(data.callId ?? data.toolCallId, event.type);
      if ([...state.auxiliary.values()].some(attempt => attempt.callId === callId)) invalid(`Tool ${callId} has an unfinished auxiliary request.`);
      const tool = state.tools.get(callId);
      if (tool === undefined || tool.terminal) invalid(`Tool call ${callId} has no open result slot.`);
      const earliest = [...state.tools].filter(([, candidate]) => !candidate.terminal).sort((left, right) => left[1].order - right[1].order)[0]?.[0];
      if (earliest !== callId) invalid(`Tool terminal facts must commit in call order; expected ${earliest}, received ${callId}.`);
      state.tools.delete(callId);
      break;
    }
    case "tool/recovery-outcome": {
      const callId = id(data.callId ?? data.toolCallId, event.type);
      const tool = state.tools.get(callId);
      if (tool === undefined || tool.terminal) invalid(`Tool call ${callId} has no open recovery slot.`);
      state.tools.delete(callId);
      break;
    }
    case "agent/inbox/spliced": {
      const messageId = id(data.messageId, event.type);
      const operation = data.operation;
      const target = inboxTarget(data.target, event.type);
      if (operation === "enqueue") {
        if (state.inboxIds.has(messageId)) invalid(`Inbox message ${messageId} is duplicated.`);
        state.inboxIds.add(messageId);
        state.inbox.set(messageId, { status: "pending", target, seq: event.seq });
      } else if (operation === "claim" || operation === "discard") {
        const item = state.inbox.get(messageId);
        if (item?.status !== "pending" || item.target !== target) invalid(`Inbox message ${messageId} is not pending for ${target}.`);
        if (operation === "claim") {
          const earliest = [...state.inbox].filter(([, candidate]) => candidate.status === "pending" && candidate.target === target).sort((left, right) => left[1].seq - right[1].seq)[0]?.[0];
          if (earliest !== messageId) invalid(`Inbox ${target} claims must preserve enqueue order.`);
          if (event.surface?.kind !== "append" || event.surface.node.kind !== "user" || !event.provenance.sourceEventSeqs.includes(item.seq)) invalid("Claimed Inbox input must append a user Surface node citing enqueue.");
          state.inbox.delete(messageId);
        } else {
          if (event.surface !== null) invalid("Discarded Inbox input cannot enter Surface.");
          state.inbox.delete(messageId);
        }
      } else invalid("Inbox splice operation must be enqueue, claim, or discard.");
      break;
    }
    case "recovery/start": {
      const repairId = id(data.repairId, event.type);
      if (state.activeRepairId !== null || state.committedRepairIds.has(repairId)) invalid(`Repair ${repairId} cannot start.`);
      state.activeRepairId = repairId;
      break;
    }
    case "recovery/committed": {
      const repairId = id(data.repairId, event.type);
      if (state.activeRepairId !== repairId) invalid(`Repair ${repairId} has no matching start.`);
      state.activeRepairId = null;
      state.committedRepairIds.add(repairId);
      break;
    }
    default:
      break;
  }
}

function validateReferences(event: SessionEventEnvelopeV1): void {
  for (const seq of event.provenance.sourceEventSeqs) if (seq >= event.seq) invalid(`Event ${event.seq} provenance references non-prior seq ${seq}.`);
  if (event.provenance.runtimeSelectionSeq !== null && event.provenance.runtimeSelectionSeq >= event.seq) invalid(`Event ${event.seq} runtime selection must reference a prior event.`);
}

function requireOpenStep(state: MutableRelations, data: Readonly<Record<string, RuntimeV2JsonValue>>, type: string): void {
  if (state.openTurnId !== id(data.turnId, type) || state.openStepId === null) invalid(`${type} does not belong to the open Turn and Step.`);
}

function asRecord(value: RuntimeV2JsonValue, type: string): Readonly<Record<string, RuntimeV2JsonValue>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(`${type} data must be an object.`);
  return value as Readonly<Record<string, RuntimeV2JsonValue>>;
}

function id(value: RuntimeV2JsonValue | undefined, type: string): string {
  if (typeof value !== "string" || value.length === 0) invalid(`${type} is missing an identity field.`);
  return value;
}

function inboxTarget(value: RuntimeV2JsonValue | undefined, type: string): "next-step" | "next-turn" {
  if (value !== "next-step" && value !== "next-turn") invalid(`${type} has an invalid Inbox target.`);
  return value;
}

function transactionIdOf(value: RuntimeV2JsonValue, kind: "recovery" | "compaction"): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const field = kind === "recovery" ? "repairId" : "compactionId";
  const valueId = (value as Readonly<Record<string, RuntimeV2JsonValue>>)[field];
  return typeof valueId === "string" && valueId.length > 0 ? valueId : null;
}

function isTransactionStart(type: string): boolean { return type === "recovery/start" || type === "compaction/start"; }
function isTransactionEnd(type: string, kind: "recovery" | "compaction"): boolean { return kind === "recovery" ? type === "recovery/committed" : type === "compaction/end"; }
function diagnostic(code: SessionValidationDiagnostic["code"], event: SessionEventEnvelopeV1, message: string): SessionValidationDiagnostic { return Object.freeze({ code, seq: event.seq, type: event.type, message }); }
function invalid(message: string): never { throw new SessionError("SESSION_CORRUPT", message); }
