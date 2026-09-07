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
  "approval/asked",
  "approval/decided",
  "approval/policy",
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
  "permission/preset",
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
    },
  });
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

function requireId(value: RuntimeV2JsonValue | undefined, type: string, field: string): void {
  if (typeof value !== "string" || value.length === 0) throw invalid(type, `${field} must be a non-empty string`);
}

function requireToolName(value: RuntimeV2JsonValue | undefined, type: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value)) throw invalid(type, "name must match ^[a-zA-Z0-9_-]+$");
}

function invalid(type: string, reason: string): SessionError {
  return new SessionError("INVALID_EVENT", `${type}: ${reason}.`);
}
