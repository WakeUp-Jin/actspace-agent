import { expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { syntheticJournal } from "@actspace/session-journal/testing";
import { SessionStore, type SessionHandle } from "@actspace/session-persistence";
import type { SessionStorage } from "@actspace/session-storage";
import { RuntimeSessionController } from "./session-controller.js";

// 规模测试（perf-memory-conventions.md §8）：打开中的会话，读一屏对话、往前翻一页、展开一条工具详情，
// 从归档历史读的事件数不随会话长度增长；打开后的第一次读把日志过一遍，不是两遍。
// 之前展开一条工具详情要把整份日志读出来再按 callId 过滤；第一次读为读模型过一遍日志、为轮次边界再过一遍。

const SOURCE = { ownerPluginId: "@actspace/core" } as const;
/** 内存里只留末尾 64 条：一屏 20 轮的大部分要从归档读，读取量才量得出来。 */
const RETAINED = 64;

function liveCase(count: number) {
  const registry = createCoreCodecRegistry();
  // 不压缩：每一屏的事件数只由轮数决定，两种规模的读取量可以逐条相等地比。
  const { journal, history, events } = syntheticJournal(count, { retainedEvents: RETAINED, compactEvery: 0 });
  const header = createSessionHeader({
    sessionId: "scale",
    createdAt: "2026-11-07T00:00:00.000Z",
    cwd: "/fixture",
    lineage: null,
    createdWith: {
      profileId: "test",
      runtimeContractVersion: "1",
      manifestDigest: "test",
      plugins: [],
      codecSetDigest: registry.digest,
    },
  });
  const session = {
    header,
    journal,
    get acceptedSeq() {
      return journal.lastSeq;
    },
    get durableSeq() {
      return journal.lastSeq;
    },
  } as unknown as SessionHandle;
  // 打开中的会话只读内存里的日志和它的归档历史；碰到存储就是走错了路。
  const storage = new Proxy(
    { identity: Symbol("scale") },
    {
      get: (target, key) =>
        key === "identity"
          ? target.identity
          : () => {
              throw new Error(`storage.${String(key)} must not be used for a live Session`);
            },
    },
  ) as unknown as SessionStorage;
  const controller = new RuntimeSessionController(
    { dataRoot: "/fixture", runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [] },
    new SessionStore({ registry }, storage),
  );
  controller.registerExternal(session);
  const reading = async <T>(action: () => Promise<T>) => {
    const before = history.eventsRead;
    const result = await action();
    return { result, read: history.eventsRead - before };
  };
  const appendTurn = (turnId: string) => {
    const append = (type: string, data: Record<string, unknown>, surface: "append" | null = null) =>
      journal.append({
        type,
        eventVersion: 1,
        source: SOURCE,
        data: data as never,
        surface: surface ? { kind: surface } : null,
      });
    const stepId = `step-${turnId}`;
    append("turn/start", { turnId });
    append("step/start", { turnId, stepId });
    append("user/message", { messageId: `user-${turnId}`, content: "next" }, "append");
    append("tool/call", { callId: `call-${turnId}`, name: "read_file", turnId, stepId, args: { path: "next.ts" } });
    append(
      "tool/result",
      {
        callId: `call-${turnId}`,
        name: "read_file",
        status: "completed",
        modelOutput: [{ type: "text", text: "next" }],
      },
      "append",
    );
    append("step/end", { turnId, stepId, status: "completed" });
    append("turn/end", { turnId, status: "completed" });
  };
  return { controller, events, archived: events.length - RETAINED, reading, appendTurn };
}

it("reads the same number of archived events per page and per tool detail for 1k and 10k event sessions", async () => {
  const small = liveCase(1_000);
  const large = liveCase(10_000);
  const tail = { sessionId: "scale" };

  // 第一次读：读模型和位置索引用同一遍读出的事件建好，比之后每次读只多出「整份归档过一遍」。
  const smallFirst = await small.reading(() => small.controller.readProjection(tail));
  const largeFirst = await large.reading(() => large.controller.readProjection(tail));
  const smallAgain = await small.reading(() => small.controller.readProjection(tail));
  const largeAgain = await large.reading(() => large.controller.readProjection(tail));
  expect(smallFirst.read - smallAgain.read).toBe(small.archived);
  expect(largeFirst.read - largeAgain.read).toBe(large.archived);

  // 之后每次读一屏：只读这一屏里不在内存的那部分。
  expect(largeAgain.read).toBe(smallAgain.read);
  expect(smallAgain.read).toBe(smallAgain.result.window.events.length - RETAINED);
  expect(largeAgain.result.window).toEqual(largeFirst.result.window);

  // 往前翻一页：只读那 20 轮。
  const smallOlder = await small.reading(() =>
    small.controller.readProjection({ sessionId: "scale", beforeSeq: smallAgain.result.window.beforeSeq! }),
  );
  const largeOlder = await large.reading(() =>
    large.controller.readProjection({ sessionId: "scale", beforeSeq: largeAgain.result.window.beforeSeq! }),
  );
  expect(largeOlder.read).toBe(smallOlder.read);
  expect(smallOlder.read).toBe(smallOlder.result.window.events.length);
  expect(largeOlder.result.window.turnOffset).toBe(largeAgain.result.window.turnOffset - 20);
  expect(largeOlder.result.window.throughJournalSeq).toBe(largeAgain.result.window.fromSeq - 1);

  // 展开一条早已归档的工具详情：只读这次调用自己的两条事件。
  const smallDetail = await small.reading(() => small.controller.browseToolDetail("scale", "call-3-1"));
  const largeDetail = await large.reading(() => large.controller.browseToolDetail("scale", "call-3-1"));
  expect(largeDetail.read).toBe(smallDetail.read);
  expect(smallDetail.read).toBe(2);
  expect(largeDetail.result.journal).toEqual(
    large.events.filter((event) => (event.data as { callId?: string }).callId === "call-3-1"),
  );
  expect(largeDetail.result.journal.map((event) => event.type)).toEqual(["tool/call", "tool/result"]);

  // 新写入一轮之后再读：索引只补新事件，窗口往后挪一轮，从归档读的不会比之前多。
  small.appendTurn("turn-next");
  large.appendTurn("turn-next");
  const smallNext = await small.reading(() => small.controller.readProjection(tail));
  const largeNext = await large.reading(() => large.controller.readProjection(tail));
  expect(largeNext.read).toBe(smallNext.read);
  expect(smallNext.read).toBeLessThan(smallAgain.read);
  expect(largeNext.result.window.turnOffset).toBe(largeAgain.result.window.turnOffset + 1);
  expect(largeNext.result.window.events.at(-1)?.type).toBe("turn/end");

  // 新一轮里的工具调用也进了索引；它的事件还在内存里，不读归档。
  const smallNew = await small.reading(() => small.controller.browseToolDetail("scale", "call-turn-next"));
  const largeNew = await large.reading(() => large.controller.browseToolDetail("scale", "call-turn-next"));
  expect(smallNew.read).toBe(0);
  expect(largeNew.read).toBe(0);
  expect(largeNew.result.journal.map((event) => event.type)).toEqual(["tool/call", "tool/result"]);
}, 60_000);
