import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { EventCodecRegistry } from "./codec-registry.js";
import { validateEventEnvelopeShape, type SessionEventEnvelopeV1 } from "./event-envelope.js";
import { SessionError } from "./errors.js";

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
  requests: Map<string, { header: boolean; context: boolean; terminal: boolean }>;
  tools: Map<string, { terminal: boolean; order: number }>;
  inbox: Map<string, { status: "pending" | "claimed" | "discarded"; target: "next-step" | "next-turn"; seq: number }>;
  activeRepairId: string | null;
  committedRepairIds: Set<string>;
};

export function validateSessionEvents(events: readonly SessionEventEnvelopeV1[], registry: EventCodecRegistry): SessionValidationResult {
  const diagnostics: SessionValidationDiagnostic[] = [];
  const relations = createRelations();
  let transactionBuffer: Array<{ event: SessionEventEnvelopeV1; data: RuntimeV2JsonValue }> | null = null;
  let transactionKind: "recovery" | "compaction" | null = null;
  let transactionId: string | null = null;
  let accessState: SessionAccessState = "read-write";

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    try {
      validateEventEnvelopeShape(event);
      if (event.seq !== index) throw new SessionError("SESSION_CORRUPT", `Expected seq ${index}, received ${event.seq}.`);
      validateReferences(event);
      const resolution = registry.resolve(event);
      switch (resolution.kind) {
        case "unknown-required":
          accessState = "browse-only";
          diagnostics.push(diagnostic("UNKNOWN_REQUIRED_CODEC", event, `No codec is installed for required event ${event.type}.`));
          continue;
        case "unknown-ignorable":
          if (accessState === "read-write") accessState = "degraded";
          diagnostics.push(diagnostic("UNKNOWN_IGNORABLE_CODEC", event, `No codec is installed for ignorable event ${event.type}.`));
          continue;
        case "unsupported-required":
          accessState = "browse-only";
          diagnostics.push(diagnostic("UNSUPPORTED_REQUIRED_VERSION", event, `Event version ${event.eventVersion} is newer than codec ${resolution.codec.currentVersion}.`));
          continue;
        case "unsupported-ignorable":
          if (accessState === "read-write") accessState = "degraded";
          diagnostics.push(diagnostic("UNSUPPORTED_IGNORABLE_VERSION", event, `Ignorable event version ${event.eventVersion} is unsupported.`));
          continue;
        case "known":
          resolution.codec.validateRelations?.({ previous: events.slice(0, index), candidate: event });
          if (transactionBuffer !== null && transactionKind !== null) {
            const eventTransactionId = transactionIdOf(resolution.data, transactionKind);
            if (isTransactionStart(event.type) || eventTransactionId !== transactionId) invalid(`${transactionKind} transaction ${transactionId} must be contiguous.`);
            transactionBuffer.push({ event, data: resolution.data });
            if (isTransactionEnd(event.type, transactionKind)) {
              for (const buffered of transactionBuffer) applyRelations(relations, buffered.event, buffered.data);
              transactionBuffer = null;
              transactionKind = null;
              transactionId = null;
            }
          } else if (event.type === "recovery/start" || event.type === "compaction/start") {
            transactionKind = event.type === "recovery/start" ? "recovery" : "compaction";
            transactionId = transactionIdOf(resolution.data, transactionKind);
            if (transactionId === null) invalid(`${transactionKind} start must carry its transaction identity.`);
            transactionBuffer = [{ event, data: resolution.data }];
          } else {
            if (event.type === "recovery/committed" || event.type === "compaction/summary" || event.type === "compaction/end" || event.type === "surface/replaced" || event.type === "tool/recovery-outcome") {
              invalid(`${event.type} must be part of its matching transaction.`);
            }
            applyRelations(relations, event, resolution.data);
          }
          break;
      }
    } catch (error) {
      if (error instanceof SessionError) throw error;
      throw new SessionError("SESSION_CORRUPT", `Invalid event at seq ${index}.`, error);
    }
  }

  return Object.freeze({
    accessState,
    diagnostics: Object.freeze(diagnostics),
    relations: Object.freeze({
      openTurnId: relations.openTurnId,
      openStepId: relations.openStepId,
      openRequestIds: Object.freeze([...relations.requests].filter(([, value]) => !value.terminal).map(([id]) => id)),
      openToolCallIds: Object.freeze([...relations.tools].filter(([, value]) => !value.terminal).sort((a, b) => a[1].order - b[1].order).map(([id]) => id)),
      pendingInboxMessageIds: Object.freeze([...relations.inbox].filter(([, value]) => value.status === "pending").sort((left, right) => left[1].seq - right[1].seq).map(([id]) => id)),
      committedRepairIds: Object.freeze([...relations.committedRepairIds].sort()),
    }),
  });
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
  return { openTurnId: null, openStepId: null, requests: new Map(), tools: new Map(), inbox: new Map(), activeRepairId: null, committedRepairIds: new Set() };
}

