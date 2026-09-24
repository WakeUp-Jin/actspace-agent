import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { EventCodecRegistry, type EventCodec } from "./codec-registry.js";
import { SessionError } from "./errors.js";

/** The DSH SessionEventMap: the only events the Agent Loop must know about. */
export const CORE_EVENT_TYPES = [
  "turn/start",
  "turn/end",
  "step/start",
  "step/end",
  "user/message",
  "assistant/chunk",
  "assistant/message",
  "tool/call",
  "tool/result",
  "todo/write",
  "request/header",
  "request/context",
  "session/end-seed",
] as const;

export type CoreSessionEventType = (typeof CORE_EVENT_TYPES)[number];

/**
 * Durable extensions from DSH's persistence catalog plus ActSpace-owned
 * recovery/delegation facts that are not part of the 13-event loop contract.
 */
export const PERSISTED_EXTENSION_EVENT_TYPES = [
  "agent/inbox/spliced",
  "agent-preset/selected",
  "permission/asked",
  "permission/decided",
  "permission/mode-set",
  "permission/scope-denied",
  "permission/grant-added",
  "permission/grant-revoked",
  "command/done",
  "command/run",
  "compaction/end",
  "compaction/prune",
  "compaction/start",
  "compaction/summary",
  "feedback/record",
  "goal/change",
  "hook/invoked",
  "hook/result",
  "llm/retry",
  "llm/retry-started",
  "plan/mode",
  "sandbox/mode",
  "schedule/change",
  "session/title-set",
  "session/pinned-set",
  "session/archived-set",
  "session/workspace-set",
  "session/title",
  "session/title-llm-request",
  "subagent/descriptor",
  "tool/code-dispatch",
  "tool/code-dispatch-start",
  "tool/recovery-outcome",
  "tool-workflow/agent-end",
  "tool-workflow/agent-start",
  "tool-workflow/run-end",
  "tool-workflow/run-start",
  "web/deepseek-search-llm-request",
  "delegation/requested",
  "delegation/child-terminal",
  "delegation/completed",
  "recovery/committed",
  "recovery/start",
  "surface/replaced",
] as const;

export type PersistedExtensionEventType = (typeof PERSISTED_EXTENSION_EVENT_TYPES)[number];
export type ActSpaceSessionEventType = CoreSessionEventType | PersistedExtensionEventType;

export function createCoreCodecRegistry(pluginCodecs: readonly EventCodec[] = []): EventCodecRegistry {
  const core = CORE_EVENT_TYPES.map((type) => createCoreCodec(type));
  const extensions = PERSISTED_EXTENSION_EVENT_TYPES.map((type) => createExtensionCodec(type));
  return new EventCodecRegistry([...core, ...extensions, ...pluginCodecs]);
}

function createCoreCodec(type: CoreSessionEventType): EventCodec {
  return Object.freeze({
    type,
    ownerPluginId: "@actspace/core",
    currentVersion: 1,
    criticality: "required",
    validate: (data: RuntimeV2JsonValue) => validateCoreData(type, data),
  });
}

function createExtensionCodec(type: PersistedExtensionEventType): EventCodec {
  return Object.freeze({
    type,
    ownerPluginId: "@actspace/core",
    currentVersion: 1,
    criticality: "required",
    validate: (data: RuntimeV2JsonValue) => {
      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        throw invalid(type, "data must be an object");
      }
      if (type.startsWith("permission/")) validatePermissionData(type, data as Readonly<Record<string, RuntimeV2JsonValue>>);
    },
  });
}

