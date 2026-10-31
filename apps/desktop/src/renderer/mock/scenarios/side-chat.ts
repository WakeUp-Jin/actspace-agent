import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { appendMockMessage, openMockSideChat, requireSession, sessionProjection } from "../mock-db";
import { playReply } from "../stream-player";
import { lastRunId, seedSession } from "./seed";

const SEED_NOW = Date.parse("2026-10-06T09:00:00.000Z");

const RUNNING_TEXT = [
  "继续看插件的卸载路径。",
  "",
  "1. `session/disposed` 时插件把自己注册的提示词移走。",
  "2. 运行中的轮结束之前，侧边对话不会复制这一轮。",
  "",
  "接着检查 runtime 重启后插件状态怎么恢复……",
].join("\n");

/**
 * 侧边对话：主会话三轮已完成、第四轮还在跑，下面已经有两个收起的侧边对话。
 * 从右侧面板再开一个，分隔线写「继承主会话 3 轮，不含进行中的第 4 轮」。
 */
export function sideChatScenario(clock: MockClock): MockHandlers | void {
  const { db } = clock;
  seedSession(db, { title: "梳理 preload 接口", minutesAgo: 60, turns: [["preload 现在有多少行？", "改造后约 30 行，只做 IPC 转发。"]] });
  const main = seedSession(db, {
    title: "梳理 runtime 插件加载",
    minutesAgo: 2,
    turns: [
      ["runtime 是怎么发现插件包的？", "从 `cordis.yml` 读插件列表，按顺序 `ctx.plugin()` 加载；每个插件包导出 `apply(ctx)`。"],
      ["插件能拿到会话事件吗？", "能。`session/created` 和 `session/disposed` 会带上 sessionId 和 lineage。"],
      ["系统提示词怎么注入？", "插件在 `session/created` 里注册提示词片段，组装请求时按注册顺序拼进去。"],
      ["再检查一下插件卸载时会不会漏清理。", null],
    ],
  });

  const seedSideChat = (title: string, question: string, answer: string, minutesAgo: number) => {
    const { session } = openMockSideChat(db, main.id);
    const runId = db.nextId("seed-run");
    appendMockMessage(db, session, "user", question, runId);
    appendMockMessage(db, session, "assistant", answer, runId);
    session.title = title;
    session.updatedAt = new Date(SEED_NOW - minutesAgo * 60_000).toISOString();
  };
  seedSideChat("Plan 模式下 bash 还能用吗？", "Plan 模式下 bash 还能用吗？", "（侧边对话）能跑只读命令，写文件和装依赖会被拦下。", 30);
  seedSideChat("ctx.plugin 和 ctx.inject 的区别", "cordis 的 ctx.plugin 和 ctx.inject 有什么区别？", "（侧边对话）`plugin` 加载一个插件；`inject` 声明依赖的服务，服务就绪后才调用 apply。", 8);

  let started = false;
  return {
    sessions: {
      getPage: async ({ sessionId }) => {
        if (sessionId === main.id && !started) {
          started = true;
          clock.schedule(() => playReply(clock, { sessionId, agentRunId: lastRunId(main), text: RUNNING_TEXT, chunkMs: 120, finish: false }), 300);
        }
        return sessionProjection(requireSession(db, sessionId));
      },
    },
  };
}
