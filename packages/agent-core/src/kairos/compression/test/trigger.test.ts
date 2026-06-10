import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextCompactionPayload, SessionEvent } from "@actspace/shared";
import type { AssistantMessage } from "../../../messages";
import type { LLMService } from "../../../llm/types";
import { ShortMemoryStore } from "../../storage/short-memory-store";
import { KairosShortTermMemoryContext } from "../../context/short-term";
import { KairosCompressionTrigger } from "../trigger";

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "kairos-compress-trigger-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function fakeLLM(replyText: string): LLMService {
  const reply: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: replyText }],
    model: "mock",
    provider: "mock",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      cacheHit: 0,
      cacheMiss: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
  return {
    complete: vi.fn().mockResolvedValue(reply),
    stream: vi.fn(),
    streamSimple: vi.fn(),
    completeSimple: vi.fn().mockResolvedValue(reply),
  };
}

const makeUser = (id: string, content: string, ts: string): SessionEvent => ({
  id,
  sessionId: "s",
  turnId: id,
  type: "user_message",
  timestamp: ts,
  payload: { content },
});

/** 写一条指定日期、约 chars 字符的 user_message（≈ chars/3.5 tokens）。 */
async function seedDay(store: ShortMemoryStore, date: string, chars: number): Promise<void> {
  const ts = `${date}T10:00:00.000Z`;
  await store.appendEvent(makeUser(`u-${date}`, "x".repeat(chars), ts), new Date(ts));
}

interface SetupOptions {
  contextWindow?: number;
  threshold?: number;
  maxDatesPerBatch?: number;
  llmReply?: string;
}

function setup(opts: SetupOptions = {}) {
  const store = new ShortMemoryStore(rootDir);
  const contextWindow = opts.contextWindow ?? 1000;
  const shortTerm = new KairosShortTermMemoryContext({ store, contextWindow });
  const llm = fakeLLM(opts.llmReply ?? "# 摘要\n这周做了点事");
  const compactionEvents: ContextCompactionPayload[] = [];
  const warnings: string[] = [];
  const trigger = new KairosCompressionTrigger({
    store,
    shortTerm,
    llm,
    contextWindow,
    getCompressionThreshold: () => opts.threshold ?? 0.5,
    emitCompactionEvent: async (payload) => {
      compactionEvents.push(payload);
    },
    onWarning: (message) => {
      warnings.push(message);
    },
    now: () => new Date("2026-06-10T12:00:00.000Z"),
    maxDatesPerBatch: opts.maxDatesPerBatch,
  });
  return { store, shortTerm, llm, trigger, compactionEvents, warnings };
}

describe("KairosCompressionTrigger", () => {
  it("skips when disk tokens are below threshold", async () => {
    const { store, llm, trigger } = setup();
    await seedDay(store, "2026-06-01", 100);

    const out = await trigger.runOnce();
    expect(out.status).toBe("skipped_below_threshold");
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("compresses old dates into a week summary and emits compaction event", async () => {
    const { store, shortTerm, llm, trigger, compactionEvents } = setup();
    // 06-01 / 06-02 各 ~570 tokens，远超 500 tokens 阈值；cutoff=06-08，都可压缩
    await seedDay(store, "2026-06-01", 2000);
    await seedDay(store, "2026-06-02", 2000);

    const out = await trigger.runOnce();
    expect(out.status).toBe("compressed");
    if (out.status !== "compressed") return;
    expect(out.label).toBe("week_06-01_to_06-02");
    expect(llm.complete).toHaveBeenCalledOnce();

    const text = await readFile(out.summaryPath, "utf8");
    expect(text).toContain("摘要");
    expect(out.summaryPath).toContain(join("2026-06", "week_06-01_to_06-02.summary.md"));

    expect(compactionEvents).toHaveLength(1);
    expect(compactionEvents[0].afterCount).toBe(1);
    expect(compactionEvents[0].beforeCount).toBe(2);
    expect(compactionEvents[0].historyRefPath).toBe(out.summaryPath);

    // 压缩后：原文被 summary 覆盖，磁盘估算大幅下降 → 第二轮不再触发
    const tokensAfter = await shortTerm.estimateDiskTokens();
    expect(tokensAfter).toBeLessThan(100);
    const second = await trigger.runOnce();
    expect(second.status).toBe("skipped_below_threshold");

    // load() 现在走 summary 而不是原文
    const loaded = await shortTerm.load();
    expect(loaded.messages).toHaveLength(0);
    expect(loaded.summarySegments.map((s) => s.label)).toContain("week_06-01_to_06-02");
  });

  it("warns and skips when only today/yesterday data exceeds threshold", async () => {
    const { llm, trigger, warnings, store } = setup();
    await seedDay(store, "2026-06-09", 2000);
    await seedDay(store, "2026-06-10", 2000);

    const out = await trigger.runOnce();
    expect(out.status).toBe("skipped_no_candidates");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("intra-day");
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("keeps the batch within a single calendar month", async () => {
    const { store, trigger } = setup();
    await seedDay(store, "2026-05-30", 2000);
    await seedDay(store, "2026-05-31", 2000);
    await seedDay(store, "2026-06-01", 2000);

    const out = await trigger.runOnce();
    expect(out.status).toBe("compressed");
    if (out.status !== "compressed") return;
    // 跨月截断：只压 5 月的两天，6 月留给下一轮
    expect(out.label).toBe("week_05-30_to_05-31");
    expect(out.summaryPath).toContain("2026-05");
  });

  it("respects maxDatesPerBatch", async () => {
    const { store, trigger } = setup({ maxDatesPerBatch: 2 });
    await seedDay(store, "2026-06-01", 2000);
    await seedDay(store, "2026-06-02", 2000);
    await seedDay(store, "2026-06-03", 2000);

    const out = await trigger.runOnce();
    expect(out.status).toBe("compressed");
    if (out.status !== "compressed") return;
    expect(out.label).toBe("week_06-01_to_06-02");
  });

  it("swallows llm failure via onWarning in background mode", async () => {
    const { store, llm, trigger, warnings } = setup();
    (llm.complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("llm down"));
    await seedDay(store, "2026-06-01", 4000);

    trigger.maybeCompressInBackground();
    await vi.waitFor(() => {
      expect(warnings).toHaveLength(1);
    });
    expect(warnings[0]).toContain("压缩失败");
  });
});

describe("KairosShortTermMemoryContext.estimateDiskTokens", () => {
  it("counts all segments without load-budget truncation", async () => {
    const store = new ShortMemoryStore(rootDir);
    // contextWindow=100 → load budget = 75 tokens，但磁盘上有 ~1142 tokens
    const shortTerm = new KairosShortTermMemoryContext({ store, contextWindow: 100 });
    await seedDay(store, "2026-06-01", 2000);
    await seedDay(store, "2026-06-02", 2000);

    const loaded = await shortTerm.load();
    expect(loaded.loadedTokenEstimate).toBeLessThanOrEqual(75);

    const diskTokens = await shortTerm.estimateDiskTokens();
    expect(diskTokens).toBeGreaterThan(1000);
  });
});
