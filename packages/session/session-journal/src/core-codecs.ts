import { isCommandPrefixSelector, isSurfaceNode, SUBAGENT_ACTIVATION_STATUSES, SUBAGENT_DELIVERIES, SUBAGENT_KINDS, SUBAGENT_PRESETS, SUBAGENT_RESULT_LIMIT_BYTES, type CoreEventType, type RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { EventCodecRegistry, type EventCodec } from "./codec-registry.js";
import { SessionError } from "./errors.js";
import { validateAuxiliaryRequest } from "./auxiliary-codec.js";

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
  "request/header",
  "request/system-prompt",
  "request/tools",
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
  "agent/mode-set",
  "permission/asked",
  "permission/decided",
  "permission/mode-set",
  "permission/scope-denied",
  "permission/grant-added",
  "permission/grant-used",
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
  "llm/auxiliary-start",
  "llm/auxiliary-end",
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
  "subagent/spawned",
  "subagent/activation",
  "background/task",
  "recovery/committed",
  "recovery/start",
  "surface/replaced",
  "session/rewound",
] as const;

export type PersistedExtensionEventType = (typeof PERSISTED_EXTENSION_EVENT_TYPES)[number];
export type ActSpaceSessionEventType = CoreSessionEventType | PersistedExtensionEventType;

/**
 * `coreEvent` 能写的事件都得在上面两张表里有 codec，不然要到 `append` 时才报「未知事件类型」。
 * `CoreEventDataMap` 里多出一个这里没注册的事件名时，这一行编译不过，报错里带着那个名字。
 */
export type CoreEventTypeWithoutCodec = MustBeNever<Exclude<CoreEventType, ActSpaceSessionEventType>>;
type MustBeNever<T extends never> = T;

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
      if (type === "llm/auxiliary-start" || type === "llm/auxiliary-end") validateAuxiliaryRequest(type, record(data));
      if (type === "agent/mode-set") {
        const mode = (data as Readonly<Record<string, RuntimeV2JsonValue>>).mode;
        const revision = (data as Readonly<Record<string, RuntimeV2JsonValue>>).revision;
        if (mode !== "chat" && mode !== "plan" && mode !== "agent") throw invalid(type, "mode must be chat, plan or agent");
        if (!Number.isSafeInteger(revision) || (revision as number) < 1) throw invalid(type, "revision must be a positive integer");
      }
      if (type.startsWith("permission/")) validatePermissionData(type, data as Readonly<Record<string, RuntimeV2JsonValue>>);
      if (type === "background/task") validateBackgroundTaskData(type, data as Readonly<Record<string, RuntimeV2JsonValue>>);
      if (type === "surface/replaced") validateSurfaceReplaced(type, data as Readonly<Record<string, RuntimeV2JsonValue>>);
      // 恢复结果的模型可见文案存在 data.content，节点由 surfaceNode 推出（agent-spec-surface-derived.md §4.2）。
      if (type === "tool/recovery-outcome" && typeof (data as Readonly<Record<string, RuntimeV2JsonValue>>).content !== "string") throw invalid(type, "content must be a string");
      if (type === "subagent/spawned") validateSubagentSpawned(type, data as Readonly<Record<string, RuntimeV2JsonValue>>);
      if (type === "subagent/activation") validateSubagentActivation(type, data as Readonly<Record<string, RuntimeV2JsonValue>>);
      if (type === "session/rewound") validateSessionRewound(type, data as Readonly<Record<string, RuntimeV2JsonValue>>);
    },
  });
}

/** 替换事件带被替换范围的估算，上下文估算投影据此扣减（agent-spec-request-record.md §6.3.1）。 */
function validateSurfaceReplaced(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  const replaced = data.replacedTokens;
  if (replaced === null || typeof replaced !== "object" || Array.isArray(replaced)) throw invalid(type, "replacedTokens must be an object");
  for (const field of ["conversation", "summarizedConversation"] as const) {
    const value = (replaced as Readonly<Record<string, RuntimeV2JsonValue>>)[field];
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid(type, `replacedTokens.${field} must be a non-negative integer`);
  }
  requireId(data.estimatorVersion, type, "estimatorVersion");
  // 压缩摘要节点只存在 data 里，surface 只记替换范围（agent-spec-surface-derived.md §4.2）。
  if (!isSurfaceNode(data.node)) throw invalid(type, "node must be a user, assistant or tool-result Surface node");
}

