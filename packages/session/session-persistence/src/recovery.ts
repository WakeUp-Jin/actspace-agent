import { createHash } from "node:crypto";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionInspection } from "./session-store.js";
import type { SessionEventCandidateV1, SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionHandle } from "./session.js";

export type SessionRecoveryOutcome = "not-started" | "outcome-unknown";
export type SessionRecoveryAccess = "read-write" | "read-only" | "forensic-required";

/** Maps storage inspection to the product recovery posture. */
export function classifySessionRecoveryAccess(inspection: SessionInspection): SessionRecoveryAccess {
  if (inspection.accessState === "corrupt" || inspection.header === null || inspection.validation === null) return "forensic-required";
  if (inspection.integrity !== "complete" || inspection.accessState === "degraded" || inspection.accessState === "browse-only") return "read-only";
  return "read-write";
}

export type SessionRecoveryPlan = {
  readonly repairId: string;
  readonly sourceBoundarySeq: number;
  readonly candidates: readonly SessionEventCandidateV1[];
  readonly resumedTransaction: boolean;
};

export type SessionRecoveryOptions = {
  /**
   * false：只了结没有结果的请求和工具调用，Step 和 Turn 留给调用方按真实原因收尾。
   * 运行中的回合在一条记录写入失败后用它；重新打开会话时用默认值 true。
   */
  readonly closeTurn?: boolean;
};

/**
 * `events` 可以只是日志的一段：没有结果的请求和工具调用只会出现在还开着的 Turn 里，
 * 所以从这个 Turn 的 `turn/start` 读起就够了。
 */
export function planSessionRecovery(events: readonly SessionEventEnvelopeV1[], options: SessionRecoveryOptions = {}): SessionRecoveryPlan | null {
  const closeTurn = options.closeTurn ?? true;
  let openTurnId: string | null = null;
  let openStepId: string | null = null;
  const requests = new Map<string, { headerSeq: number; turnId: string; stepId: string; context: boolean; terminal: boolean }>();
  const tools = new Map<string, { callSeq: number; started: boolean; terminal: boolean }>();
  let activeRepairId: string | null = null;
  const committed = new Set<string>();

  for (const event of events) {
    const data = record(event.data);
    switch (event.type) {
      case "turn/start": openTurnId = string(data.turnId); break;
      case "turn/end": openTurnId = null; break;
      case "step/start": openStepId = string(data.stepId); break;
      case "step/end": openStepId = null; break;
      case "request/header": requests.set(string(data.requestId), { headerSeq: event.seq, turnId: string(data.turnId), stepId: string(data.stepId), context: false, terminal: false }); break;
      case "request/context": {
        const request = requests.get(string(data.requestId));
        if (request) request.context = true;
        break;
      }
      case "llm/retry":
      case "assistant/message": {
        const request = requests.get(string(data.requestId));
        if (request) request.terminal = true;
        break;
      }
      case "tool/call": tools.set(string(data.callId ?? data.toolCallId), { callSeq: event.seq, started: false, terminal: false }); break;
      case "tool-workflow/run-start":
      case "tool-workflow/agent-start":
      case "tool/code-dispatch-start": {
        const tool = tools.get(string(data.callId ?? data.toolCallId));
        if (tool) tool.started = true;
        break;
      }
      case "tool/result":
      case "tool/recovery-outcome": {
        const tool = tools.get(string(data.callId ?? data.toolCallId));
        if (tool) tool.terminal = true;
        break;
      }
      case "recovery/start": activeRepairId = string(data.repairId); break;
      case "recovery/committed": {
        const repairId = string(data.repairId);
        committed.add(repairId);
        if (activeRepairId === repairId) activeRepairId = null;
        break;
      }
      default: break;
    }
  }

  const openRequests = [...requests].filter(([, request]) => !request.terminal);
  const openTools = [...tools].filter(([, tool]) => !tool.terminal);
  const openScope = closeTurn && (openTurnId !== null || openStepId !== null);
  if (!openScope && openRequests.length === 0 && openTools.length === 0 && activeRepairId === null) return null;
  const sourceBoundarySeq = events.at(-1)?.seq ?? -1;
  const repairId = activeRepairId ?? stableRepairId(events);
  if (committed.has(repairId)) return null;
  const candidates: SessionEventCandidateV1[] = [];
  if (activeRepairId === null) {
    candidates.push(coreCandidate("recovery/start", { repairId, sourceBoundarySeq }));
  }
  for (const [requestId, request] of openRequests) {
    // 只写了 header 的请求（context 那条没写进去）先补一条只有 id 的 context：assistant/message 只能了结有 context 的请求。
    if (!request.context) candidates.push(coreCandidate("request/context", { requestId, turnId: request.turnId, stepId: request.stepId, repairId }, [request.headerSeq]));
    candidates.push(coreCandidate("assistant/message", {
      requestId,
      messageId: `recovery-${repairId}-${requestId}`,
      content: "",
      finishReason: "aborted",
      recovery: "outcome-unknown",
      repairId,
    }, [request.headerSeq]));
  }
  for (const [callId, tool] of openTools) {
    const outcome: SessionRecoveryOutcome = tool.started ? "outcome-unknown" : "not-started";
    const sources = [tool.callSeq];
    const content = outcome === "not-started"
      ? "The tool body was not started. Retry only if it is still needed."
      : "The tool body may have run, but no result was durable. Verify external state before retrying.";
    // 节点 recovery-${repairId}-${callId}、isError: true 由 surfaceNode 推出（agent-spec-surface-derived.md §4.2）。
    candidates.push(coreCandidate("tool/recovery-outcome", { callId, repairId, outcome, retryAllowed: outcome === "not-started", content }, sources, { kind: "append" }));
  }
  if (closeTurn && openStepId !== null && openTurnId !== null) candidates.push(coreCandidate("step/end", { turnId: openTurnId, stepId: openStepId, reason: "interrupted", repairId }));
  if (closeTurn && openTurnId !== null) candidates.push(coreCandidate("turn/end", { turnId: openTurnId, reason: "interrupted", repairId }));
  candidates.push(coreCandidate("recovery/committed", { repairId, sourceBoundarySeq }));
  return Object.freeze({ repairId, sourceBoundarySeq, candidates: Object.freeze(candidates), resumedTransaction: activeRepairId !== null });
}

