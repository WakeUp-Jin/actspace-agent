import type { MockClock } from "./clock";
import { appendMockMessage, requireSession } from "./mock-db";

export type ReplyPlayback = {
  /** 停止回放，并以 `agent_run_aborted` 收尾（已经流出的文字不落盘）。 */
  abort(): void;
};

type ReplyOptions = {
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly text: string;
  /** 每段之间的间隔。 */
  readonly chunkMs?: number;
  /** false：流到最后一段后保持运行态，用于截图「流式中」的界面。 */
  readonly finish?: boolean;
};

/**
 * 按脚本回放一次 Agent 回复：`agent_run_started` → 若干 `assistant_text_delta` → 落盘并 `agent_run_finished`。
 * App 收到完成事件后重新 `sessions.getPage`，和 Electron 下是同一条路径。
 */
export function playReply(clock: MockClock, options: ReplyOptions): ReplyPlayback {
  const { sessionId, agentRunId, text, chunkMs = 60, finish = true } = options;
  const chunks = text.match(/[\s\S]{1,6}/g) ?? [];
  const messageId = clock.db.nextId("assistant-stream");
  const base = { sessionId, agentRunId, turnId: `${agentRunId}:turn-0`, llmCallId: `${agentRunId}:llm-0` };
  let cancel: (() => void) | null = null;
  let done = false;

  clock.emit("agentStream", { type: "agent_run_started", sessionId, agentRunId });
  const step = (index: number) => {
    if (index < chunks.length) {
      clock.emit("agentStream", { type: "assistant_text_delta", ...base, messageId, delta: chunks[index]! });
      cancel = clock.schedule(() => step(index + 1), chunkMs);
      return;
    }
    if (!finish) return;
    done = true;
    const message = appendMockMessage(clock.db, requireSession(clock.db, sessionId), "assistant", text, agentRunId);
    clock.emit("agentStream", { type: "agent_run_finished", sessionId, agentRunId, resultEventIds: [message.id] });
  };
  cancel = clock.schedule(() => step(0), chunkMs);

  return {
    abort() {
      if (done) return;
      done = true;
      cancel?.();
      clock.emit("agentStream", { type: "agent_run_aborted", sessionId, agentRunId });
    },
  };
}

export const MOCK_REPLY = [
  "这是浏览器 mock 模式的回复，没有连接真实模型。",
  "",
  "- 会话、工作区和设置都保存在内存里，刷新页面后重置。",
  "- 用 `?mock=streaming`、`?mock=long-session`、`?mock=approval-pending`、`?mock=remote-host` 切换场景。",
].join("\n");

/** 侧边对话里的回复：和主会话区分开，一眼能看出消息发到了哪边。 */
export const MOCK_SIDE_CHAT_REPLY = [
  "（侧边对话）这条回复只在右侧面板里，主会话看不到。",
  "",
  "我带着分叉时主会话的上下文回答；之后两边各聊各的，不会互相写回。",
].join("\n");
