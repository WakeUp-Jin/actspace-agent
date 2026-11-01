import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { createCoreCodecRegistry, SessionJournal, type SessionEventCandidateV1 } from "../index.js";

const identity = { sessionId: "session", agentRunId: "run", turnId: "turn", stepId: "step", callId: "call", logicalRequestId: "logical", attemptId: "attempt", attempt: 1, purpose: "image-inspection", routeId: "vision-route", model: "vision-model" };
const startedAt = "2026-10-23T00:00:00.000Z";
const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, cost: null, costCurrency: null, source: "provider-reported" };
const start = { ...identity, startedAt };
const end = { ...start, finishedAt: "2026-10-23T00:00:01.000Z", status: "completed", usage };
function event(type: string, data: RuntimeV2JsonValue): SessionEventCandidateV1 { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null }; }
function setup() {
  const journal = new SessionJournal({ registry: createCoreCodecRegistry() });
  journal.append(event("turn/start", { turnId: "turn" }));
  journal.append(event("step/start", { turnId: "turn", stepId: "step" }));
  journal.append(event("tool/call", { callId: "call", name: "inspect_image" }));
  return journal;
}

describe("auxiliary model request facts", () => {
  it("persists independent required facts without adding a conversation or Context surface", () => {
    const journal = setup();
    journal.append(event("llm/auxiliary-start", start));
    journal.append(event("llm/auxiliary-end", end));
    journal.append(event("tool/result", { callId: "call", name: "inspect_image", status: "completed" }));
    journal.append(event("step/end", { turnId: "turn", stepId: "step" }));
    journal.append(event("turn/end", { turnId: "turn" }));
    const replay = new SessionJournal({ registry: createCoreCodecRegistry(), seed: journal.events });
    expect(replay.validation.accessState).toBe("read-write");
    expect(replay.surface.entries).toEqual([]);
    expect(replay.events.filter(item => item.type.startsWith("llm/auxiliary-")).map(item => item.criticality)).toEqual(["required", "required"]);
  });

  it.each(["stepId", "turnId", "callId"])("requires the active parent %s", field => {
    const journal = setup();
    expect(() => journal.append(event("llm/auxiliary-start", { ...start, [field]: "other" }))).toThrow();
    expect(journal.lastSeq).toBe(2);
    journal.append(event("llm/auxiliary-start", start));
  });

  it("rejects missing, repeated or mismatched terminal facts atomically", () => {
    const journal = setup();
    expect(() => journal.append(event("llm/auxiliary-end", end))).toThrow();
    journal.append(event("llm/auxiliary-start", start));
    expect(() => journal.append(event("llm/auxiliary-start", start))).toThrow();
    for (const field of ["sessionId", "agentRunId", "logicalRequestId", "attempt", "model", "routeId", "startedAt"]) {
      expect(() => journal.append(event("llm/auxiliary-end", { ...end, [field]: field === "attempt" ? 2 : "different" }))).toThrow();
    }
    journal.append(event("llm/auxiliary-end", end));
    expect(() => journal.append(event("llm/auxiliary-end", end))).toThrow();
    expect(journal.lastSeq).toBe(4);
  });

  it.each([{}, { ...usage, inputTokens: -1 }, { ...usage, outputTokens: "20" }, { ...usage, source: "made-up" }])("rejects malformed nullable usage %j", badUsage => {
    const journal = setup();
    journal.append(event("llm/auxiliary-start", start));
    expect(() => journal.append(event("llm/auxiliary-end", { ...end, usage: badUsage }))).toThrow();
    journal.append(event("llm/auxiliary-end", end));
  });

  it("requires an auxiliary terminal before the normal parent tool result", () => {
    const journal = setup();
    journal.append(event("llm/auxiliary-start", start));
    expect(() => journal.append(event("tool/result", { callId: "call", name: "inspect_image", status: "completed" }))).toThrow();
    journal.append(event("llm/auxiliary-end", { ...end, status: "aborted", usage: { ...usage, inputTokens: null, outputTokens: 0 } }));
    journal.append(event("tool/result", { callId: "call", name: "inspect_image", status: "failed" }));
  });

  it("keeps an interrupted attempt unknown on replay without inventing a terminal", () => {
    const journal = setup();
    journal.append(event("llm/auxiliary-start", start));
    const replay = new SessionJournal({ registry: createCoreCodecRegistry(), seed: journal.events });
    expect(replay.validation.accessState).toBe("read-write");
    expect(replay.events.filter(item => item.type === "llm/auxiliary-end")).toEqual([]);
    expect(replay.validation.relations.openToolCallIds).toEqual(["call"]);
  });
});

