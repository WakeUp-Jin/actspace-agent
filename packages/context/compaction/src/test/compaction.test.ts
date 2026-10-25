import { describe, expect, it, vi } from "vitest";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { CompactionPlugin, DEFAULT_COMPACTION_POLICY, DeterministicCompactionSummarizer } from "../index.js";

import { compactionSession } from "./session-fixture.js";

type Session = Awaited<ReturnType<typeof compactionSession>>;

function assistant(session: Session, messageId: string, content: string, usage?: Record<string, unknown>) {
  return session.append({ type: "assistant/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId, ...(usage ? { usage } : {}) } as never, surface: { kind: "append", node: { kind: "assistant", messageId, content } } });
}

function compactionSpan(session: Session) {
  return session.journal.events.find(event => event.type === "compaction/start")!.data as { start: number; end: number };
}

describe("Compaction", () => {
  it("persists summary latency even when transaction timestamps are identical", async () => {
    const session = await compactionSession();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T00:00:00.000Z"));
    try {
      const plugin = new CompactionPlugin(DEFAULT_COMPACTION_POLICY, {
        summarize: async () => {
          expect(session.journal.events).toHaveLength(5);
          vi.setSystemTime(new Date("2026-09-30T00:00:01.500Z"));
          return { content: "summary" };
        },
      });
      expect(await plugin.compact(session)).toBe(true);
      expect(session.journal.events.at(-1)).toMatchObject({ type: "compaction/end", data: { durationMs: 1500 } });
      expect(session.journal.events[5]?.time).toBe(session.journal.events[8]?.time);
    } finally {
      vi.useRealTimers();
      await session.close();
    }
  });

  it("does not commit any compaction facts when summarization fails", async () => {
    const session = await compactionSession();
    try {
      const plugin = new CompactionPlugin(DEFAULT_COMPACTION_POLICY, { summarize: async () => { throw Error("utility unavailable"); } });
      await expect(plugin.compact(session)).rejects.toThrow("utility unavailable");
      expect(session.journal.events).toHaveLength(5);
      expect(session.journal.surface.entries).toHaveLength(5);
    } finally { await session.close(); }
  });

  it("omits runtime context blocks from deterministic summaries", async () => {
    const summary = await new DeterministicCompactionSummarizer().summarize([{
      node: { kind: "user", messageId: "message-1", content: [{ type: "text", text: "hello" }, { type: "runtime-context", context: { agentMode: "plan" } }] },
      sourceSeq: 0,
    } as never], { sessionId: "session-1" });
    expect(summary.content).toContain("hello");
    expect(summary.content).not.toContain("runtime-context");
    expect(summary.content).not.toContain("agentMode");
  });

  it("keeps file references and quoted replies in deterministic summaries", async () => {
    const summary = await new DeterministicCompactionSummarizer().summarize([{
      node: { kind: "user", messageId: "message-1", content: [
        { type: "text", text: "hello" },
        { type: "file-reference", relativePath: "src/a.ts", displayName: "a.ts" },
        { type: "response-excerpt", annotationId: "ann", assistantMessageId: "v2-3", selectedText: "quoted line", startOffset: 0, endOffset: 11, prefixContext: "", suffixContext: "", comment: "why" },
      ] },
      sourceSeq: 0,
    } as never], { sessionId: "session-1" });
    expect(summary.content).toContain("src/a.ts");
    expect(summary.content).toContain("quoted line");
    expect(summary.content).toContain("why");
  });

  it("appends a transaction and never deletes the original Surface facts", async () => {
    const registry = createCoreCodecRegistry();
    const session = SessionHandle.createEphemeral({
      registry,
      header: createSessionHeader({ sessionId: "session", createdAt: "2026-08-23T00:00:00.000Z", lineage: null, createdWith: { profileId: "base", runtimeContractVersion: "actspace.runtime.v2", manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2.0.0" }], codecSetDigest: registry.digest } }),
      now: () => "2026-08-23T00:00:00.000Z",
    });
    for (let index = 0; index < 5; index += 1) {
      await session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: `m-${index}` }, surface: { kind: "append", node: { kind: "user", messageId: `m-${index}`, content: `message-${index}` } } });
    }
    const plugin = new CompactionPlugin({ ...DEFAULT_COMPACTION_POLICY, reserveTokens: 0, triggerRatio: 0.5 }, new DeterministicCompactionSummarizer());
    const started: number[] = [];
    const observer = { onStarted: ({ entryCount }: { entryCount: number }) => { started.push(entryCount); } };
    expect(await plugin.maybeCompact(session, { inputTokens: 10, outputTokens: 0, contextWindow: 10 }, observer)).toBe(true);
    await expect(plugin.compact(session, observer)).resolves.toBe(false);
    // Only the compaction that chose a region notifies; the skipped one stays silent.
    expect(started).toEqual([4]);
    expect(session.journal.events).toHaveLength(9);
    expect(session.journal.events[7]?.type).toBe("surface/replaced");
    expect(session.journal.surface.entries).toHaveLength(2);
    await session.close();
  });

  it("reads a live trigger-ratio resolver for Chat without changing manual compaction", async () => {
    const registry = createCoreCodecRegistry();
    const session = SessionHandle.createEphemeral({
      registry,
      header: createSessionHeader({ sessionId: "chat", createdAt: "2026-09-24T00:00:00.000Z", lineage: null, createdWith: { profileId: "base", presetId: "actspace.chat", runtimeContractVersion: "actspace.runtime.v2", manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2.0.0" }], codecSetDigest: registry.digest } }),
      now: () => "2026-09-24T00:00:00.000Z",
    });
    for (let index = 0; index < 5; index += 1) {
      await session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: `m-${index}` }, surface: { kind: "append", node: { kind: "user", messageId: `m-${index}`, content: `message-${index}` } } });
    }
    let ratio = 0.95;
    const plugin = new CompactionPlugin({ ...DEFAULT_COMPACTION_POLICY, reserveTokens: 0, minimumRegionEntries: 4 }, new DeterministicCompactionSummarizer())
      .withTriggerRatio(() => ratio);
    expect(await plugin.maybeCompact(session, { inputTokens: 80, outputTokens: 0, contextWindow: 100 })).toBe(false);
    ratio = 0.5;
    expect(await plugin.maybeCompact(session, { inputTokens: 80, outputTokens: 0, contextWindow: 100 })).toBe(true);
    await session.close();
  });

  it("records measured before tokens on manual compaction right after a request", async () => {
    const session = await compactionSession();
    await assistant(session, "a-1", "reply-1", { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 0 });
    const plugin = new CompactionPlugin(DEFAULT_COMPACTION_POLICY, { summarize: async () => ({ content: "summary" }) });
    expect(await plugin.compact(session)).toBe(true);
    const { start, end } = compactionSpan(session);
    // Each fixture message is "message-N" (9 chars → 3 tokens); "summary" is 7 chars → 2 tokens.
    const data = session.journal.events.at(-1)!.data;
    expect(data).toMatchObject({ trigger: "manual", beforeTokens: 150, afterTokens: 150 - 3 * (end - start) + 2 });
    expect(data).not.toHaveProperty("beforeEstimated");
    await session.close();
  });

  it("walks back past assistant messages without usable usage", async () => {
    const session = await compactionSession();
    await assistant(session, "a-1", "reply-1", { inputTokens: 120, outputTokens: 15 });
    await assistant(session, "a-2", "reply-2");
    await assistant(session, "a-3", "reply-3", { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, cost: null, costCurrency: null, source: "unknown" });
    const plugin = new CompactionPlugin(DEFAULT_COMPACTION_POLICY, { summarize: async () => ({ content: "summary" }) });
    expect(await plugin.compact(session)).toBe(true);
    // 135 measured + "reply-2" and "reply-3" (7 chars → 2 tokens each) appended after that request.
    expect(session.journal.events.at(-1)!.data).toMatchObject({ trigger: "manual", beforeTokens: 139, beforeEstimated: true });
    await session.close();
  });

  it("records auto before tokens from the journal instead of the trigger pressure", async () => {
    const session = await compactionSession();
    await assistant(session, "a-1", "reply-1", { inputTokens: 100, outputTokens: 50 });
    await session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: "late" }, surface: { kind: "append", node: { kind: "user", messageId: "late", content: "x".repeat(400) } } });
    const finished = vi.fn();
    const plugin = new CompactionPlugin(DEFAULT_COMPACTION_POLICY, { summarize: async () => ({ content: "summary" }) });
    expect(await plugin.maybeCompact(session, { inputTokens: 90_000, outputTokens: 1_000, contextWindow: 100_000 }, { onFinished: finished })).toBe(true);
    const { start, end } = compactionSpan(session);
    const removed = session.journal.events.filter(event => event.seq < 7 && event.surface?.kind === "append").slice(start, end)
      .reduce((sum, event) => sum + Math.ceil(String((event.surface as { node: { content: string } }).node.content).length / 4), 0);
    const stats = { trigger: "auto", beforeTokens: 250, afterTokens: 250 - removed + 2, beforeEstimated: true };
    expect(session.journal.events.at(-1)).toMatchObject({ type: "compaction/end", data: stats });
    expect(finished).toHaveBeenCalledWith(expect.objectContaining({ ...stats, entryCount: end - start }));
    await session.close();
  });

  it("chains a second compaction from the previous after count", async () => {
    const session = await compactionSession();
    for (let index = 5; index < 10; index += 1) await session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: `m-${index}` }, surface: { kind: "append", node: { kind: "user", messageId: `m-${index}`, content: `message-${index}` } } });
    await assistant(session, "a-1", "reply-1", { inputTokens: 900, outputTokens: 100 });
    const plugin = new CompactionPlugin({ ...DEFAULT_COMPACTION_POLICY, reserveTokens: 0, minimumRegionEntries: 2 }, { summarize: async () => ({ content: "summary" }) });
    expect(await plugin.compact(session)).toBe(true);
    const first = session.journal.events.at(-1)!.data as { afterTokens: number };
    expect(await plugin.compact(session)).toBe(true);
    // No request ran in between, so the measured 1000 no longer describes the context.
    expect(session.journal.events.at(-1)!.data).toMatchObject({ beforeTokens: first.afterTokens, beforeEstimated: true });
    await session.close();
  });

  it("records manual trigger without tokens before any request has usage", async () => {
    const session = await compactionSession();
    const plugin = new CompactionPlugin(DEFAULT_COMPACTION_POLICY, { summarize: async () => ({ content: "summary" }) });
    expect(await plugin.compact(session)).toBe(true);
    const end = session.journal.events.at(-1)!;
    expect(end).toMatchObject({ type: "compaction/end", data: { trigger: "manual" } });
    expect(end.data).not.toHaveProperty("beforeTokens");
    expect(end.data).not.toHaveProperty("afterTokens");
    await session.close();
  });
});
