import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { requireSession, sessionProjection } from "../mock-db";
import { playReply } from "../stream-player";
import { lastRunId, seedSession } from "./seed";

const STREAM_TEXT = [
  "好的，我先看一下 preload 现在暴露了哪些成员。",
  "",
  "1. 契约里一共 22 个域，preload 按契约生成方法，不再手写别名。",
  "2. 会话投影移到了 `renderer/api/sessions.ts`，preload 只做转发。",
  "3. 浏览器开发模式下由 mock bridge 提供同样的接口，App 不再有 mock 分支。",
  "",
  "接下来逐个检查调用方……",
].join("\n");

/** 流式中：打开会话后开始逐段输出，停在运行态，便于截图「生成中」的界面。 */
export function streamingScenario(clock: MockClock): MockHandlers | void {
  const { db } = clock;
  seedSession(db, { title: "梳理 preload 接口", minutesAgo: 40, turns: [["preload 现在有多少行？", "改造后约 30 行，只做 IPC 转发。"]] });
  const session = seedSession(db, {
    title: "检查 bridge 调用方",
    minutesAgo: 1,
    turns: [["帮我检查 renderer 里还有哪些地方直接访问 window.actspace。", null]],
  });
  let started = false;
  return {
    sessions: {
      getPage: async ({ sessionId }) => {
        if (sessionId === session.id && !started) {
          started = true;
          clock.schedule(() => playReply(clock, { sessionId, agentRunId: lastRunId(session), text: STREAM_TEXT, chunkMs: 90, finish: false }), 300);
        }
        return sessionProjection(requireSession(db, sessionId));
      },
    },
  };
}