/** 从某一轮重来之后，重新打开的会话追加这一条（agent-edit-resend-rewind.md §3.6）。 */
function validateSessionRewound(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  for (const field of ["cutSeq", "droppedThroughSeq"] as const) {
    if (!Number.isSafeInteger(data[field]) || (data[field] as number) < 0) throw invalid(type, `${field} must be a non-negative integer`);
  }
  if ((data.droppedThroughSeq as number) < (data.cutSeq as number)) throw invalid(type, "droppedThroughSeq must not be before cutSeq");
  requireId(data.runId, type, "runId");
  requireId(data.archive, type, "archive");
  requireTimestamp(data.rewoundAt, type, "rewoundAt");
}

function validateBackgroundTaskData(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  requireId(data.taskId, type, "taskId");
  if (data.op === "start") {
    if (data.kind !== "bash" && data.kind !== "agent") throw invalid(type, "kind must be bash or agent");
    requireId(data.callId, type, "callId");
    if (typeof data.description !== "string") throw invalid(type, "description must be a string");
    requireTimestamp(data.startedAt, type, "startedAt");
    return;
  }
  if (data.op === "settle") {
    if (data.status !== "completed" && data.status !== "failed" && data.status !== "stopped" && data.status !== "lost") throw invalid(type, "status must be completed, failed, stopped or lost");
    if (data.delivery !== "notified" && data.delivery !== "wait" && data.delivery !== "stopped" && data.delivery !== "lost") throw invalid(type, "delivery must be notified, wait, stopped or lost");
    if (data.exitCode !== undefined && data.exitCode !== null && !Number.isSafeInteger(data.exitCode)) throw invalid(type, "exitCode must be an integer or null when present");
    requireTimestamp(data.endedAt, type, "endedAt");
    return;
  }
  if (data.op === "prune") {
    if (data.reason !== "session-cap") throw invalid(type, "reason must be session-cap");
    requireTimestamp(data.prunedAt, type, "prunedAt");
    return;
  }
  throw invalid(type, "op must be start, settle or prune");
}

function validateSubagentSpawned(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  for (const field of ["agentId", "callId", "description", "transcriptPath"] as const) requireId(data[field], type, field);
  if (!oneOf(data.kind, SUBAGENT_KINDS)) throw invalid(type, "kind must be local, fork, codex or claude-code");
  if (data.kind === "local") {
    if (!oneOf(data.preset, SUBAGENT_PRESETS)) throw invalid(type, "preset must be general or explore for a local subagent");
  } else if (data.preset !== undefined) throw invalid(type, "preset is only allowed for a local subagent");
  if (data.inheritedThroughSeq !== undefined) {
    if (data.kind !== "fork") throw invalid(type, "inheritedThroughSeq is only allowed for a fork");
    if (!Number.isSafeInteger(data.inheritedThroughSeq) || (data.inheritedThroughSeq as number) < 0) throw invalid(type, "inheritedThroughSeq must be a non-negative integer");
  }
  requireTimestamp(data.createdAt, type, "createdAt");
}

function validateSubagentActivation(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  requireId(data.agentId, type, "agentId");
  requireId(data.activationId, type, "activationId");
  if (data.op === "start") {
    if (data.trigger !== "spawn" && data.trigger !== "message") throw invalid(type, "trigger must be spawn or message");
    requireId(data.callId, type, "callId");
    if (data.senderId !== undefined) requireId(data.senderId, type, "senderId");
    if (typeof data.background !== "boolean") throw invalid(type, "background must be a boolean");
    for (const field of ["model", "reasoningEffort"] as const) if (data[field] !== undefined) requireId(data[field], type, field);
    requireTimestamp(data.startedAt, type, "startedAt");
    return;
  }
  if (data.op === "settle") {
    if (!oneOf(data.status, SUBAGENT_ACTIVATION_STATUSES)) throw invalid(type, "status must be completed, interrupted, failed, max_steps or lost");
    if (typeof data.summary !== "string") throw invalid(type, "summary must be a string");
    if (!oneOf(data.delivery, SUBAGENT_DELIVERIES)) throw invalid(type, "delivery must be returned, notified, stopped or lost");
    if (data.result !== undefined) {
      if (typeof data.result !== "string") throw invalid(type, "result must be a string when present");
      if (new TextEncoder().encode(data.result).length > SUBAGENT_RESULT_LIMIT_BYTES) throw invalid(type, `result must be at most ${SUBAGENT_RESULT_LIMIT_BYTES} UTF-8 bytes`);
    }
    if (data.resultTruncated !== undefined && typeof data.resultTruncated !== "boolean") throw invalid(type, "resultTruncated must be a boolean when present");
    requireTimestamp(data.endedAt, type, "endedAt");
    return;
  }
  throw invalid(type, "op must be start or settle");
}

