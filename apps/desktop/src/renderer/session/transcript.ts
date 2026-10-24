import { createMessageBlocks, type MessageBlock, type SessionEvent } from "@actspace/shared";

// 会话视图的消息序列 = durable 块 + live 块 + 本地块（14 S5）。
// durable 与 live 的归属按块上的 runId 判断（T11–T13），不再解析 id / renderKey 字符串。

export type DurableTranscript = {
  /** cell 投影出的块（`SessionRecord.messageBlocks`）；为空时退回用 events 现算。 */
  readonly blocks: readonly MessageBlock[] | undefined;
  readonly events: readonly SessionEvent[];
};

export type LiveTranscript = {
  readonly blocks: readonly MessageBlock[];
  /** 当前会话正在显示的 run。 */
  readonly runId: string | null;
  /** 渲染进程重载后重新挂上的 run：live 只有重新收到的部分，durable 里已有的内容要保留。 */
  readonly recovered: boolean;
};

export type LocalTranscript = {
  /** 压缩失败没有 durable 事件，运行结束后按会话保留分隔线。 */
  readonly compactionFailure: MessageBlock | undefined;
  readonly isStreaming: boolean;
};

// live 块里除了这些，都是工具块（toolEntryToBlock 产出）。todo 块虽由 toolEntryToBlock 产出，但旧实现
// 只认 id 含 `:tool:` 的块，todo 的 id 是 `turn:<run>:todo`，恢复时不隐藏 durable 的 todo；保持一致。
const NON_TOOL_KINDS: ReadonlySet<MessageBlock["kind"]> = new Set(["user", "assistant", "thinking", "status", "error", "context_compaction", "workspace_preparation", "todo", "background_notice"]);

/**
 * durable 部分：正在流式输出的 run 由 live 块显示，durable 里同一 run 的块先隐藏，run 完成后
 * 再由 durable 接手（同一 renderKey 复用 DOM）。恢复的 run 只隐藏 live 里已有的工具块。
 */
export function durableTranscript(durable: DurableTranscript, live: LiveTranscript): MessageBlock[] {
  const streamingRunId = live.blocks.length > 0 && !live.recovered ? live.runId : null;
  const fromRecord = durable.blocks as MessageBlock[] | undefined;
  if (fromRecord && fromRecord.length > 0) {
    if (live.recovered) {
      const liveToolKeys = new Set(live.blocks.filter((block) => !NON_TOOL_KINDS.has(block.kind)).map((block) => block.id));
      return fromRecord.filter((block) => !liveToolKeys.has(block.renderKey ?? block.id));
    }
    return streamingRunId ? fromRecord.filter((block) => block.runId !== streamingRunId) : fromRecord;
  }
  const visibleEvents = streamingRunId ? durable.events.filter((event) => event.agentRunId !== streamingRunId) : durable.events;
  return createMessageBlocks(visibleEvents as SessionEvent[]);
}

/** 合并后的完整序列：durable 在前，live 接在后面，最后是本地块。 */
export function mergeTranscript(durable: DurableTranscript, live: LiveTranscript, local: LocalTranscript): MessageBlock[] {
  const persisted = durableTranscript(durable, live);
  // 恢复时 durable 的 user 消息和任务快照生成的占位 user 块可能同时存在：按身份去重，保留 durable 的（带元数据）。
  const durableUserKeys = new Set(persisted.filter((block) => block.kind === "user").map((block) => block.renderKey ?? block.id));
  const visibleLive = live.blocks.filter((block) => block.kind !== "user" || !durableUserKeys.has(block.renderKey ?? block.id));
  const withLive = visibleLive.length === 0 ? persisted : [...persisted, ...visibleLive];
  return local.compactionFailure && !local.isStreaming ? [...withLive, local.compactionFailure] : withLive;
}
