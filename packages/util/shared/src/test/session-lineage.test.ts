import { describe, expect, it } from "vitest";
import { inheritedThroughSeq } from "../session-list-page.js";

describe("inheritedThroughSeq", () => {
  it("returns the copied prefix boundary for forks and side chats only", () => {
    expect(inheritedThroughSeq({ origin: "fork", parentSessionId: "p", parentBoundarySeq: 12, delegationDepth: 0 })).toBe(12);
    expect(inheritedThroughSeq({ origin: "side-chat", parentSessionId: "p", parentBoundarySeq: 3, delegationDepth: 0 })).toBe(3);
    // Delegated children start with an empty Journal.
    expect(inheritedThroughSeq({ origin: "delegation", parentSessionId: "p", parentBoundarySeq: 7, delegationDepth: 1 })).toBe(-1);
    // An agent_fork child copies the parent up to its boundary.
    expect(inheritedThroughSeq({ origin: "delegation", parentSessionId: "p", parentBoundarySeq: 7, delegationDepth: 1, inheritedThroughSeq: 7 })).toBe(7);
    expect(inheritedThroughSeq(null)).toBe(-1);
    expect(inheritedThroughSeq({ origin: "fork", parentBoundarySeq: "3" })).toBe(-1);
    expect(inheritedThroughSeq([])).toBe(-1);
  });
});
