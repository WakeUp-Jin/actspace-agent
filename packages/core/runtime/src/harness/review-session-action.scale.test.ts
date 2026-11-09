import { expect, it } from "vitest";
import { reviewConversation } from "@actspace/auto-review";
import { syntheticJournal } from "@actspace/session-journal/testing";
import type { SessionHandle } from "@actspace/session-persistence";
import { reviewSessionAction } from "./review-session-action.js";

// 规模测试（perf-memory-conventions.md §8）：一次自动审查从归档历史读的事件数不随会话长度增长。
// 之前每次审批都 `[...iterateEvents()]` 复制整份日志再倒找工具调用（perf-backlog P1，长会话上一次审批约 1.3 GB 分配）。
// 审查语义不变：压缩后仍交原始对话，所以首次审查要回放一次（打开会话的一次性成本），这里量的是之后每次审查的读取量。

const SOURCE = { ownerPluginId: "@actspace/core" } as const;

function reviewCase(count: number) {
  // 正文很短、每轮工具调用多：10k 事件的原始对话仍在审查上下文 64k 字符上限之内，审查才会真的发出去。
  const { journal, history } = syntheticJournal(count, { textLength: 1, toolCallsPerTurn: 8 });
  const session = { header: { sessionId: "scale" }, journal } as unknown as SessionHandle;
  const reviews: unknown[][] = [];
  const reviewer = { review: async (input: { snapshot: { conversation: unknown[] } }) => { reviews.push(input.snapshot.conversation); return { approved: true }; } };
  const append = (type: string, data: Record<string, unknown>) => journal.append({ type, eventVersion: 1, source: SOURCE, data: data as never, surface: null });
  append("turn/start", { turnId: "turn-review" });
  append("step/start", { turnId: "turn-review", stepId: "step-review" });
  const review = async (callId: string) => {
    append("tool/call", { callId, name: "write_file", agentRunId: "run", turnId: "turn-review", stepId: "step-review", args: { path: "a.ts" } });
    const before = history.eventsRead;
    await reviewSessionAction(session, reviewer as never, { callId, model: "review", action: { path: "a.ts" }, workspaceRoot: "/fixture", signal: new AbortController().signal } as never);
    return history.eventsRead - before;
  };
  return { journal, history, review, reviews };
}

it("reads the same number of archived events per review for 1k and 10k event sessions", async () => {
  const small = reviewCase(1_000);
  const large = reviewCase(10_000);
  await small.review("review-1");
  await large.review("review-1");
  const smallSecond = await small.review("review-2");
  const largeSecond = await large.review("review-2");
  expect(largeSecond).toBe(smallSecond);
  expect(smallSecond).toBeLessThanOrEqual(16);
  // 增量折叠出的审查对话和整份重算一致：原始消息全部保留，工具调用只留最近 24 条。
  expect(large.reviews[1]).toEqual(reviewConversation(large.journal.readEvents()));
  const conversation = large.reviews[1] as { role?: string; content?: string; seq: number }[];
  expect(conversation.find(item => item.role === "user")).toMatchObject({ seq: 2, content: "0 x" });
}, 60_000);
