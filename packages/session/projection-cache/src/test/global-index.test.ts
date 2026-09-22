import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GlobalSessionIndex } from "../global-index.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

const summary = (sessionId: string, throughJournalSeq: number) => ({ sessionId, throughJournalSeq, summaryVersion: 1, createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:01Z", workspaceRoot: null, profileId: "test", title: sessionId, pinned: false, archived: false, completedTurnCount: 1, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 2, costUsd: null }, accessState: "read-write" as const, lineage: null });

describe("GlobalSessionIndex", () => {
  it("persists replaceable summaries and rejects stale watermarks", async () => {
    const root = await mkdtemp(join(tmpdir(), "global-index-")); roots.push(root);
    const index = new GlobalSessionIndex(root); index.replace(summary("s", 2)); index.replace(summary("s", 1)); await index.save();
    expect(JSON.parse(await readFile(join(root, "global-session-index.json"))).summaries).toHaveLength(1);
    const restored = new GlobalSessionIndex(root); expect(await restored.load()).toBe(true); expect(restored.values()[0]?.throughJournalSeq).toBe(2);
  });
});
