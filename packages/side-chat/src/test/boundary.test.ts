import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionForkSeed, createSessionHeader, SessionJournal, type SessionEventCandidateV1 } from "@actspace/session-journal";
import { resolveSideChatBoundary, SideChatError } from "../boundary.js";

const registry = createCoreCodecRegistry();
const source = { ownerPluginId: "@actspace/core" } as const;
const candidate = (type: string, data: SessionEventCandidateV1["data"]): SessionEventCandidateV1 => ({ type, eventVersion: 1, source, data, surface: null });

function journalWith(...turns: Array<"done" | "running" | "tool-open">) {
  const journal = new SessionJournal({ registry, now: () => "2026-10-21T00:00:00.000Z" });
  turns.forEach((kind, index) => {
    const turnId = `t${index}`, stepId = `s${index}`;
    journal.append(candidate("turn/start", { turnId }));
    journal.append(candidate("step/start", { turnId, stepId }));
    journal.append(candidate("user/message", { messageId: `u${index}`, content: "q" }));
    if (kind === "tool-open") { journal.append(candidate("tool/call", { callId: `c${index}`, name: "read_file", turnId, stepId })); return; }
    if (kind === "running") return;
    journal.append(candidate("step/end", { turnId, stepId, status: "completed" }));
    journal.append(candidate("turn/end", { turnId, status: "completed" }));
  });
  return journal;
}

describe("resolveSideChatBoundary", () => {
  it("takes the whole Journal when the parent is idle, including trailing events", () => {
    const journal = journalWith("done", "done");
    journal.append(candidate("session/end-seed", { sessionId: "main", lastSeq: journal.lastSeq }));
    expect(resolveSideChatBoundary(journal.events, registry)).toEqual({ boundarySeq: journal.lastSeq, inheritedTurnCount: 2, runningTurnExcluded: false });
  });

  it("stops at the last completed Turn while the parent is running", () => {
    const journal = journalWith("done", "done", "running");
    const boundary = resolveSideChatBoundary(journal.events, registry);
    expect(boundary).toEqual({ boundarySeq: 9, inheritedTurnCount: 2, runningTurnExcluded: true });
    expect(journal.events[boundary.boundarySeq]?.type).toBe("turn/end");
  });

  it("leaves a Turn with an open tool call behind and produces a forkable prefix", () => {
    const journal = journalWith("done", "tool-open");
    const boundary = resolveSideChatBoundary(journal.events, registry);
    expect(boundary).toEqual({ boundarySeq: 4, inheritedTurnCount: 1, runningTurnExcluded: true });
    const parentHeader = createSessionHeader({ sessionId: "main", createdAt: "2026-10-21T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "2", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } });
    const seed = createSessionForkSeed({ parentHeader, parentEvents: journal.events, boundarySeq: boundary.boundarySeq, newSessionId: "side", createdAt: parentHeader.createdAt, createdWith: parentHeader.createdWith, registry, origin: "side-chat" });
    expect(seed.events).toHaveLength(5);
  });

  it("refuses when no Turn has finished yet", () => {
    expect(() => resolveSideChatBoundary([], registry)).toThrow(SideChatError);
    const journal = journalWith("running");
    try { resolveSideChatBoundary(journal.events, registry); expect.unreachable(); }
    catch (error) { expect(error).toMatchObject({ code: "SIDE_CHAT_NO_COMPLETED_TURN" }); }
  });
});