function applyRelations(state: MutableRelations, event: SessionEventEnvelopeV1, dataValue: RuntimeV2JsonValue): void {
  const data = asRecord(dataValue, event.type);
  switch (event.type) {
    case "turn/start": {
      const turnId = id(data.turnId, event.type);
      if (state.openTurnId !== null) invalid(`Cannot start Turn ${turnId} while ${state.openTurnId} is open.`);
      state.openTurnId = turnId;
      break;
    }
    case "turn/end": {
      const turnId = id(data.turnId, event.type);
      if (state.openTurnId !== turnId || state.openStepId !== null) invalid(`Turn ${turnId} cannot end in the current relation state.`);
      if ([...state.tools.values()].some((tool) => !tool.terminal)) invalid(`Turn ${turnId} has an open tool call.`);
      if ([...state.requests.values()].some((request) => !request.terminal)) invalid(`Turn ${turnId} has an open request.`);
      state.openTurnId = null;
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
      if (state.requests.has(requestId)) invalid(`Duplicate request ${requestId}.`);
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
    case "assistant/message": {
      const requestId = typeof data.requestId === "string" ? data.requestId : null;
      if (requestId !== null) {
        const request = state.requests.get(requestId);
        if (request === undefined || !request.context || request.terminal) invalid(`Assistant message references an invalid request ${requestId}.`);
        request.terminal = true;
      }
      break;
    }
    case "tool/call": {
      if (state.openStepId === null) invalid("Tool call requires an open Step.");
      const callId = id(data.callId ?? data.toolCallId, event.type);
      if (state.tools.has(callId)) invalid(`Duplicate tool call ${callId}.`);
      state.tools.set(callId, { terminal: false, order: event.seq });
      break;
    }
    case "tool/result": {
      const callId = id(data.callId ?? data.toolCallId, event.type);
      const tool = state.tools.get(callId);
      if (tool === undefined || tool.terminal) invalid(`Tool call ${callId} has no open result slot.`);
      const earliest = [...state.tools].filter(([, candidate]) => !candidate.terminal).sort((left, right) => left[1].order - right[1].order)[0]?.[0];
      if (earliest !== callId) invalid(`Tool terminal facts must commit in call order; expected ${earliest}, received ${callId}.`);
      tool.terminal = true;
      break;
    }
    case "tool/recovery-outcome": {
      const callId = id(data.callId ?? data.toolCallId, event.type);
      const tool = state.tools.get(callId);
      if (tool === undefined || tool.terminal) invalid(`Tool call ${callId} has no open recovery slot.`);
      tool.terminal = true;
      break;
    }
    case "agent/inbox/spliced": {
      const messageId = id(data.messageId, event.type);
      const operation = data.operation;
      const target = inboxTarget(data.target, event.type);
      if (operation === "enqueue") {
        if (state.inbox.has(messageId)) invalid(`Inbox message ${messageId} is duplicated.`);
        state.inbox.set(messageId, { status: "pending", target, seq: event.seq });
      } else if (operation === "claim" || operation === "discard") {
        const item = state.inbox.get(messageId);
        if (item?.status !== "pending" || item.target !== target) invalid(`Inbox message ${messageId} is not pending for ${target}.`);
        if (operation === "claim") {
          const earliest = [...state.inbox].filter(([, candidate]) => candidate.status === "pending" && candidate.target === target).sort((left, right) => left[1].seq - right[1].seq)[0]?.[0];
          if (earliest !== messageId) invalid(`Inbox ${target} claims must preserve enqueue order.`);
          if (event.surface?.kind !== "append" || event.surface.node.kind !== "user" || !event.provenance.sourceEventSeqs.includes(item.seq)) invalid("Claimed Inbox input must append a user Surface node citing enqueue.");
          item.status = "claimed";
        } else {
          if (event.surface !== null) invalid("Discarded Inbox input cannot enter Surface.");
          item.status = "discarded";
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
