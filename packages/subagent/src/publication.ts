import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionEventCandidateV1, SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionInspection } from "@actspace/session-jsonl";
import type { SessionHandle } from "@actspace/session-persistence";
import type { SessionStore } from "@actspace/session-persistence";
import type { SubagentTerminalResult } from "./terminal-result.js";

const CHILD_TERMINAL = "delegation/child-terminal";

export async function publishSubagentTerminal(session: SessionHandle, result: SubagentTerminalResult): Promise<void> {
  const lineage = session.header.lineage;
  if (lineage?.origin !== "delegation" || lineage.parentCallId === undefined) throw new Error("Subagent terminal publication requires delegation lineage.");
  await session.append(core(CHILD_TERMINAL, terminalData(result, lineage.parentSessionId, lineage.parentCallId)));
  await session.flush();
}

export async function repairSubagentPublications(options: {
  readonly store: SessionStore;
  readonly parent: SessionHandle;
}): Promise<{ readonly repairedLinks: number; readonly repairedToolResults: number }> {
  const terminals: Array<{ readonly inspection: SessionInspection; readonly event: SessionEventEnvelopeV1; readonly data: ChildTerminalData }> = [];
  for (const sessionId of await options.store.listSessionIds()) {
    if (sessionId === options.parent.header.sessionId) continue;
    const inspection = await options.store.inspect(sessionId).catch(() => null);
    if (inspection?.header?.lineage?.origin !== "delegation" || inspection.header.lineage.parentSessionId !== options.parent.header.sessionId) continue;
    if (inspection.validation === null || inspection.tornTail !== null || (inspection.accessState !== "read-write" && inspection.accessState !== "degraded")) continue;
    const event = [...inspection.events].reverse().find((candidate) => candidate.type === CHILD_TERMINAL);
    if (event === undefined) continue;
    const data = decodeTerminal(event.data);
    if (data.childSessionId !== sessionId || data.parentSessionId !== options.parent.header.sessionId || data.parentCallId !== inspection.header.lineage.parentCallId) continue;
    const requested = options.parent.journal.events.some((candidate) => {
      if (candidate.type !== "delegation/requested") return false;
      const request = record(candidate.data);
      return string(request.invocationId) === data.invocationId && string(request.parentCallId) === data.parentCallId && string(request.presetId) === data.presetId;
    });
    if (!requested) continue;
    terminals.push({ inspection, event, data });
  }

  const callOrder = new Map(options.parent.journal.events.filter((event) => event.type === "tool/call").map((event, index) => [string(record(event.data).callId), index]));
  terminals.sort((left, right) => (callOrder.get(left.data.parentCallId) ?? Number.MAX_SAFE_INTEGER) - (callOrder.get(right.data.parentCallId) ?? Number.MAX_SAFE_INTEGER));
  let repairedLinks = 0;
  let repairedToolResults = 0;
  for (const terminal of terminals) {
    const events = options.parent.journal.events;
    const linked = events.some((event) => event.type === "delegation/completed" && string(record(event.data).childSessionId) === terminal.data.childSessionId);
    const toolTerminal = events.some((event) => TOOL_TERMINALS.has(event.type) && string(record(event.data).callId) === terminal.data.parentCallId);
    const candidates: SessionEventCandidateV1[] = [];
    if (!linked) {
      candidates.push(core("delegation/completed", {
        invocationId: terminal.data.invocationId,
        childSessionId: terminal.data.childSessionId,
        childTerminalSeq: terminal.event.seq,
        presetId: terminal.data.presetId,
        status: terminal.data.status,
        recovered: true,
      }));
    }
    if (!toolTerminal && canCommitToolResult(events, terminal.data.parentCallId)) {
      const parentCall = events.find((event) => event.type === "tool/call" && string(record(event.data).callId) === terminal.data.parentCallId);
      const parentCallData = parentCall === undefined ? {} : record(parentCall.data);
      const name = string(parentCallData.name);
      if (name === null) continue;
      const failed = terminal.data.status !== "completed";
      const content = failed ? terminal.data.failure?.message ?? `Subagent ended with ${terminal.data.status}.` : terminal.data.text;
      candidates.push(core("tool/result", {
        callId: terminal.data.parentCallId,
        pluginId: string(parentCallData.pluginId) ?? "actspace.subagent",
        name,
        status: terminal.data.status,
        summary: failed ? "Subagent failed" : "Subagent completed",
        childSessionId: terminal.data.childSessionId,
        recovered: true,
      }, [], {
        kind: "append",
        node: {
          kind: "tool-result",
          messageId: `delegation-${terminal.data.childSessionId}`,
          callId: terminal.data.parentCallId,
          content,
          isError: failed,
        },
      }));
    }
    if (candidates.length === 0) continue;
    await options.parent.appendMany(candidates);
    await options.parent.flush();
    if (!linked) repairedLinks += 1;
    if (!toolTerminal && candidates.some((candidate) => candidate.type === "tool/result")) repairedToolResults += 1;
  }
  return Object.freeze({ repairedLinks, repairedToolResults });
}

