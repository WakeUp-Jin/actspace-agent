import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from "@actspace/session-journal";
import { SessionProjectionRegistry } from "../registry.js";
import { registerSessionFacts } from "../facts.js";

const source = { ownerPluginId: "@actspace/core" } as const;

function fixture() {
  const codecs = createCoreCodecRegistry();
  const header = createSessionHeader({ sessionId: "todos", createdAt: "2026-09-22T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: codecs.digest } });
  const journal = new SessionJournal({ registry: codecs, now: (() => { let i = 0; return () => `2026-09-22T00:00:0${i++}.000Z`; })() });
  const append = (items: readonly Record<string, unknown>[]) => journal.append({ type: "todo/write", eventVersion: 1, source, data: { items, revision: Math.max(...items.map(item => Number(item.revision) || 0)) }, surface: null });
  append([{ todoId: "a", revision: 1, text: "A", state: "pending", createdAt: "a", updatedAt: "a" }]);
  append([{ todoId: "b", revision: 1, text: "B", state: "pending", createdAt: "b", updatedAt: "b" }]);
  append([{ todoId: "a", revision: 2, text: "A2", state: "completed", updatedAt: "a2" }]);
  return { header, journal };
}

describe("Session facts canonical todo fold", () => {
  it("merges item deltas and keeps omitted items", () => {
    const { header, journal } = fixture();
    const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value);
    registry.sync(header.sessionId, journal.events);
    expect(registry.snapshot(header.sessionId).values.todos).toEqual([
      { todoId: "a", revision: 2, text: "A2", state: "completed", createdAt: "a", updatedAt: "a2" },
      { todoId: "b", revision: 1, text: "B", state: "pending", createdAt: "b", updatedAt: "b" },
    ]);
  });

  it("produces the same result for full replay and incremental apply and ignores stale revisions", () => {
    const { header, journal } = fixture();
    const full = new SessionProjectionRegistry(); registerSessionFacts(full, value => value); full.sync(header.sessionId, journal.events);
    const incremental = new SessionProjectionRegistry(); registerSessionFacts(incremental, value => value); incremental.sync(header.sessionId, []);
    for (const event of journal.events) incremental.apply(header.sessionId, event);
    expect(incremental.snapshot(header.sessionId)).toEqual(full.snapshot(header.sessionId));
    const stale = { ...journal.events.at(-1)!, seq: journal.events.length };
    stale.data = { items: [{ todoId: "a", revision: 1, text: "old", state: "pending" }] };
    incremental.apply(header.sessionId, stale);
    expect(incremental.snapshot(header.sessionId).values.todos).toEqual(full.snapshot(header.sessionId).values.todos);
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
    const grant = { schemaVersion: 1, grantId: "grant-1", sessionId: header.sessionId, agentId: "main:todos", audience: { pluginId: "actspace.core-tools", permissionDomain: "core-files", policyVersion: 1 }, action: "file.read", access: "read", selector: { kind: "exact", canonicalPath: "/workspace/src/file.ts" }, sourceRequestId: "request-1", sourceCallId: "call-1", sourceToolName: "read_file", issuedAt: "2026-09-23T12:00:00.000Z" } as const;
    journal.append({ type: "permission/grant-added", eventVersion: 1, source, data: grant, surface: null });
    journal.append({ type: "permission/grant-revoked", eventVersion: 1, source, data: { schemaVersion: 1, grantId: "grant-1", sessionId: header.sessionId, agentId: "main:todos", revokedAt: "2026-09-23T12:01:00.000Z" }, surface: null });
    const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value); registry.sync(header.sessionId, journal.events);
    expect(registry.snapshot(header.sessionId).values.sessionGrants).toEqual([]);
    expect(registry.snapshot(header.sessionId).values.permissionMode).toBe("default");
  });

  it("keeps an out-of-order revoke as a tombstone", () => {
    const { header, journal } = fixture();
    const revoke = { schemaVersion: 1, grantId: "grant-late", sessionId: header.sessionId, agentId: "main:todos", revokedAt: "2026-09-23T12:01:00.000Z" } as const;
    const grant = { schemaVersion: 1, grantId: "grant-late", sessionId: header.sessionId, agentId: "main:todos", audience: { pluginId: "actspace.core-tools", permissionDomain: "core-files", policyVersion: 1 }, action: "file.read", access: "read", selector: { kind: "exact", canonicalPath: "/workspace/src/file.ts" }, sourceRequestId: "request-1", sourceCallId: "call-1", sourceToolName: "read_file", issuedAt: "2026-09-23T12:00:00.000Z" } as const;
    journal.append({ type: "permission/grant-revoked", eventVersion: 1, source, data: revoke, surface: null });
    journal.append({ type: "permission/grant-added", eventVersion: 1, source, data: grant, surface: null });
    const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value); registry.sync(header.sessionId, journal.events);
    expect(registry.snapshot(header.sessionId).values.sessionGrants).toEqual([]);
  });
});