function validatePermissionData(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  if (type === "permission/mode-set") {
    if (data.mode !== "default" && data.mode !== "full-access") throw invalid(type, "mode must be default or full-access");
    return;
  }
  if (type === "permission/scope-denied") {
    requireId(data.callId, type, "callId");
    requireId(data.code, type, "code");
    requireId(data.reason, type, "reason");
    return;
  }
  if (type === "permission/grant-added") {
    validateGrantAdded(type, data);
    return;
  }
  if (type === "permission/grant-revoked") {
    requireSchemaVersion(data, type);
    for (const field of ["grantId", "sessionId", "agentId", "revokedAt"] as const) requireId(data[field], type, field);
    if (data.reason !== undefined && (typeof data.reason !== "string" || data.reason.length === 0 || data.reason.length > 240)) throw invalid(type, "reason must be a non-empty string of at most 240 characters when present");
    requireTimestamp(data.revokedAt, type, "revokedAt");
    return;
  }
  requireId(data.requestId, type, "requestId");
  if (type === "permission/asked") {
    if (data.schemaVersion !== 1) throw invalid(type, "schemaVersion must be 1");
    for (const field of ["callId", "sessionId", "agentRunId", "agentId", "pluginId", "toolName", "definitionDigest", "normalizedArgsDigest", "requestedAt", "expiresAt"] as const) requireId(data[field], type, field);
    if (!Array.isArray(data.reasons) || data.reasons.length === 0) throw invalid(type, "reasons must be a non-empty array");
    if (!Array.isArray(data.resources) || !Array.isArray(data.grantSuggestions) || !Array.isArray(data.supportedLifetimes)) throw invalid(type, "resources, grantSuggestions and supportedLifetimes must be arrays");
    if (data.supportedLifetimes.some(value => value !== "once" && value !== "session")) throw invalid(type, "supportedLifetimes contains an invalid lifetime");
    if (!data.supportedLifetimes.includes("once")) throw invalid(type, "supportedLifetimes must include once");
    for (const suggestion of data.grantSuggestions) validateGrantSuggestion(type, record(suggestion));
    if (data.supportedLifetimes.includes("session") !== (data.grantSuggestions.length > 0)) throw invalid(type, "session lifetime and grantSuggestions must appear together");
    return;
  }
  if (data.kind !== "once" && data.kind !== "session" && data.kind !== "deny") throw invalid(type, "kind must be once, session or deny");
  requireId(data.decidedAt, type, "decidedAt");
  requireTimestamp(data.decidedAt, type, "decidedAt");
  if (data.kind === "session") requireId(data.suggestionId, type, "suggestionId");
  if (data.kind === "deny" && !["user-denied", "timeout", "aborted", "broker-unavailable", "invalid-decision"].includes(String(data.code))) throw invalid(type, "deny code is invalid");
}

function validateGrantAdded(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  requireSchemaVersion(data, type);
  for (const field of ["grantId", "sessionId", "agentId", "sourceRequestId", "sourceCallId", "sourceToolName", "issuedAt"] as const) requireId(data[field], type, field);
  requireTimestamp(data.issuedAt, type, "issuedAt");
  if (data.expiresAt !== undefined) {
    requireId(data.expiresAt, type, "expiresAt");
    requireTimestamp(data.expiresAt, type, "expiresAt");
  }
  if (data.action !== "file.read" && data.action !== "file.write") throw invalid(type, "action must be file.read or file.write");
  if (data.access !== "read" && data.access !== "write") throw invalid(type, "access must be read or write");
  if ((data.action === "file.read") !== (data.access === "read")) throw invalid(type, "action and access must agree");
  const audience = record(data.audience);
  for (const field of ["pluginId", "permissionDomain"] as const) requireId(audience[field], type, `audience.${field}`);
  if (!Number.isSafeInteger(audience.policyVersion) || (audience.policyVersion as number) < 1) throw invalid(type, "audience.policyVersion must be a positive integer");
  const selector = record(data.selector);
  if (selector.kind === "exact") requireCanonicalPath(selector.canonicalPath, type, "selector.canonicalPath");
  else if (selector.kind === "subtree") requireCanonicalPath(selector.canonicalRoot, type, "selector.canonicalRoot");
  else throw invalid(type, "selector.kind must be exact or subtree");
}

function validateGrantSuggestion(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  for (const field of ["suggestionId", "label"] as const) requireId(data[field], type, `grantSuggestions.${field}`);
  if (data.lifetime !== "session") throw invalid(type, "grantSuggestions.lifetime must be session");
  validateGrantScope(type, data);
}

