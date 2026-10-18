import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from "@actspace/session-journal";
import { SessionProjectionRegistry } from "../registry.js";
import { registerSessionFacts } from "../facts.js";

const source = { ownerPluginId: "@actspace/core" } as const;

function fixture() {
  const codecs = createCoreCodecRegistry();
  const header = createSessionHeader({ sessionId: "todos", createdAt: "2026-09-22T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: codecs.digest } });
  const journal = new SessionJournal({ registry: codecs, now: (() => { let i = 0; return () => `2026-09-22T00:00:0${i++}.000Z`; })() });
  return { header, journal };
}

describe("Session facts", () => {
  it("folds model timing from the full journal and keeps per-step scratch out of the view", () => {
    const codecs = createCoreCodecRegistry();
    const seconds = [0, 0, 1, 1, 3, 4, 5, 9, 9, 10, 12];
    const journal = new SessionJournal({ registry: codecs, now: (() => { let i = 0; return () => new Date(Date.UTC(2026, 9, 15, 0, 0, seconds[i++]!)).toISOString(); })() });
    const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value);
    const append = (type: string, data: Record<string, unknown>) => registry.apply("timing", journal.append({ type, eventVersion: 1, source, data: data as never, surface: null }));
    append("turn/start", { turnId: "t" });
    append("step/start", { turnId: "t", stepId: "a" });
    append("request/header", { turnId: "t", stepId: "a", requestId: "r1" });
    append("request/context", { turnId: "t", stepId: "a", requestId: "r1" });
    append("assistant/chunk", { turnId: "t", stepId: "a", requestId: "r1", messageId: "m1", chunkIndex: 0, content: "" });
    append("assistant/chunk", { turnId: "t", stepId: "a", requestId: "r1", messageId: "m1", chunkIndex: 1, content: "hi" });
    // 首 token 之后的 chunk 不改状态，流式时不会逐条推送投影。
    expect(append("assistant/chunk", { turnId: "t", stepId: "a", requestId: "r1", messageId: "m1", chunkIndex: 2, content: "more" })).toBeNull();
    append("assistant/message", { turnId: "t", stepId: "a", requestId: "r1", messageId: "m1", usage: { outputTokens: 100 } });
    append("step/end", { turnId: "t", stepId: "a" });
    append("step/start", { turnId: "t", stepId: "b" });
    append("assistant/message", { turnId: "t", stepId: "b", messageId: "m2", usage: { outputTokens: 5 } });
    const activity = registry.snapshot("timing").values.sessionStats as Record<string, unknown>;
    // a：请求 1s→9s，TTFT 3s（空 chunk 不算），解码 5s/100 tok；b：只有模型用时 2s。
    expect(activity.timing).toEqual({ llmMs: 10_000, ttftMs: 3_000, ttftSteps: 1, decodeMs: 5_000, decodeTokens: 100 });
    expect(activity.stepCount).toBe(2);
    expect(activity).not.toHaveProperty("openSteps");
  });

  it("defaults permission mode and projects the last valid mode event", () => {
    const { header, journal } = fixture();
    const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value);
    registry.sync(header.sessionId, journal.events);
    expect(registry.snapshot(header.sessionId).values.permissionMode).toBe("default");

    journal.append({ type: "permission/mode-set", eventVersion: 1, source, data: { mode: "full-access", changedAt: "2026-09-23T12:00:00.000Z", source: "host" }, surface: null });
    registry.sync(header.sessionId, journal.events);
    expect(registry.snapshot(header.sessionId).values.permissionMode).toBe("full-access");
  });

  it("folds grants and keeps revoked ids from being re-added", () => {
    const { header, journal } = fixture();
    const grant = { schemaVersion: 1, grantId: "grant-1", sessionId: header.sessionId, agentId: "main:todos", audience: { pluginId: "actspace.filesystem-read", permissionDomain: "filesystem-read", policyVersion: 1 }, action: "file.read", access: "read", selector: { kind: "exact", canonicalPath: "/workspace/src/file.ts" }, sourceRequestId: "request-1", sourceCallId: "call-1", sourceToolName: "read_file", issuedAt: "2026-09-23T12:00:00.000Z" } as const;
    journal.append({ type: "permission/grant-added", eventVersion: 1, source, data: grant, surface: null });
    journal.append({ type: "permission/grant-revoked", eventVersion: 1, source, data: { schemaVersion: 1, grantId: "grant-1", sessionId: header.sessionId, agentId: "main:todos", revokedAt: "2026-09-23T12:01:00.000Z" }, surface: null });
    const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value); registry.sync(header.sessionId, journal.events);
    expect(registry.snapshot(header.sessionId).values.sessionGrants).toEqual([]);
    expect(registry.snapshot(header.sessionId).values.permissionMode).toBe("default");
  });

  it("keeps an out-of-order revoke as a tombstone", () => {
    const { header, journal } = fixture();
    const revoke = { schemaVersion: 1, grantId: "grant-late", sessionId: header.sessionId, agentId: "main:todos", revokedAt: "2026-09-23T12:01:00.000Z" } as const;
    const grant = { schemaVersion: 1, grantId: "grant-late", sessionId: header.sessionId, agentId: "main:todos", audience: { pluginId: "actspace.filesystem-read", permissionDomain: "filesystem-read", policyVersion: 1 }, action: "file.read", access: "read", selector: { kind: "exact", canonicalPath: "/workspace/src/file.ts" }, sourceRequestId: "request-1", sourceCallId: "call-1", sourceToolName: "read_file", issuedAt: "2026-09-23T12:00:00.000Z" } as const;
    journal.append({ type: "permission/grant-revoked", eventVersion: 1, source, data: revoke, surface: null });
    journal.append({ type: "permission/grant-added", eventVersion: 1, source, data: grant, surface: null });
    const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value); registry.sync(header.sessionId, journal.events);
    expect(registry.snapshot(header.sessionId).values.sessionGrants).toEqual([]);
  });
});