export async function applySessionRecovery(session: SessionHandle): Promise<SessionRecoveryPlan | null> {
  const plan = planSessionRecovery(session.journal.readEvents());
  if (plan === null) return null;
  await session.appendMany(plan.candidates);
  await session.flush();
  return plan;
}

/**
 * 运行中的回合用：一条记录没写进去（超过 1 MiB、带敏感字段名、钩子抛错等）时，这个回合里已经开始的
 * 请求和工具调用没有结果，Step 和 Turn 也就结束不了，会话会一直卡住。这里按恢复事务把它们了结，
 * 调用方接着写 step/end、turn/end。
 *
 * `turnStartSeq` 是这个回合 `turn/start` 的 seq，只读这之后的记录，工作量不随会话长度增长。
 * 没有需要了结的内容时返回 null，不写任何记录。
 */
export async function settleOpenTurnWork(session: SessionHandle, turnStartSeq: number): Promise<SessionRecoveryPlan | null> {
  const plan = planSessionRecovery(session.journal.readEvents(Math.max(0, turnStartSeq)), { closeTurn: false });
  if (plan === null) return null;
  await session.appendMany(plan.candidates);
  return plan;
}


function coreCandidate(
  type: string,
  data: Record<string, RuntimeV2JsonValue>,
  sourceEventSeqs: readonly number[] = [],
  surface: SessionEventCandidateV1["surface"] = null,
): SessionEventCandidateV1 {
  return {
    type,
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data,
    surface,
    provenance: { sourceEventSeqs, contributorIds: ["@actspace/core/recovery"], runtimeSelectionSeq: null },
  };
}

function stableRepairId(events: readonly SessionEventEnvelopeV1[]): string {
  const hash = createHash("sha256").update(JSON.stringify(events.map((event) => [event.seq, event.type]))).digest("hex").slice(0, 24);
  return `repair-${hash}`;
}

function record(value: RuntimeV2JsonValue): Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {};
}

function string(value: RuntimeV2JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}
