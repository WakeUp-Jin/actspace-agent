import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, SessionJournal, type SessionEventCandidateV1 } from "../index.js";
const core = (type: string, data: Record<string, unknown>): SessionEventCandidateV1 => ({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: data as never, surface: null });

describe("incremental Journal", () => {
  it("validates only newly appended events across a 100,000-event prefix", () => {
    let validations = 0;
    const registry = createCoreCodecRegistry([{ type: "plugin/test/value", ownerPluginId: "test", currentVersion: 1, criticality: "ignorable", validate: () => { validations++; } }]);
    const journal = new SessionJournal({ registry });
    const candidate = { type: "plugin/test/value", eventVersion: 1, source: { ownerPluginId: "test" }, data: {}, surface: null } as const;
    for (let index = 0; index < 100_000; index++) journal.append(candidate);
    expect(validations).toBe(100_000);
    expect(journal.lastSeq).toBe(99_999);
    journal.append(candidate);
    expect(validations).toBe(100_001);
  }, 30_000);

  it("rolls a failed batch back including seen IDs and partial request changes", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry() });
    journal.appendMany([core("turn/start", { turnId: "t" }), core("step/start", { turnId: "t", stepId: "s" })]);
    const header = core("request/header", { turnId: "t", stepId: "s", requestId: "r" });
    expect(() => journal.appendMany([header, core("step/end", { stepId: "s" })])).toThrow();
    expect(journal.lastSeq).toBe(1);
    expect(journal.validation.relations.openRequestIds).toEqual([]);
    journal.append(header);
    expect(journal.validation.relations.openRequestIds).toEqual(["r"]);
    expect(() => journal.appendMany([core("request/context", { turnId: "t", stepId: "s", requestId: "r" }), core("step/end", { stepId: "s" })])).toThrow();
    journal.append(core("request/context", { turnId: "t", stepId: "s", requestId: "r" }));
  });

  it("undoes relation mutations when Surface validation fails", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry() });
    journal.appendMany([core("turn/start", { turnId: "t" }), core("step/start", { turnId: "t", stepId: "s" }), core("tool/call", { callId: "c", name: "read_file" })]);
    const result = core("tool/result", { callId: "c", name: "read_file", status: "completed" });
    expect(() => journal.append({ ...result, surface: { kind: "append", node: { kind: "user", messageId: "wrong", content: "bad" } } })).toThrow();
    expect(journal.validation.relations.openToolCallIds).toEqual(["c"]);
    journal.append(result);
    expect(journal.validation.relations.openToolCallIds).toEqual([]);
  });

  it("does not evict unpersisted events and never presents a suffix as full history", () => {
    const archived: ReturnType<SessionJournal["readEvents"]>[number][] = [];
    const journal = new SessionJournal({ registry: createCoreCodecRegistry(), history: { readEvents: (a, b) => archived.slice(a, b) }, retainedEvents: 2 });
    for (let i = 0; i < 6; i++) journal.append(core("session/title-set", { title: String(i) }));
    archived.push(...journal.readEvents(0, 3));
    journal.releaseDurable(2);
    expect(journal.retainedEventCount).toBe(3);
    expect(journal.readEvents().map(event => event.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(journal.eventsAfter(3).map(event => event.seq)).toEqual([4, 5]);
    expect(journal.latestEvent("session/title-set")?.seq).toBe(5);
    expect(journal.latestEvent("session/title-set", 1)?.seq).toBe(1);
  });
});

it("keeps an unfinished compaction pending after its durable start leaves the recent window", async () => {
  const { createCompactionTransaction } = await import("../compaction.js");
  const history: import("../event-envelope.js").SessionEventEnvelopeV1[] = [];
  const journal = new SessionJournal({ registry: createCoreCodecRegistry(), retainedEvents: 1, history: { readEvents: (a, b) => history.slice(a, b) } });
  journal.append({ ...core("user/message", { messageId: "m" }), surface: { kind: "append", node: { kind: "user", messageId: "m", content: "old" } } });
  const transaction = createCompactionTransaction({ surface: journal.surface, start: 0, end: 1, summary: { kind: "assistant", messageId: "summary", content: "summary" }, compactionId: "c", contributorIds: [], summaryDigest: "digest" });
  journal.appendMany(transaction.slice(0, -1));
  history.push(...journal.readEvents()); journal.releaseDurable(journal.lastSeq);
  expect(journal.retainedEventCount).toBe(1);
  expect(journal.surface.entries[0]?.node.messageId).toBe("m");
  journal.append(transaction.at(-1)!);
  expect(journal.surface.entries[0]?.node.messageId).toBe("summary");
  const reloaded = new SessionJournal({ registry: createCoreCodecRegistry(), seed: journal.readEvents() });
  expect(reloaded.surface).toEqual(journal.surface);
  expect(reloaded.validation).toEqual(journal.validation);
});