it("restores a process grant and replays its revocation", () => {
  const { header, journal } = fixture();
  const grant = { schemaVersion: 1, grantId: "bash-g", sessionId: header.sessionId, agentId: "main:todos", audience: { pluginId: "actspace.shell-tools", permissionDomain: "bash", policyVersion: 1 }, action: "process.execute", access: "execute", selector: { kind: "command_prefix", prefix: ["pnpm"], cwdRoot: "/workspace" }, sourceRequestId: "r", sourceCallId: "c", sourceToolName: "bash", issuedAt: "2026-10-11T00:00:00Z" };
  journal.append({ type: "permission/grant-added", eventVersion: 1, source, data: grant, surface: null });
  const reload = () => {
    const replay = new SessionJournal({ registry: createCoreCodecRegistry(), seed: journal.events });
    const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value);
    registry.sync(header.sessionId, replay.events);
    return registry.snapshot(header.sessionId).values.sessionGrants;
  };
  expect(reload()).toEqual([grant]);
  journal.append({ type: "permission/grant-revoked", eventVersion: 1, source, data: { schemaVersion: 1, grantId: "bash-g", sessionId: header.sessionId, agentId: "main:todos", revokedAt: "2026-10-11T01:00:00Z" }, surface: null });
  expect(reload()).toEqual([]);
});


it.each([false, true])("settles failed attempts without retry wait (stop during wait=%s)", (stop) => {
  const codecs = createCoreCodecRegistry();
  let second = 0;
  const journal = new SessionJournal({ registry: codecs, now: () => new Date(Date.UTC(2026, 9, 16, 0, 0, second)).toISOString() });
  const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value);
  const append = (at: number, type: string, data: Record<string, unknown>) => { second = at; registry.apply("retry", journal.append({ type, eventVersion: 1, source, data: { turnId: "t", ...data } as never, surface: null })); };
  append(0, "turn/start", { turnId: "t" });
  append(0, "step/start", { stepId: "s" });
  append(1, "request/header", { stepId: "s", requestId: "r1" });
  append(1, "request/context", { stepId: "s", requestId: "r1" });
  append(4, "llm/retry", { requestId: "r1", retryId: "retry", attempt: 1, nextAttempt: 2, delayMs: 1000, failure: { kind: "unknown", message: "retry", retryable: true, attempt: 1 } });
  if (!stop) {
    append(5, "request/header", { stepId: "s", requestId: "r2" });
    append(5, "request/context", { stepId: "s", requestId: "r2" });
    append(6, "assistant/chunk", { stepId: "s", messageId: "m", chunkIndex: 0, content: "hi" });
    append(9, "assistant/message", { stepId: "s", requestId: "r2", messageId: "m", usage: { outputTokens: 30 } });
  }
  append(10, "step/end", { stepId: "s", reason: stop ? "aborted" : "completed" });
  const timing = (registry.snapshot("retry").values.sessionStats as { timing: unknown }).timing;
  expect(timing).toEqual({ llmMs: stop ? 3000 : 7000, ttftMs: stop ? 0 : 1000, ttftSteps: stop ? 0 : 1, decodeMs: stop ? 0 : 3000, decodeTokens: stop ? 0 : 30 });
  const replay = new SessionProjectionRegistry(); registerSessionFacts(replay, value => value); replay.sync("retry", journal.events);
  expect((replay.snapshot("retry").values.sessionStats as { timing: unknown }).timing).toEqual(timing);
});


it("rejects old timing checkpoints so history can rebuild under the retry-aware version", () => {
  const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value);
  const checkpoint = registry.checkpoint("old");
  const old = { ...checkpoint, rows: { ...checkpoint.rows, sessionStats: { ...checkpoint.rows.sessionStats!, stateVersion: 2 } } };
  expect(() => registry.restore("old", old)).toThrow("version mismatch: sessionStats");
  expect(registry.stateVersions.sessionStats).toBe(3);
});

it("releases closed Step usage correction state while retaining exact totals and known zero cost", () => {
  const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value); registry.seal();
  let seq = 0;
  const append = (type: string, data: Record<string, unknown>) => registry.apply("bounded", { recordKind: "event", type, seq: seq++, eventVersion: 1, criticality: "required", source, time: "2026-10-18T00:00:00Z", data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as never);
  for (let index = 0; index < 1000; index++) {
    const stepId = `s${index}`, requestId = `r${index}`;
    append("step/start", { stepId });
    append("request/header", { stepId, requestId });
    append("assistant/message", { stepId, requestId, usage: { inputTokens: 3, outputTokens: 2, cost: 0, costCurrency: "USD", costProvenance: { version: 1, basis: "provider-reported" } } });
    append("step/end", { stepId, usage: { inputTokens: 900, outputTokens: 900 } });
  }
  expect(registry.snapshot("bounded").values.providerUsage).toMatchObject({ inputTokens: 3000, outputTokens: 2000, totalTokens: 5000, costUsd: 0 });
  const state = registry.checkpoint("bounded").rows.providerUsage!.state as Record<string, unknown>;
  expect(state.selected).toEqual({}); expect(state.requests).toEqual({}); expect(state.activeStep).toBeNull();
});
