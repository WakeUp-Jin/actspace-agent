import { describe, expect, expectTypeOf, it } from "vitest";
import { coreEvent, type CoreEventDataMap, type CoreEventType, type RuntimeJsonValue, type SessionEventCandidateV1 } from "@actspace/shared/runtime-v2";

/**
 * 类型层校验：`coreEvent` 只接受 `CoreEventDataMap` 里登记的事件名和字段。
 * shared 的测试不参与 tsc，所以这组断言放在 desktop（renderer tsconfig 会检查它）。
 * 带 `@ts-expect-error` 的那几行哪天能编译通过了，`pnpm typecheck` 会报这条指令没有用到。
 * 指令只管紧跟着的那一行：参数折成多行时，要写在出错的那个字段上面，不能写在整条调用上面。
 */
describe("core event builder types", () => {
  it("accepts the registered shapes and returns a journal candidate", () => {
    expectTypeOf(coreEvent("turn/start", { turnId: "t", agentRunId: "r", mode: "agent", modeRevision: 0 })).toEqualTypeOf<SessionEventCandidateV1>();
    expectTypeOf(coreEvent("user/message", { messageId: "m", agentRunId: "r", content: "hi" }, { surface: { kind: "append" } })).toEqualTypeOf<SessionEventCandidateV1>();
    // 每种事件的 data 都能直接当 JSON 用，构造函数里不需要类型断言。
    expectTypeOf<CoreEventDataMap[CoreEventType]>().toMatchTypeOf<RuntimeJsonValue>();
  });

  it("rejects unknown event names and wrong fields at compile time", () => {
    const build = () => [
      // @ts-expect-error 没登记的事件名
      coreEvent("turn/begin", { turnId: "t" }),
      // @ts-expect-error 字段名写错
      coreEvent("turn/end", { turnId: "t", reasn: "completed" }),
      // @ts-expect-error 少了必填的 stepId
      coreEvent("step/end", { turnId: "t", reason: "completed" }),
      // @ts-expect-error 取值不在登记的范围内
      coreEvent("turn/end", { turnId: "t", reason: "done" }),
      coreEvent("background/task", {
        op: "prune",
        taskId: "t",
        prunedAt: "2026-01-01T00:00:00.000Z",
        reason: "session-cap",
        // @ts-expect-error status 属于 settle，不属于 prune
        status: "lost",
      }),
      coreEvent("llm/auxiliary-start", {
        sessionId: "s",
        purpose: "session-title",
        // @ts-expect-error 会话标题的辅助请求不带工具调用的 id
        callId: "c",
        logicalRequestId: "l",
        attemptId: "a",
        attempt: 1,
        routeId: "r",
        model: "m",
        startedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];
    // 类型挡不住的调用（比如来自没有类型检查的代码）照样构造得出来，写入时由 codec 拒绝。
    expect(build()).toHaveLength(6);
  });
});
