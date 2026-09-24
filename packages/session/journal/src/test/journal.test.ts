import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { EventCodecRegistry, type EventCodec } from "../codec-registry.js";
import { CORE_EVENT_TYPES, createCoreCodecRegistry } from "../core-codecs.js";
import type { SessionEventCandidateV1, SessionEventEnvelopeV1 } from "../event-envelope.js";
import { SessionJournal } from "../journal.js";

const source = { ownerPluginId: "@actspace/core" } as const;

function candidate(type: string, data: RuntimeV2JsonValue, extra: Partial<SessionEventCandidateV1> = {}): SessionEventCandidateV1 {
  return { type, eventVersion: 1, source, data, surface: null, ...extra };
}

describe("Session Journal", () => {
  it("keeps the Agent Loop kernel at exactly the 13 DSH core events", () => {
    expect(CORE_EVENT_TYPES).toHaveLength(13);
    expect(CORE_EVENT_TYPES).toEqual([
      "turn/start", "turn/end", "step/start", "step/end", "user/message", "assistant/chunk", "assistant/message",
      "tool/call", "tool/result", "todo/write", "request/header", "request/context", "session/end-seed",
    ]);
  });

  it("accepts a DSH core Turn and rebuilds a deterministic Surface", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-29T12:00:00.000Z" });
    journal.append(candidate("turn/start", { turnId: "turn-1" }));
    journal.append(candidate("step/start", { turnId: "turn-1", stepId: "step-1" }));
    journal.append(candidate("user/message", { messageId: "user-1", content: "hello" }, { surface: { kind: "append", node: { kind: "user", messageId: "user-1", content: "hello" } } }));
    journal.append(candidate("request/header", { requestId: "request-1", turnId: "turn-1", stepId: "step-1" }));
    journal.append(candidate("request/context", { requestId: "request-1", turnId: "turn-1", stepId: "step-1", messages: [{ role: "user", content: "hello" }] }));
    journal.append(candidate("assistant/chunk", { messageId: "assistant-1", requestId: "request-1", chunkIndex: 0, delta: "world" }));
    journal.append(candidate("assistant/message", { messageId: "assistant-1", requestId: "request-1", content: "world", finishReason: "stop" }, { surface: { kind: "append", node: { kind: "assistant", messageId: "assistant-1", content: "world" } } }));
    journal.append(candidate("step/end", { turnId: "turn-1", stepId: "step-1", status: "completed" }));
    journal.append(candidate("turn/end", { turnId: "turn-1", status: "completed" }));

    expect(journal.events.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(journal.surface.entries.map((entry) => entry.node.kind)).toEqual(["user", "assistant"]);
    const reloaded = new SessionJournal({ registry: createCoreCodecRegistry(), seed: journal.events });
    expect(reloaded.surface).toEqual(journal.surface);
  });

  it("does not consume seq or mutate Surface when a candidate is invalid", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-29T12:00:00.000Z" });
    journal.append(candidate("turn/start", { turnId: "turn-1" }));
    journal.append(candidate("step/start", { turnId: "turn-1", stepId: "step-1" }));
    expect(() => journal.append(candidate("turn/end", { turnId: "turn-1" }))).toThrow();
    expect(journal.lastSeq).toBe(1);
    expect(journal.surface.entries).toEqual([]);
    expect(() => journal.append(candidate("user/message", { messageId: "secret", apiKey: "canary" }))).toThrow("forbidden secret field");
    expect(journal.lastSeq).toBe(1);
  });

  it("requires flat name on both tool call and tool result without accepting toolId fallback", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-29T12:00:00.000Z" });
    journal.append(candidate("turn/start", { turnId: "turn-1" }));
    journal.append(candidate("step/start", { turnId: "turn-1", stepId: "step-1" }));
    expect(() => journal.append(candidate("tool/call", { callId: "call-1", toolId: "read_file" }))).toThrow("name");
    journal.append(candidate("tool/call", { callId: "call-1", name: "read_file" }));
    expect(() => journal.append(candidate("tool/result", { callId: "call-1", status: "completed" }))).toThrow("name");
    expect(() => journal.append(candidate("tool/result", { callId: "call-1", name: "plugin/read_file", status: "completed" }))).toThrow("name must match");
    journal.append(candidate("tool/result", { callId: "call-1", name: "read_file", status: "completed" }));
  });

  it("validates permission events strictly and fails closed on a newer required version", () => {
    const registry = createCoreCodecRegistry();
    const journal = new SessionJournal({ registry, now: () => "2026-09-23T12:00:00.000Z" });
    expect(() => journal.append(candidate("permission/mode-set", { mode: "trusted" }))).toThrow("default or full-access");
    expect(() => journal.append(candidate("permission/decided", { requestId: "request-1", kind: "allow", decidedAt: "2026-09-23T12:00:00.000Z" }))).toThrow("once, session or deny");
    expect(() => journal.append(candidate("permission/decided", { requestId: "request-1", kind: "session", suggestionId: "suggestion-1", decidedAt: "2026-09-23T12:00:00.000Z" }))).not.toThrow();

    const newer = {
      recordKind: "event" as const,
      seq: 0,
      type: "permission/mode-set",
      eventVersion: 2,
      criticality: "required" as const,
      time: "2026-09-23T12:00:00.000Z",
      source,
      data: { mode: "default" },
      surface: null,
      provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null },
    } satisfies SessionEventEnvelopeV1;
    expect(new SessionJournal({ registry, seed: [newer] }).validation.accessState).toBe("browse-only");
  });

  it("accepts valid grant facts and rejects unsafe grant shapes", () => {
    const registry = createCoreCodecRegistry();
    const journal = new SessionJournal({ registry, now: () => "2026-09-23T12:00:00.000Z" });
    const grant = {
      schemaVersion: 1,
      grantId: "grant-1",
      sessionId: "session-1",
      agentId: "main:session-1",
      audience: { pluginId: "actspace.core-tools", permissionDomain: "core-files", policyVersion: 1 },
      action: "file.read",
      access: "read",
      selector: { kind: "exact", canonicalPath: "/workspace/src/file.ts" },
      sourceRequestId: "request-1",
      sourceCallId: "call-1",
      sourceToolName: "read_file",
      issuedAt: "2026-09-23T12:00:00.000Z",
    };
    journal.append(candidate("permission/grant-added", grant));
    journal.append(candidate("permission/grant-revoked", { schemaVersion: 1, grantId: "grant-1", sessionId: "session-1", agentId: "main:session-1", revokedAt: "2026-09-23T12:01:00.000Z" }));
    expect(() => journal.append(candidate("permission/grant-added", { ...grant, grantId: "grant-2", access: "write" }))).toThrow("action and access must agree");
    expect(() => journal.append(candidate("permission/grant-added", { ...grant, grantId: "grant-3", selector: { kind: "glob", pattern: "/workspace/**" } }))).toThrow("selector.kind must be exact or subtree");
  });

  it("applies compaction replacement as an append-only transaction", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-29T12:00:00.000Z" });
    journal.append(candidate("user/message", { messageId: "user-1" }, { surface: { kind: "append", node: { kind: "user", messageId: "user-1", content: "one" } } }));
    journal.append(candidate("assistant/message", { messageId: "assistant-1", content: "two" }, { surface: { kind: "append", node: { kind: "assistant", messageId: "assistant-1", content: "two" } } }));
    journal.append(candidate("compaction/start", { compactionId: "compact-1", start: 0, end: 2 }));
    journal.append(candidate("compaction/summary", { compactionId: "compact-1", summaryDigest: "digest" }));
    journal.append(candidate("surface/replaced", { compactionId: "compact-1", sourceEventSeqs: [0, 1] }, {
      provenance: { sourceEventSeqs: [0, 1], contributorIds: ["compactor"], runtimeSelectionSeq: null },
      surface: { kind: "replace", start: 0, end: 2, sourceEventSeqs: [0, 1], node: { kind: "user", messageId: "summary-1", content: "summary" } },
    }));
    journal.append(candidate("compaction/end", { compactionId: "compact-1", summaryDigest: "digest" }));
    expect(journal.events).toHaveLength(6);
    expect(journal.surface.entries).toHaveLength(1);
    expect(journal.surface.entries[0]?.node).toMatchObject({ messageId: "summary-1" });
    expect(journal.surface.replaceGeneration).toBe(1);
  });
});

