import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal, validateSessionEvents, type SessionValidationResult } from "@actspace/session-journal";
import { MemorySessionStorage } from "@actspace/session-storage/testing";
import type { SessionStorage, SessionStorageSnapshot } from "@actspace/session-storage";
import { SessionStore } from "../session-store.js";

const registry = createCoreCodecRegistry();
const header = createSessionHeader({ sessionId: "s", createdAt: "2026-11-04T00:00:00.000Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } });
const journal = new SessionJournal({ registry });
const events = [journal.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: "t" }, surface: null })];
/** A result that real validation of `events` could never produce, so seeing it proves validation was skipped. */
const sentinel: SessionValidationResult = Object.freeze({ accessState: "degraded", diagnostics: Object.freeze([{ code: "UNKNOWN_IGNORABLE_CODEC" as const, seq: 0, type: "sentinel", message: "from backend" }]), relations: Object.freeze({ openTurnId: null, openStepId: null, openRequestIds: Object.freeze([]), openToolCallIds: Object.freeze([]), pendingInboxMessageIds: Object.freeze([]), committedRepairIds: Object.freeze([]) }) });

function storeOver(snapshot: Partial<SessionStorageSnapshot>): SessionStore {
  const storage = { identity: Symbol("stub"), inspect: async () => ({ header, events, revision: "1", integrity: "complete", ...snapshot }) } as unknown as SessionStorage;
  return new SessionStore({ registry }, storage);
}

describe("SessionStore.inspect validation", () => {
  it("trusts the backend's validation when it ran under the same codec set", async () => {
    const inspection = await storeOver({ validated: { codecDigest: registry.digest, accessState: "degraded", result: sentinel } }).inspect("s");
    expect(inspection.validation).toBe(sentinel);
    expect(inspection.accessState).toBe("degraded");
  });

  it("validates itself when the backend used a different codec set", async () => {
    const inspection = await storeOver({ validated: { codecDigest: "other-codecs", accessState: "degraded", result: sentinel } }).inspect("s");
    expect(inspection.validation).toEqual(validateSessionEvents(events, registry));
    expect(inspection.validation).not.toEqual(sentinel);
    expect(inspection.accessState).toBe("read-write");
  });

  it("validates itself when the backend did not validate (no `validated`)", async () => {
    const memory = new MemorySessionStorage(registry);
    const store = new SessionStore({ registry }, memory);
    const handle = await memory.create(header); await handle.append(events); await handle.flush(); await handle.close();
    const inspection = await store.inspect("s");
    expect(inspection.validated).toBeUndefined();
    expect(inspection.validation).toEqual(validateSessionEvents(events, registry));
    expect(inspection.accessState).toBe("read-write");
    await memory.close();
  });

  it("never trusts backend validation for a repair-required snapshot", async () => {
    const inspection = await storeOver({ integrity: "repair-required", problem: "torn", validated: undefined }).inspect("s");
    expect(inspection.accessState).toBe("corrupt");
  });
});