it("allows a Session-owned title to finish after the main Turn without fake parent IDs", () => {
  const journal = new SessionJournal({ registry: createCoreCodecRegistry() });
  const title = { sessionId: "session", logicalRequestId: "title", attemptId: "title-1", attempt: 1, purpose: "session-title", routeId: "utility", model: "title-model", startedAt };
  journal.append(event("llm/auxiliary-start", title));
  journal.append(event("turn/start", { turnId: "t" }));
  journal.append(event("turn/end", { turnId: "t" }));
  journal.append(event("llm/auxiliary-end", { ...title, finishedAt: startedAt, status: "completed", usage }));
  const replay = new SessionJournal({ registry: createCoreCodecRegistry(), seed: journal.events });
  expect(replay.validation.accessState).toBe("read-write");
  expect(replay.surface.entries).toEqual([]);
});

it.each([undefined, "turn"])("persists compaction with only its actual optional Turn (%s)", turnId => {
  const journal = new SessionJournal({ registry: createCoreCodecRegistry() });
  if (turnId) journal.append(event("turn/start", { turnId }));
  const compact = { sessionId: "session", logicalRequestId: "compact", attemptId: "compact-1", attempt: 1, purpose: "compaction", routeId: "utility", model: "compact-model", startedAt, ...(turnId ? { turnId } : {}) };
  journal.append(event("llm/auxiliary-start", compact));
  journal.append(event("llm/auxiliary-end", { ...compact, finishedAt: startedAt, status: "completed", usage }));
  if (turnId) journal.append(event("turn/end", { turnId }));
  const replay = new SessionJournal({ registry: createCoreCodecRegistry(), seed: journal.events });
  expect(replay.validation.accessState).toBe("read-write");
  expect(replay.surface.entries).toEqual([]);
});

it.each(["session-title", "compaction"])("rejects fabricated parents for %s", purpose => {
  for (const field of ["agentRunId", "stepId", "callId", ...(purpose === "session-title" ? ["turnId"] : [])]) {
    const journal = setup();
    const background = { sessionId: "session", logicalRequestId: "background", attemptId: "background-1", attempt: 1, purpose, routeId: "utility", model: "model", startedAt };
    expect(() => journal.append(event("llm/auxiliary-start", { ...background, [field]: "invented" }))).toThrow("not owned");
    expect(journal.lastSeq).toBe(2);
  }
});

it("rejects compaction for a foreign Turn and auto-review without its active tool owner", () => {
  const journal = setup();
  const compact = { sessionId: "session", logicalRequestId: "compact", attemptId: "compact-1", attempt: 1, purpose: "compaction", routeId: "utility", model: "model", startedAt, turnId: "other" };
  expect(() => journal.append(event("llm/auxiliary-start", compact))).toThrow("active Turn");
  expect(() => journal.append(event("llm/auxiliary-start", { ...start, purpose: "auto-review", callId: "other" }))).toThrow("active parent");
  journal.append(event("llm/auxiliary-start", { ...start, purpose: "auto-review" }));
  journal.append(event("llm/auxiliary-end", { ...end, purpose: "auto-review" }));
});
