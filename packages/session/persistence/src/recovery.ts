import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { EventCodecRegistry } from "@actspace/session-journal";
import type { SessionEventCandidateV1, SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { SessionError } from "@actspace/session-journal";
import type { SessionInspection } from "@actspace/session-jsonl";
import { encodeRows } from "@actspace/session-jsonl";
import { SessionJournal } from "@actspace/session-journal";
import type { SessionHandle } from "./session.js";
import { SessionWriterLease } from "./writer-lease.js";

export type SessionRecoveryOutcome = "not-started" | "outcome-unknown";

export type SessionRecoveryPlan = {
  readonly repairId: string;
  readonly sourceBoundarySeq: number;
  readonly candidates: readonly SessionEventCandidateV1[];
  readonly resumedTransaction: boolean;
};

export function planSessionRecovery(events: readonly SessionEventEnvelopeV1[]): SessionRecoveryPlan | null {
  let openTurnId: string | null = null;
  let openStepId: string | null = null;
  const requests = new Map<string, { headerSeq: number; context: boolean; terminal: boolean }>();
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
      case "request/header": requests.set(string(data.requestId), { headerSeq: event.seq, context: false, terminal: false }); break;
      case "request/context": {
        const request = requests.get(string(data.requestId));
        if (request) request.context = true;
        break;
      }
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
  if (openTurnId === null && openStepId === null && openRequests.length === 0 && openTools.length === 0 && activeRepairId === null) return null;
  const sourceBoundarySeq = events.length - 1;
  const repairId = activeRepairId ?? stableRepairId(events);
  if (committed.has(repairId)) return null;
  const candidates: SessionEventCandidateV1[] = [];
  if (activeRepairId === null) {
    candidates.push(coreCandidate("recovery/start", { repairId, sourceBoundarySeq }));
  }
  for (const [requestId, request] of openRequests) {
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
    candidates.push(coreCandidate("tool/recovery-outcome", { callId, repairId, outcome, retryAllowed: outcome === "not-started" }, sources, {
      kind: "append",
      node: {
        kind: "tool-result",
        messageId: `recovery-${repairId}-${callId}`,
        callId,
        isError: true,
        content: outcome === "not-started"
          ? "The tool body was not started. Retry only if it is still needed."
          : "The tool body may have run, but no result was durable. Verify external state before retrying.",
      },
    }));
  }
  if (openStepId !== null && openTurnId !== null) candidates.push(coreCandidate("step/end", { turnId: openTurnId, stepId: openStepId, reason: "interrupted", repairId }));
  if (openTurnId !== null) candidates.push(coreCandidate("turn/end", { turnId: openTurnId, reason: "interrupted", repairId }));
  candidates.push(coreCandidate("recovery/committed", { repairId, sourceBoundarySeq }));
  return Object.freeze({ repairId, sourceBoundarySeq, candidates: Object.freeze(candidates), resumedTransaction: activeRepairId !== null });
}

export async function applySessionRecovery(session: SessionHandle): Promise<SessionRecoveryPlan | null> {
  const plan = planSessionRecovery(session.journal.events);
  if (plan === null) return null;
  await session.appendMany(plan.candidates);
  await session.flush();
  return plan;
}

export async function repairTornJsonlSession(options: {
  readonly inspection: SessionInspection;
  readonly registry: EventCodecRegistry;
  readonly runtimeId: string;
}): Promise<{ readonly repairId: string | null; readonly forensicPath: string }> {
  const { inspection } = options;
  if (inspection.header === null || inspection.tornTail === null || inspection.validation === null) {
    throw new SessionError("SESSION_CORRUPT", "Only a validated prefix with a torn final line can use torn-tail repair.");
  }
  const sessionDir = dirname(inspection.journalPath);
  const recoveryDir = join(sessionDir, "recovery");
  await mkdir(recoveryDir, { recursive: true });
  const lease = await SessionWriterLease.acquire({ sessionDir, sessionId: inspection.header.sessionId, runtimeId: options.runtimeId });
  const digest = createHash("sha256").update(inspection.rawBytes).digest("hex");
  const forensicPath = join(recoveryDir, `${digest}.journal.jsonl`);
  const temporaryPath = join(sessionDir, `.repair-${randomUUID()}.tmp`);
  try {
    await copyFile(inspection.journalPath, forensicPath);
    await syncFile(forensicPath);
    const journal = new SessionJournal({ registry: options.registry, seed: inspection.events, now: () => new Date().toISOString() });
    const plan = planSessionRecovery(journal.events);
    if (plan !== null) journal.appendMany(plan.candidates);
    const temporary = await open(temporaryPath, "wx", 0o600);
    try {
      await temporary.writeFile(encodeRows([inspection.header, ...journal.events]));
      await temporary.sync();
    } finally {
      await temporary.close();
    }
    await rename(temporaryPath, inspection.journalPath);
    await syncDirectory(sessionDir);
    return Object.freeze({ repairId: plan?.repairId ?? null, forensicPath });
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    await lease.dispose();
  }
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

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}