function oneOf<T extends string>(value: RuntimeV2JsonValue | undefined, values: readonly T[]): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function validatePermissionData(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  if (type === "permission/mode-set") {
    if (data.mode !== "default" && data.mode !== "full-access" && data.mode !== "auto-review") throw invalid(type, "mode must be default or full-access or auto-review");
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
  if (type === "permission/grant-used") {
    requireSchemaVersion(data, type);
    for (const field of ["grantId", "sessionId", "agentId", "callId", "pluginId", "toolName", "commandDigest"] as const) requireId(data[field], type, field);
    requireTimestamp(data.usedAt, type, "usedAt");
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
  validateGrantScope(type, data);
}

function validateGrantSuggestion(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  for (const field of ["suggestionId", "label"] as const) requireId(data[field], type, `grantSuggestions.${field}`);
  if (data.lifetime !== "session") throw invalid(type, "grantSuggestions.lifetime must be session");
  validateGrantScope(type, data);
}

function validateGrantScope(type: PersistedExtensionEventType, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  const process = data.action === "process.execute";
  if (!process && data.action !== "file.read" && data.action !== "file.write") throw invalid(type, "invalid grant action");
  if (data.access !== (process ? "execute" : data.action === "file.read" ? "read" : "write")) throw invalid(type, "action and access must agree");
  const audience = record(data.audience);
  for (const field of ["pluginId", "permissionDomain"] as const) requireId(audience[field], type, `audience.${field}`);
  if (!Number.isSafeInteger(audience.policyVersion) || (audience.policyVersion as number) < 1) throw invalid(type, "audience.policyVersion must be a positive integer");
  const selector = record(data.selector);
  if (process) {
    if (!isCommandPrefixSelector(selector)) throw invalid(type, "invalid command_prefix selector");
    return;
  }
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
      requireId(data.messageId, type, "messageId");
      break;
    case "assistant/message":
      requireId(data.messageId, type, "messageId");
      if (data.firstTokenAt !== undefined) requireTimestamp(data.firstTokenAt, type, "firstTokenAt");
      break;
    // Read-only compatibility: sessions written before 2026-11 journaled every stream delta.
    // New sessions keep deltas live-only (agent-spec-live-assistant-stream.md).
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
      if (data.approvalMode !== undefined && !["auto", "manual", "session"].includes(data.approvalMode as string)) throw invalid(type, "invalid approvalMode");
      if (data.approvalReason != null && typeof data.approvalReason !== "string") throw invalid(type, "invalid approvalReason");
      requireId(data.callId ?? data.toolCallId, type, "callId");
      requireToolName(data.name, type);
      if (typeof data.status !== "string" || data.status.length === 0) throw invalid(type, "status must be a non-empty string");
      break;
    case "request/header":
    case "request/context":
      requireId(data.requestId, type, "requestId");
      requireId(data.turnId, type, "turnId");
      requireId(data.stepId, type, "stepId");
      break;
    // 只在内容变化时写（agent-spec-request-record.md §3–§4）。
    case "request/system-prompt":
    case "request/tools":
      requireId(data.requestId, type, "requestId");
      requireId(data.turnId, type, "turnId");
      requireId(data.stepId, type, "stepId");
      requireId(data.digest, type, "digest");
      for (const field of type === "request/tools" ? ["tools"] : ["sections", "modelFacts", "contributorProvenance"]) {
        if (!Array.isArray(data[field])) throw invalid(type, `${field} must be an array`);
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
