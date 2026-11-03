import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { MARKDOWN_SHOWCASE_REPLY, networkBatches } from "../markdown-fixture";
import { requireSession, sessionProjection } from "../mock-db";
import { playReply } from "../stream-player";
import { lastRunId, seedSession } from "./seed";

const QUESTION = "流式输出的时候回复越长越卡，帮我看看 MarkdownProse 问题出在哪，顺手改掉。";

/**
 * 聊天区 Markdown 全元素（执行计划 T27）：
 * - 「Markdown 历史回复」：同一条回复已经完整落盘，用来看折叠、公式、图片等定稿效果；
 * - 「Markdown 流式回放」：打开后按真实网络节奏分批流出同一条回复，结束后落盘，用来看流式效果和逐帧稳定性。
 */
export function markdownScenario(clock: MockClock): MockHandlers | void {
  const { db } = clock;
  seedSession(db, { title: "Markdown 历史回复", minutesAgo: 30, turns: [[QUESTION, MARKDOWN_SHOWCASE_REPLY]] });
  const session = seedSession(db, { title: "Markdown 流式回放", minutesAgo: 1, turns: [[QUESTION, null]] });
  let started = false;
  return {
    sessions: {
      getPage: async ({ sessionId }) => {
        if (sessionId === session.id && !started) {
          started = true;
          const batches = networkBatches(MARKDOWN_SHOWCASE_REPLY);
          clock.schedule(() => playReply(clock, { sessionId, agentRunId: lastRunId(session), text: MARKDOWN_SHOWCASE_REPLY, batches }), 500);
        }
        return sessionProjection(requireSession(db, sessionId));
      },
    },
  };
}