type ChildTerminalData = {
  readonly invocationId: string;
  readonly childAgentId: string;
  readonly childSessionId: string;
  readonly parentSessionId: string;
  readonly parentCallId: string;
  readonly presetId: string;
  readonly status: SubagentTerminalResult["status"];
  readonly text: string;
  readonly durationMs: number;
  readonly usage: RuntimeV2JsonValue;
  readonly toolUseCount: number;
  readonly artifacts: RuntimeV2JsonValue;
  readonly failure: SubagentTerminalResult["failure"];
};

const TOOL_TERMINALS = new Set(["tool/result", "tool/recovery-outcome"]);

function canCommitToolResult(events: readonly SessionEventEnvelopeV1[], callId: string): boolean {
  const calls = new Map<string, { readonly dispatched: boolean; terminal: boolean }>();
  for (const event of events) {
    const current = string(record(event.data).callId);
    if (event.type === "tool/call") calls.set(current, { dispatched: false, terminal: false });
    else if (event.type === "tool-workflow/run-start" || event.type === "tool-workflow/agent-start" || event.type === "tool/code-dispatch-start") {
      const prior = calls.get(current);
      if (prior !== undefined) calls.set(current, { ...prior, dispatched: true });
    } else if (TOOL_TERMINALS.has(event.type)) {
      const prior = calls.get(current);
      if (prior !== undefined) prior.terminal = true;
    }
  }
  const open = [...calls].filter(([, value]) => !value.terminal);
  return open[0]?.[0] === callId && open[0]?.[1].dispatched === true;
}

function terminalData(result: SubagentTerminalResult, parentSessionId: string, parentCallId: string): ChildTerminalData {
  return {
    invocationId: result.invocationId,
    childAgentId: result.childAgentId,
    childSessionId: result.childSessionId,
    parentSessionId,
    parentCallId,
    presetId: result.presetId,
    status: result.status,
    text: result.text,
    durationMs: result.durationMs,
    usage: result.usage as RuntimeV2JsonValue,
    toolUseCount: result.toolUseCount,
    artifacts: result.artifacts as RuntimeV2JsonValue,
    failure: result.failure,
  };
}

function decodeTerminal(value: RuntimeV2JsonValue): ChildTerminalData {
  const data = record(value);
  return {
    invocationId: string(data.invocationId),
    childAgentId: string(data.childAgentId),
    childSessionId: string(data.childSessionId),
    parentSessionId: string(data.parentSessionId),
    parentCallId: string(data.parentCallId),
    presetId: string(data.presetId),
    status: status(data.status),
    text: string(data.text),
    durationMs: typeof data.durationMs === "number" ? data.durationMs : 0,
    usage: data.usage ?? null,
    toolUseCount: typeof data.toolUseCount === "number" ? data.toolUseCount : 0,
    artifacts: data.artifacts ?? [],
    failure: failure(data.failure),
  };
}

function core(type: string, data: RuntimeV2JsonValue, sourceEventSeqs: readonly number[] = [], surface: SessionEventCandidateV1["surface"] = null): SessionEventCandidateV1 {
  return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface, provenance: { sourceEventSeqs, contributorIds: ["@actspace/core/subagent-publication"], runtimeSelectionSeq: null } };
}

function record(value: RuntimeV2JsonValue): Readonly<Record<string, RuntimeV2JsonValue>> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {}; }
function string(value: RuntimeV2JsonValue | undefined): string { return typeof value === "string" ? value : ""; }
function status(value: RuntimeV2JsonValue | undefined): SubagentTerminalResult["status"] { return ["completed", "failed", "denied", "aborted", "outcome-unknown"].includes(String(value)) ? value as SubagentTerminalResult["status"] : "failed"; }
function failure(value: RuntimeV2JsonValue | undefined): SubagentTerminalResult["failure"] { const item = record(value ?? null); return typeof item.code === "string" && typeof item.message === "string" && typeof item.retryable === "boolean" ? { code: item.code, message: item.message, retryable: item.retryable } : null; }
