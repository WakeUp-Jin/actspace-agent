import { projectContextState } from "@actspace/shared";
import { mainAgentFormFromPresetId, type RuntimeV2JsonValue, type RuntimeV2SessionSnapshot, type RuntimeV2ToolView } from "@actspace/shared/runtime-v2";
import { SessionSurface, type SessionSurfaceView, type EventCodecRegistry, type SessionEventEnvelopeV1, type SessionHeaderV1 } from "@actspace/session-journal";
import { registerSessionFacts, sessionFacts, SessionProjectionRegistry } from "@actspace/session-projection";
import { createRunningToolView, completeToolView, projectRendererHint, type RendererAllowlist } from "./tool-dto.js";
import { redactProjectionText } from "./redaction.js";

type ContextInput = { surface: SessionSurfaceView; events: SessionEventEnvelopeV1[]; activeTurnId: string | null; throughJournalSeq: number; updatedAt: string };
export class SessionReadModel {
  readonly projections: SessionProjectionRegistry;
  constructor(readonly header: SessionHeaderV1, readonly codecs: EventCodecRegistry, readonly rendererAllowlist?: RendererAllowlist) {
    this.projections = new SessionProjectionRegistry(event => codecs.resolve(event).kind === "known");
    registerSessionFacts(this.projections, redactProjectionText);
    this.projections.register<SessionSurfaceView>({
      key: "surface", stateVersion: 1, init: () => ({ entries: [], replaceGeneration: 0 }), view: state => state,
      apply: (state, event) => {
        if (!event.surface) return state;
        const surface = SessionSurface.fromView(state);
        surface.apply(event);
        return surface.view;
      },
    });
    this.projections.register<readonly RuntimeV2ToolView[]>({
      key: "tools", stateVersion: 1, init: () => [], view: state => state,
      apply: (state, event) => applyTool(state, header.sessionId, event, rendererAllowlist),
    });
    this.projections.register<string | null>({
      key: "workspaceRoot", stateVersion: 1, init: () => header.cwd ?? null, view: state => state,
      apply: (state, event) => event.type === "session/workspace-set" && isRecord(event.data) && typeof event.data.workspaceRoot === "string" && event.data.workspaceRoot.trim() ? event.data.workspaceRoot : state,
    });
    this.projections.register<string>({
      key: "updatedAt", stateVersion: 1, init: () => header.createdAt, view: state => state,
      apply: (_, event) => event.time,
    });
    this.projections.register<ContextInput>({
      key: "requestContext", stateVersion: 1,
      init: () => ({ surface: { entries: [], replaceGeneration: 0 }, events: [], activeTurnId: null, throughJournalSeq: -1, updatedAt: header.createdAt }),
      apply: (state, event) => {
        let surface = state.surface;
        if (event.surface) { const next = SessionSurface.fromView(surface); next.apply(event); surface = next.view; }
        let events = state.events;
        if (["request/header", "request/context", "compaction/end"].includes(event.type)) events = [...events.filter(previous => previous.type !== event.type), event];
        if (event.type === "surface/replaced") events = [...events, event];
        const activeTurnId = event.type === "turn/start" && isRecord(event.data) ? stringValue(event.data.turnId) : event.type === "turn/end" ? null : state.activeTurnId;
        return { surface, events, activeTurnId, throughJournalSeq: event.seq, updatedAt: event.time };
      },
      view: state => JSON.parse(JSON.stringify(projectContextState({
        sessionId: header.sessionId, throughJournalSeq: state.throughJournalSeq, updatedAt: state.updatedAt,
        activity: { activeTurnId: state.activeTurnId }, messages: state.surface.entries.map(entry => entry.node),
      }, state.events))),
    });
    this.projections.ensureSession(header.sessionId);
  }

  replay(events: readonly SessionEventEnvelopeV1[]): this { this.projections.sync(this.header.sessionId, events); return this; }
  apply(event: SessionEventEnvelopeV1) { return this.projections.apply(this.header.sessionId, event); }

