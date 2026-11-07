import { describe, expect, it } from "vitest";
import { syntheticJournal, syntheticSessionEvents } from "../testing.js";

// 规模测试基础件自身的测试，也是写法示范（docs/coding-standards/perf-memory-conventions.md §8）：
// 同一个操作在 1k / 10k 条事件的会话上各跑一次，比较从归档历史读了多少条，不比较毫秒数。

describe("synthetic session for scale tests", () => {
  it("generates a valid long session with tool calls and compactions", () => {
    const events = syntheticSessionEvents(2_000, { compactEvery: 10 });
    expect(events.length).toBeGreaterThanOrEqual(2_000);
    expect(events.length).toBeLessThan(2_020);
    const types = new Set(events.map(event => event.type));
    for (const type of ["turn/start", "user/message", "tool/call", "tool/result", "assistant/message", "surface/replaced", "compaction/end"]) expect(types).toContain(type);
  });

  it("keeps only the tail in memory and counts archived reads", () => {
    const { journal, history } = syntheticJournal(5_000);
    expect(journal.retainedEventCount).toBe(512);
    expect(history.eventsRead).toBe(0);
    journal.readEvents(0, 10);
    expect(history.eventsRead).toBe(10);
  });

  it("shows the difference between a bounded read and a full read", () => {
    const reads = (count: number, operation: (journal: ReturnType<typeof syntheticJournal>["journal"]) => void) => {
      const { journal, history } = syntheticJournal(count);
      operation(journal);
      return history.eventsRead;
    };
    // 有界：只看最近的事件，读取量和会话长度无关。
    const tail = (journal: ReturnType<typeof syntheticJournal>["journal"]) => journal.eventsAfter(journal.lastSeq - 100);
    expect(reads(1_000, tail)).toBe(reads(10_000, tail));
    // 整份读：读取量随会话长度增长，这就是高频路径上要避免的写法。
    const full = (journal: ReturnType<typeof syntheticJournal>["journal"]) => { for (const _ of journal.iterateEvents()) void _; };
    expect(reads(10_000, full)).toBeGreaterThan(reads(1_000, full) * 5);
  }, 30_000);
});
