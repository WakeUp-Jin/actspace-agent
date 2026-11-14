import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { requireSession, sessionProjection } from "../mock-db";
import { lastRunId, seedSession } from "./seed";

const FIRST_THOUGHT = [
  "用户希望思考过程不要打扰阅读。现在的问题是正文一边流式输出，一边把下面的内容往下推，视线会被不断增长的文字带走。",
  "",
  "先看 ThinkingBlock 的展开状态。运行中默认展开，整轮回复完成后才收起，所以思考越长，占的高度越大。",
].join("\n");
const SECOND_THOUGHT = [
  "确认影响范围：render-message 里只有一处用到 ThinkingBlock，Web 端的 ThinkingRow 是独立实现。",
  "",
  "还要补一条测试：开启简化后，running 状态下不渲染正文节点。接下来逐个检查调用方……",
].join("\n");

/**
 * 思考进行中：打开会话后先流一段思考，接一次 Read，再流第二段思考并停在运行态。
 * 用来看「简化思考过程」开 / 关两种样子（设置 › 通用 › 对话显示），以及思考结束后的 `Thought for Ns`。
 */
export function thinkingScenario(clock: MockClock): MockHandlers | void {
  const { db } = clock;
  const session = seedSession(db, {
    title: "把思考过程做得安静一点",
    minutesAgo: 1,
    turns: [["思考的时候别把正文一路往下展开。", null]],
  });
  let started = false;
  return {
    sessions: {
      getPage: async ({ sessionId }) => {
        if (sessionId === session.id && !started) {
          started = true;
          clock.schedule(() => play(clock, sessionId, lastRunId(session)), 300);
        }
        return sessionProjection(requireSession(db, sessionId));
      },
    },
  };
}

function play(clock: MockClock, sessionId: string, agentRunId: string): void {
  const base = { sessionId, agentRunId, turnId: `${agentRunId}:turn-0`, llmCallId: `${agentRunId}:llm-0` };
  const toolCallId = `${agentRunId}:read-0`;
  const preview = {
    kind: "read" as const,
    filePath: "components/messages/ThinkingBlock.tsx",
    displayText: "Read components/messages/ThinkingBlock.tsx",
  };
  const think = (messageId: string, text: string, then: () => void) => {
    const chunks = text.match(/[\s\S]{1,4}/g) ?? [];
    const step = (index: number) => {
      if (index >= chunks.length) {
        then();
        return;
      }
      clock.emit("agentStream", {
        type: "assistant_thinking_delta",
        ...base,
        messageId,
        delta: chunks[index] as string,
      });
      clock.schedule(() => step(index + 1), 120);
    };
    step(0);
  };

  clock.emit("agentStream", { type: "agent_run_started", sessionId, agentRunId });
  think("thinking-mock-1", FIRST_THOUGHT, () => {
    clock.emit("agentStream", {
      type: "tool_started",
      ...base,
      toolCallId,
      toolName: "read_file",
      argsPreview: JSON.stringify({ path: preview.filePath }),
      preview,
    });
    clock.schedule(() => {
      clock.emit("agentStream", {
        type: "tool_finished",
        ...base,
        toolCallId,
        toolName: "read_file",
        resultEventId: `${toolCallId}:result`,
        isError: false,
        preview,
      });
      think("thinking-mock-2", SECOND_THOUGHT, () => {});
    }, 900);
  });
}
