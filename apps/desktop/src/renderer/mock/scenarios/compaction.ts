import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { requireSession, sessionProjection, type MockSession } from "../mock-db";
import { lastRunId, seedSession } from "./seed";

const TOPICS = ["游标分页", "列表缓存", "空状态", "错误重试", "加载更多", "排序", "筛选", "滚动定位"];
const SUMMARY = ["## 目标", "- 会话列表改成游标分页", "", "## 已完成", "- `listPage` 改为按 `cursor` 取下一页", "- 列表缓存按工作区分组", "", "## 待办", "- 滚动定位与加载更多的边界"].join("\n");

function turns(count: number, offset = 0): [string, string][] {
  return Array.from({ length: count }, (_, index) => {
    const topic = TOPICS[(index + offset) % TOPICS.length];
    return [`第 ${index + offset + 1} 轮：「${topic}」还要改哪里？`, `「${topic}」需要改 ${index % 3 + 1} 处，已经列在计划里。`];
  });
}

/** 在 `afterMessages` 条消息之后插一次已提交的压缩事务，事件挂在下一条消息之前写入 journal。 */
function insertCompaction(session: MockSession, afterMessages: number): void {
  const compactionId = "mock-compaction-1";
  const next = session.messages[afterMessages];
  if (!next) throw new Error("Compaction needs a message after it.");
  const sources = session.messages.slice(0, afterMessages).map((_, index) => index);
  session.messages[afterMessages] = {
    ...next,
    events: [
      { type: "compaction/start", data: { compactionId, start: 0, end: afterMessages } },
      { type: "compaction/summary", data: { compactionId, summaryDigest: "mock" } },
      { type: "surface/replaced", data: { compactionId, sourceEventSeqs: sources }, surface: { kind: "replace", start: 0, end: afterMessages, node: { kind: "user", messageId: "mock-compaction-summary", content: SUMMARY }, sourceEventSeqs: sources } },
      { type: "compaction/end", data: { compactionId, summaryDigest: "mock", durationMs: 23_000, trigger: "auto", beforeTokens: 182_400, afterTokens: 9_100, beforeEstimated: true } },
      ...(next.events ?? []),
    ],
  };
}

/**
 * 上下文压缩三态：已完成（48 条后压缩，带 token 与「在轨迹中查看」）、进行中（打开后一直在压缩）、失败（打开后压缩失败）。
 * 进行中、失败只在打开会话时由流式事件推出来，不写 journal。
 */
export function compactionScenario(clock: MockClock): MockHandlers | void {
  const { db } = clock;
  const failed = seedSession(db, { title: "压缩失败", minutesAgo: 30, turns: turns(3) });
  const running = seedSession(db, { title: "压缩进行中", minutesAgo: 20, turns: turns(3) });
  const completed = seedSession(db, { title: "会话列表改游标分页", minutesAgo: 1, turns: [...turns(24), ...turns(2, 24)] });
  insertCompaction(completed, 48);
  const started = new Set<string>();
  const play = (session: MockSession, outcome: "running" | "failed") => {
    const sessionId = session.id;
    const agentRunId = lastRunId(session);
    clock.emit("agentStream", { type: "agent_run_started", sessionId, agentRunId });
    clock.emit("agentStream", { type: "context_compaction_started", sessionId, agentRunId, startedAt: new Date(Date.now() - 12_000).toISOString() });
    if (outcome === "failed") {
      clock.schedule(() => clock.emit("agentStream", { type: "context_compaction_failed", sessionId, agentRunId, error: { code: "TEST", message: "模型请求超时，上下文没有变化", recoverable: true } }), 400);
    }
  };
  return {
    sessions: {
      getPage: async ({ sessionId }) => {
        if (!started.has(sessionId) && (sessionId === running.id || sessionId === failed.id)) {
          started.add(sessionId);
          clock.schedule(() => play(sessionId === running.id ? running : failed, sessionId === running.id ? "running" : "failed"), 300);
        }
        return sessionProjection(requireSession(db, sessionId));
      },
    },
  };
}
