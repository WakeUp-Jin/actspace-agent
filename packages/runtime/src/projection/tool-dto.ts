import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type {
  RuntimeV2ToolArgsSummary,
  RuntimeV2ToolDetailBlock,
  RuntimeV2ToolFailure,
  RuntimeV2ToolModelOutputBlock,
  RuntimeV2ToolRendererHint,
  RuntimeV2ToolView,
} from "@actspace/shared/runtime-v2/projection";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { ToolExecutionResult } from "@actspace/tools-runtime";
import type { ToolArtifactRef, ToolDetailBlock, ToolModelOutputBlock } from "@actspace/tools-runtime";
import { projectUnknownArtifact } from "./artifact.js";
import { redactProjectionText, redactProjectionValue, truncate } from "./redaction.js";

export type ToolProjectionIdentity = {
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly pluginId: string;
  readonly name: string;
  readonly callId: string;
};

export type RendererAllowlistEntry = {
  readonly id: string;
  readonly schemaVersion: number;
  readonly validate: (props: RuntimeV2JsonValue) => boolean;
};

export type RendererAllowlist = ReadonlyMap<string, RendererAllowlistEntry>;

export function createArgsSummary(args: RuntimeV2JsonValue): RuntimeV2ToolArgsSummary {
  const fields = isRecord(args)
    ? Object.entries(args).slice(0, 32).map(([name, value]) => Object.freeze({ name, value: formatValue(value), redacted: isRedactedValue(value, name) }))
    : [];
  const text = fields.length === 0 ? "{}" : `{ ${fields.map((field) => `${field.name}: ${field.value}`).join(", ")} }`;
  return Object.freeze({ text: truncate(text, 1200), fields: Object.freeze(fields) });
}

export function createRunningToolView(identity: ToolProjectionIdentity, event: SessionEventEnvelopeV1, args: RuntimeV2JsonValue, renderer: RuntimeV2ToolRendererHint | null = null): RuntimeV2ToolView {
  return Object.freeze({
    kind: "tool",
    schemaVersion: 1,
    ...identity,
    state: "running",
    phase: "queued",
    startedAt: event.time,
    finishedAt: null,
    durationMs: null,
    argsSummary: createArgsSummary(args),
    modelOutput: null,
    summary: "Tool call is in progress.",
    detail: Object.freeze([]),
    artifacts: Object.freeze([]),
    failure: null,
    renderer,
  });
}

export function completeToolView(previous: RuntimeV2ToolView, result: ToolExecutionResult, finishedAt: string, renderer: RuntimeV2ToolRendererHint | null = previous.renderer): RuntimeV2ToolView {
  const failure = result.status === "outcome-unknown" || result.failure !== undefined ? toFailure(result) : null;
  const state = result.status === "outcome-unknown" ? "failed" : result.status;
  return Object.freeze({
    ...previous,
    state,
    phase: null,
    finishedAt,
    durationMs: duration(previous.startedAt, finishedAt),
    modelOutput: Object.freeze(result.modelOutput.map(toModelOutput)),
    summary: redactProjectionText(result.summary),
    detail: Object.freeze(result.detail.map(toDetail)),
    artifacts: Object.freeze(result.artifacts.map((artifact) => projectUnknownArtifact(artifact)).filter((artifact): artifact is NonNullable<typeof artifact> => artifact !== null)),
    failure,
    renderer,
  });
}

export function projectRendererHint(value: unknown, allowlist: RendererAllowlist | undefined): RuntimeV2ToolRendererHint | null {
  if (!isRecord(value) || typeof value.id !== "string" || !Number.isSafeInteger(value.schemaVersion) || allowlist === undefined) return null;
  const entry = allowlist.get(value.id);
  if (entry === undefined || entry.schemaVersion !== value.schemaVersion || !isRuntimeJson(value.props) || !entry.validate(value.props)) return null;
  return Object.freeze({ id: entry.id, schemaVersion: entry.schemaVersion, props: redactProjectionValue(value.props) });
}

export function projectFailure(status: "denied" | "aborted" | "failed" | "outcome-unknown", message: string, code?: string): RuntimeV2ToolFailure {
  return Object.freeze({ code: code ?? (status === "outcome-unknown" ? "TOOL_OUTCOME_UNKNOWN" : `TOOL_${status.toUpperCase()}`), message: redactProjectionText(message), retryable: false, outcomeUnknown: status === "outcome-unknown" });
}

function toFailure(result: ToolExecutionResult): RuntimeV2ToolFailure {
  return projectFailure(result.status === "outcome-unknown" ? "outcome-unknown" : "failed", result.failure?.message ?? "Tool outcome is unknown.", result.failure?.code);
}

function toModelOutput(block: ToolModelOutputBlock): RuntimeV2ToolModelOutputBlock {
  if (!isRecord(block)) return Object.freeze({ type: "text", text: "[UNAVAILABLE]" });
  if (block.type === "text" && typeof block.text === "string") return Object.freeze({ type: "text", text: redactProjectionText(block.text) });
  if (block.type === "artifact" && isRecord(block.artifact) && typeof block.artifact.artifactId === "string" && typeof block.artifact.mediaType === "string") return Object.freeze({ type: "artifact-ref", artifactId: block.artifact.artifactId, mimeType: block.artifact.mediaType, alt: redactProjectionText(typeof block.label === "string" ? block.label : block.artifact.artifactId, 160) });
  const value = (block as { readonly value?: unknown }).value;
  return Object.freeze({ type: "text", text: redactProjectionText(JSON.stringify(redactProjectionValue(isRuntimeJson(value) ? value : null)) ?? "null") });
}

function toDetail(block: ToolDetailBlock): RuntimeV2ToolDetailBlock {
  return Object.freeze({ type: "key-value", items: Object.freeze([{ label: redactProjectionText(typeof block.label === "string" ? block.label : "detail", 160), value: redactProjectionText(JSON.stringify(redactProjectionValue(isRuntimeJson(block.value) ? block.value : null)) ?? "null") }]) });
}

function formatValue(value: RuntimeV2JsonValue): string {
  return redactProjectionText(typeof value === "string" ? value : JSON.stringify(redactProjectionValue(value)) ?? "null", 240);
}

function isRedactedValue(value: RuntimeV2JsonValue, key: string): boolean {
  return /authorization|api[-_]?key|secret|password|cookie|token/i.test(key) || value === "[REDACTED]";
}

function isRecord(value: unknown): value is Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeJson(value: unknown): value is RuntimeV2JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isRuntimeJson);
  return isRecord(value) && Object.values(value).every(isRuntimeJson);
}

function duration(startedAt: string, finishedAt: string): number | null {
  const value = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
