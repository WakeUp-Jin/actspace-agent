import { describe, expect, it } from "vitest";
import { GlobalSessionIndex } from "../global-index.js";
const summary = (sessionId: string, throughJournalSeq: number) => ({ sessionId, throughJournalSeq, summaryVersion: 2, createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:01Z", workspaceRoot: null, profileId: "test", agentForm: "agent" as const, agentFormId: "actspace.main" as const, agentMode: "agent" as const, agentModeRevision: 0, title: sessionId, pinned: false, archived: false, completedTurnCount: 1, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 2, costUsd: null }, accessState: "read-write" as const, lineage: null });

describe("GlobalSessionIndex", () => {
  it("rebuilds replaceable summaries and rejects stale watermarks", () => {
    const index = new GlobalSessionIndex(); index.replace(summary("s", 2)); index.replace(summary("s", 1));
    expect(index.values()[0]?.throughJournalSeq).toBe(2);
    index.replaceAll([summary("other", 3)]);
    expect(index.get("s")).toBeUndefined();
    expect(index.get("other")?.throughJournalSeq).toBe(3);
    index.remove("other"); expect(index.values()).toEqual([]);
  });
});
