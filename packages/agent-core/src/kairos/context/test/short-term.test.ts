import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionEvent } from "@actspace/shared";
import { KairosShortTermMemoryContext, toLlmMessages, sanitizeOrphanToolPairs } from "../short-term";
import { ShortMemoryStore } from "../../storage/short-memory-store";

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "kairos-shortterm-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

const makeUser = (id: string, content: string, ts: string): SessionEvent => ({
  id,
  sessionId: "s",
  turnId: id,
  type: "user_message",
  timestamp: ts,
  payload: { content },
});

const makeReply = (id: string, content: string, ts: string): SessionEvent => ({
  id,
  sessionId: "s",
  turnId: id,
  type: "assistant_message",
  timestamp: ts,
  payload: { content, model: "mock", provider: "mock", stopReason: "stop" },
});

describe("KairosShortTermMemoryContext.load", () => {
  it("returns empty result when no files exist", async () => {
    const store = new ShortMemoryStore(rootDir);
    const ctx = new KairosShortTermMemoryContext({ store, contextWindow: 100_000 });
    const res = await ctx.load();
    expect(res.messages).toEqual([]);
    expect(res.summarySegments).toEqual([]);
    expect(res.loadedTokenEstimate).toBe(0);
  });

  it("loads recent days in ascending order", async () => {
    const store = new ShortMemoryStore(rootDir);
    await store.appendEvent(makeUser("u-1", "yesterday msg", "2026-05-26T10:00:00Z"), new Date("2026-05-26T10:00:00Z"));
    await store.appendEvent(makeReply("a-1", "yesterday reply", "2026-05-26T10:00:01Z"), new Date("2026-05-26T10:00:01Z"));
    await store.appendEvent(makeUser("u-2", "today msg", "2026-05-27T10:00:00Z"), new Date("2026-05-27T10:00:00Z"));

    const ctx = new KairosShortTermMemoryContext({ store, contextWindow: 100_000 });
    const res = await ctx.load();
    expect(res.messages.length).toBe(3);
    // 时间升序
    expect(res.messages[0].timestamp).toBeLessThan(res.messages[2].timestamp);
  });

  it("prefers summary over raw jsonl when summary covers the date", async () => {
    const store = new ShortMemoryStore(rootDir);
    await store.appendEvent(makeUser("u-old", "old msg", "2026-05-22T10:00:00Z"), new Date("2026-05-22T10:00:00Z"));
    const monthDir = store.getMonthDir("2026-05-22");
    await mkdir(monthDir, { recursive: true });
    await store.saveSummary(monthDir, "week_05-20_to_05-26.summary.md", "## Summary\nhad chat");

    await store.appendEvent(makeUser("u-new", "fresh", "2026-05-27T10:00:00Z"), new Date("2026-05-27T10:00:00Z"));

    const ctx = new KairosShortTermMemoryContext({ store, contextWindow: 100_000 });
    const res = await ctx.load();
    // 老日子被 summary 覆盖：消息里不应有 u-old；summary 应被加载
    expect(res.messages.map((m) => (m.role === "user" ? (typeof m.content === "string" ? m.content : "") : ""))).not.toContain("old msg");
    expect(res.summarySegments.find((s) => s.label.startsWith("week_"))).toBeDefined();
    // 新日子的消息保留
    const userMsgs = res.messages.filter((m) => m.role === "user");
    expect(userMsgs.length).toBe(1);
  });

  it("respects loadBudgetRatio: stops loading days when budget exhausted", async () => {
    const store = new ShortMemoryStore(rootDir);
    // 3 个老日子每个 ~500 字符 = ~140 token；budget = 50 * 0.5 = 25 token 只能装 0 天
    for (let i = 0; i < 3; i++) {
      const date = new Date(`2026-05-2${5 + i}T10:00:00Z`);
      await store.appendEvent(makeUser(`u-${i}`, "x".repeat(500), date.toISOString()), date);
    }
    const ctx = new KairosShortTermMemoryContext({ store, contextWindow: 50, loadBudgetRatio: 0.5 });
    const res = await ctx.load();
    // budget 太小（25 token），第一天就超出 → 加载 0 条消息
    expect(res.messages.length).toBeLessThanOrEqual(1);
  });
});

describe("sanitizeOrphanToolPairs", () => {
  it("drops orphan tool_result that has no matching tool_call", () => {
    const messages = toLlmMessages([
      {
        id: "tc-1",
        sessionId: "s",
        turnId: "t",
        type: "tool_call",
        timestamp: "2026-05-27T00:00:00.000Z",
        payload: { id: "tc-A", name: "read_file", arguments: { path: "a.txt" } },
      },
      {
        id: "tr-orphan",
        sessionId: "s",
        turnId: "t",
        type: "tool_result",
        timestamp: "2026-05-27T00:00:01.000Z",
        payload: { toolCallId: "tc-OTHER", toolName: "read_file", ok: true, summary: "x" },
      },
    ]);
    const cleaned = sanitizeOrphanToolPairs(messages);
    expect(cleaned.some((m) => m.role === "toolResult" && m.toolCallId === "tc-OTHER")).toBe(false);
    // 原本的 tool_call 因没有对应 result，也会被清掉
    expect(cleaned.some((m) => m.role === "assistant")).toBe(false);
  });

  it("keeps matched tool_call + tool_result pair", () => {
    const messages = toLlmMessages([
      {
        id: "tc-1",
        sessionId: "s",
        turnId: "t",
        type: "tool_call",
        timestamp: "2026-05-27T00:00:00.000Z",
        payload: { id: "tc-A", name: "read_file", arguments: { path: "a.txt" } },
      },
      {
        id: "tr-1",
        sessionId: "s",
        turnId: "t",
        type: "tool_result",
        timestamp: "2026-05-27T00:00:01.000Z",
        payload: { toolCallId: "tc-A", toolName: "read_file", ok: true, summary: "ok" },
      },
    ]);
    const cleaned = sanitizeOrphanToolPairs(messages);
    expect(cleaned).toHaveLength(2);
  });
});