describe("Event Codec Registry", () => {
  it("produces a stable digest independent of registration order", () => {
    const codecs: EventCodec[] = ["plugin/a/first", "plugin/a/second"].map((type) => ({ type, ownerPluginId: "a", currentVersion: 1, criticality: "required", validate: () => undefined }));
    expect(new EventCodecRegistry(codecs).digest).toBe(new EventCodecRegistry([...codecs].reverse()).digest);
  });

  it("rejects duplicate ownership and broken upgrade chains", () => {
    const registry = new EventCodecRegistry();
    registry.register({ type: "plugin/a/event", ownerPluginId: "a", currentVersion: 1, criticality: "required", validate: () => undefined });
    expect(() => registry.register({ type: "plugin/a/event", ownerPluginId: "a", currentVersion: 1, criticality: "required", validate: () => undefined })).toThrow("Duplicate Event Codec");
    expect(() => new EventCodecRegistry([{ type: "plugin/b/event", ownerPluginId: "b", currentVersion: 3, criticality: "required", upgrades: { 1: (data) => data }, validate: () => undefined }])).toThrow("missing version 2");
  });

  it("maps unknown required and ignorable events to access states", () => {
    const base = { recordKind: "event" as const, seq: 0, eventVersion: 1, time: "2026-08-29T12:00:00.000Z", source: { ownerPluginId: "missing" }, data: {}, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
    const required = { ...base, type: "plugin/missing/state", criticality: "required" as const } satisfies SessionEventEnvelopeV1;
    const ignorable = { ...base, type: "plugin/missing/info", criticality: "ignorable" as const } satisfies SessionEventEnvelopeV1;
    expect(new SessionJournal({ registry: createCoreCodecRegistry(), seed: [required] }).validation.accessState).toBe("browse-only");
    expect(new SessionJournal({ registry: createCoreCodecRegistry(), seed: [ignorable] }).validation.accessState).toBe("degraded");
  });
});
