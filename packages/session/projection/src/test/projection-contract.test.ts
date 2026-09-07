import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, SessionJournal, type SessionEventCandidateV1 } from "@actspace/session-journal";
import {
  createSessionProjection,
  projectCanonicalSurface,
  toProjectionChange,
  toSessionProjectionSnapshot,
} from "../projection.js";

const source = { ownerPluginId: "@actspace/core" } as const;

function candidate(type: string, data: Record<string, unknown>, surface: SessionEventCandidateV1["surface"] = null): SessionEventCandidateV1 {
  return { type, eventVersion: 1, source, data, surface } as SessionEventCandidateV1;
}

describe("Session projection contract", () => {
  it("uses SessionJournal Surface as the canonical adapter, including inbox claims", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-30T00:00:00.000Z" });
    journal.append(candidate("agent/inbox/spliced", { operation: "enqueue", messageId: "inbox-1", target: "next-turn", content: "hello" }));
    journal.append({
      ...candidate("agent/inbox/spliced", { operation: "claim", messageId: "inbox-1", target: "next-turn" }, {
        kind: "append",
        node: { kind: "user", messageId: "inbox-1", content: "hello" },
      }),
      provenance: { sourceEventSeqs: [0], contributorIds: ["main-inbox"], runtimeSelectionSeq: null },
    });

    const canonical = projectCanonicalSurface(journal);
    expect(canonical.key).toBe("surface");
    expect(canonical.stateVersion).toBe(1);
    expect(canonical.view.entries).toHaveLength(1);
    expect(canonical.view.entries[0]).toMatchObject({
      node: { kind: "user", messageId: "inbox-1", content: "hello" },
      sourceEventSeqs: [0, 1],
    });
  });

  it("keeps one session identity and journal watermark across snapshot and change", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-30T00:00:00.000Z" });
    journal.append(candidate("user/message", { messageId: "user-1", content: "hello" }, {
      kind: "append",
      node: { kind: "user", messageId: "user-1", content: "hello" },
    }));
    const projection = createSessionProjection("session-1", journal.events, journal.surface, journal.validation.relations);
    const snapshot = toSessionProjectionSnapshot(projection);
    const change = toProjectionChange(projection, ["session", "surface", "surface"]);

    expect(snapshot).toMatchObject({ kind: "session-projection", schemaVersion: 1, sessionId: "session-1", throughJournalSeq: 0 });
    expect(snapshot.values.session).toEqual(projection);
    expect(change.revision).toMatchObject({ schemaVersion: 1, sessionId: "session-1", throughJournalSeq: 0, projectionKey: "session", stateVersion: 1 });
    expect(change.changedKeys).toEqual(["session", "surface"]);
  });
});