  snapshot(accessState: RuntimeV2SessionSnapshot["accessState"] = "read-write"): RuntimeV2SessionSnapshot {
    const projection = this.projections.snapshot(this.header.sessionId);
    const values = projection.values;
    const surface = values.surface as SessionSurfaceView;
    return {
      kind: "session-snapshot", schemaVersion: 1, sessionId: this.header.sessionId,
      createdAt: this.header.createdAt, updatedAt: values.updatedAt as string,
      workspaceRoot: values.workspaceRoot as string | null, agentForm: mainAgentFormFromPresetId(this.header.createdWith.presetId), throughJournalSeq: projection.throughJournalSeq, accessState,
      ...sessionFacts(this.projections, this.header.sessionId),
      messages: surface.entries.map(entry => ({ kind: entry.node.kind, messageId: entry.node.messageId, content: entry.node.content, ...(entry.node.kind === "tool-result" ? { callId: entry.node.callId } : {}) })),
      tools: values.tools as readonly RuntimeV2ToolView[], lineage: this.header.lineage as RuntimeV2JsonValue | null,
    };
  }
}

function applyTool(state: readonly RuntimeV2ToolView[], sessionId: string, event: SessionEventEnvelopeV1, allowlist: RendererAllowlist | undefined): readonly RuntimeV2ToolView[] {
  if (!isRecord(event.data)) return state;
  const data = event.data; const callId = stringValue(data.callId);
  if (!callId) return state;
  if (event.type === "tool/call") {
    const tool = createRunningToolView({ sessionId, callId, agentRunId: stringValue(data.agentRunId) ?? "unknown", turnId: stringValue(data.turnId) ?? "unknown", stepId: stringValue(data.stepId) ?? "unknown", pluginId: stringValue(data.pluginId) ?? event.source.ownerPluginId, name: stringValue(data.name) ?? "unknown" }, event, data.args ?? {}, projectRendererHint(data.renderer, allowlist));
    return [...state.filter(item => item.callId !== callId), tool].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.callId.localeCompare(b.callId));
  }
  const previous = state.find(item => item.callId === callId);
  if (!previous) return state;
  let next = previous;
  if (["tool-workflow/run-start", "tool-workflow/agent-start", "tool/code-dispatch-start"].includes(event.type)) next = { ...previous, phase: "executing" };
  if (["tool/result", "tool/recovery-outcome"].includes(event.type)) next = completeFromEvent(previous, event, allowlist);
  return next === previous ? state : state.map(item => item.callId === callId ? next : item);
}

function completeFromEvent(previous: RuntimeV2ToolView, event: SessionEventEnvelopeV1, rendererAllowlist: RendererAllowlist | undefined): RuntimeV2ToolView {
  const data = isRecord(event.data) ? event.data : {};
  const rawStatus = stringValue(data.status);
  const status = rawStatus === "failed" || rawStatus === "denied" || rawStatus === "aborted" || rawStatus === "outcome-unknown" || rawStatus === "completed"
    ? rawStatus
    : event.type === "tool/result" ? "completed" : "outcome-unknown";
  const result = {
    status,
    callId: previous.callId,
    pluginId: previous.pluginId,
    name: previous.name,
    registrationId: "journal",
    definitionVersion: 1,
    definitionDigest: "journal",
    summary: stringValue(data.summary) ?? (status === "completed" ? "Tool completed." : `Tool ${status}.`),
    modelOutput: Array.isArray(data.modelOutput) ? data.modelOutput : [],
    detail: Array.isArray(data.detail) ? data.detail : [],
    artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
    failure: isRecord(data.failure) ? {
      code: stringValue(data.failure.code) ?? "TOOL_FAILURE",
      message: stringValue(data.failure.message) ?? "Tool failed.",
      retryable: data.failure.retryable === true,
      phase: "body" as const,
    } : status === "outcome-unknown" ? { code: "TOOL_OUTCOME_UNKNOWN", message: "Tool outcome is unknown.", retryable: false, phase: "body" as const } : undefined,
    finalizerFailures: [],
    dispatched: true,
  } as const;
  return completeToolView(previous, result, event.time, projectRendererHint(data.renderer, rendererAllowlist));
}

function isRecord(value: RuntimeV2JsonValue | undefined): value is Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: RuntimeV2JsonValue | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? redactProjectionText(value, 240) : null;
}