function validateGrantScope(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  if (data.action !== "file.read" && data.action !== "file.write") throw invalid(type, "action must be file.read or file.write");
  if (data.access !== "read" && data.access !== "write") throw invalid(type, "access must be read or write");
  if ((data.action === "file.read") !== (data.access === "read")) throw invalid(type, "action and access must agree");
  const audience = record(data.audience);
  for (const field of ["pluginId", "permissionDomain"] as const) requireId(audience[field], type, `audience.${field}`);
  if (!Number.isSafeInteger(audience.policyVersion) || (audience.policyVersion as number) < 1) throw invalid(type, "audience.policyVersion must be a positive integer");
  const selector = record(data.selector);
  if (selector.kind === "exact") requireCanonicalPath(selector.canonicalPath, type, "selector.canonicalPath");
  else if (selector.kind === "subtree") requireCanonicalPath(selector.canonicalRoot, type, "selector.canonicalRoot");
  else throw invalid(type, "selector.kind must be exact or subtree");
}

function requireSchemaVersion(data: Readonly<Record<string, RuntimeV2JsonValue>>, type: string): void {
  if (data.schemaVersion !== 1) throw invalid(type, "schemaVersion must be 1");
}

function requireTimestamp(value: RuntimeV2JsonValue | undefined, type: string, field: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw invalid(type, `${field} must be a valid timestamp`);
}

function requireCanonicalPath(value: RuntimeV2JsonValue | undefined, type: string, field: string): void {
  if (typeof value !== "string" || value.length === 0 || !(/^\//.test(value) || /^[A-Za-z]:[\\/]/.test(value)) || /[*?\[\]{}]/.test(value)) throw invalid(type, `${field} must be an absolute canonical path without glob syntax`);
}

function validateCoreData(type: CoreSessionEventType, data: RuntimeV2JsonValue): void {
  if (!isRecord(data)) throw invalid(type, "data must be an object");
  switch (type) {
    case "turn/start":
    case "turn/end":
      requireId(data.turnId, type, "turnId");
      break;
    case "step/start":
    case "step/end":
      requireId(data.turnId, type, "turnId");
      requireId(data.stepId, type, "stepId");
      break;
    case "user/message":
    case "assistant/message":
      requireId(data.messageId, type, "messageId");
      break;
    case "assistant/chunk":
      requireId(data.messageId, type, "messageId");
      if (!Number.isSafeInteger(data.chunkIndex) || (data.chunkIndex as number) < 0) {
        throw invalid(type, "chunkIndex must be a non-negative integer");
      }
      break;
    case "tool/call":
      requireId(data.callId ?? data.toolCallId, type, "callId");
      requireToolName(data.name, type);
      break;
    case "tool/result":
      requireId(data.callId ?? data.toolCallId, type, "callId");
      requireToolName(data.name, type);
      if (typeof data.status !== "string" || data.status.length === 0) throw invalid(type, "status must be a non-empty string");
      break;
    case "todo/write":
      if (!Array.isArray(data.items)) throw invalid(type, "items must be an array");
      if (data.revision !== undefined && (!Number.isSafeInteger(data.revision) || (data.revision as number) < 1)) {
        throw invalid(type, "revision must be a positive integer");
      }
      break;
    case "request/header":
    case "request/context":
      requireId(data.requestId, type, "requestId");
      if (type === "request/header" || type === "request/context") {
        requireId(data.turnId, type, "turnId");
        requireId(data.stepId, type, "stepId");
      }
      break;
    case "session/end-seed":
      requireId(data.sessionId, type, "sessionId");
      if (data.lastSeq !== undefined && (!Number.isSafeInteger(data.lastSeq) || (data.lastSeq as number) < -1)) {
        throw invalid(type, "lastSeq must be an integer >= -1");
      }
      break;
    default:
      break;
  }
}

function isRecord(value: RuntimeV2JsonValue): value is Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: RuntimeV2JsonValue | undefined): Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== undefined && isRecord(value) ? value : {};
}

function requireId(value: RuntimeV2JsonValue | undefined, type: string, field: string): void {
  if (typeof value !== "string" || value.length === 0) throw invalid(type, `${field} must be a non-empty string`);
}

function requireToolName(value: RuntimeV2JsonValue | undefined, type: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value)) throw invalid(type, "name must match ^[a-zA-Z0-9_-]+$");
}

function invalid(type: string, reason: string): SessionError {
  return new SessionError("INVALID_EVENT", `${type}: ${reason}.`);
}
