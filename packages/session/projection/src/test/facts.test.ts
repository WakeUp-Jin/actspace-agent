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
