import { expect, it } from "vitest";
import { ContextSourceRegistry } from "@actspace/context-engine";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { countingHistory, syntheticSessionEvents } from "@actspace/session-journal/testing";
import { SessionHandle } from "@actspace/session-persistence";
import { runToolStreamFixture } from "../testing.js";

// 规模测试（perf-memory-conventions.md §8）：一次模型请求从归档历史读的事件数不随会话长度增长。
// 之前 contextInput 为了找压缩摘要，对每个 surface 条目 readEvents(seq, seq + 1)，长会话就是整份逐条从文件解析（perf-backlog P2）。

async function historyReadsPerRequest(count: number): Promise<number> {
  const registry = createCoreCodecRegistry();
  // 每 300 轮压缩一次：对话条目横跨的事件数远超内存窗口（512 条），逐条读就一定要碰归档历史。
  const events = syntheticSessionEvents(count, { compactEvery: 300 });
  const history = countingHistory(events);
  const session = await SessionHandle.create({
    registry,
    header: createSessionHeader({ sessionId: "scale", createdAt: "2026-11-07T00:00:00.000Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }),
    driver: { history, append: async () => undefined, flush: async () => undefined, assertOwned: async () => undefined, close: async () => undefined },
    seed: events,
    durableSeq: () => events.length - 1,
  });
  expect(session.journal.retainedEventCount).toBeLessThan(count);
  history.reset();
  // 第一次请求前会把会话级投影（用户消息 id、补充条目）回放一次，这是打开会话的一次性成本；
  // 这里量的是两次请求之间的读取量：第一轮收尾、第二轮开头和第二次 contextInput。
  const readsAtRequest: number[] = [];
  await runToolStreamFixture({ session, terminalOnly: true, followup: true, contextSources: new ContextSourceRegistry(), onRequest: () => { readsAtRequest.push(history.eventsRead); } });
  expect(readsAtRequest).toHaveLength(2);
  return readsAtRequest[1]! - readsAtRequest[0]!;
}

it("reads the same number of archived events per request for 1k and 10k event sessions", async () => {
  const small = await historyReadsPerRequest(1_000);
  const large = await historyReadsPerRequest(10_000);
  expect(large).toBe(small);
  expect(small).toBeLessThanOrEqual(16);
}, 60_000);
