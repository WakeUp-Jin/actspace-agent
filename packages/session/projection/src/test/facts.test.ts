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
