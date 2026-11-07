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
  /**
   * 渲染进程重载后重新挂上的 run：durable 里已有的内容要保留，live 只有实时底稿起的未定稿正文
   * 和重新收到的工具块（见 mergeTranscript 的去重）。
   */
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
  let visibleLive = live.blocks.filter((block) => block.kind !== "user" || !durableUserKeys.has(block.renderKey ?? block.id));
  if (live.recovered && visibleLive.length > 0) visibleLive = recoveredLiveBlocks(persisted, visibleLive, live.runId);
  const withLive = visibleLive.length === 0 ? persisted : [...persisted, ...visibleLive];
  return local.compactionFailure && !local.isStreaming ? [...withLive, local.compactionFailure] : withLive;
}

const isText = (block: MessageBlock): block is Extract<MessageBlock, { kind: "assistant" | "thinking" }> => block.kind === "assistant" || block.kind === "thinking";

/**
 * 恢复的 run 里 durable 显示全部已定稿内容，live 的正文从实时底稿开始。规则与 Web 端一致（apps/web 的 transcript-model）：
 * - 正文 / 思考：消息定稿后 durable 里出现同一 run、同样内容的块，live 的这一块不再显示；
 * - live 块的序号从底稿重新数，会与 durable 同一 run 的 renderKey 撞上，撞上的换一个 key。
 */
function recoveredLiveBlocks(persisted: readonly MessageBlock[], live: readonly MessageBlock[], runId: string | null): MessageBlock[] {
  const settled = new Set(persisted.filter((block) => isText(block) && (!runId || block.runId === runId)).map((block) => `${block.kind}:${(block as { content: string }).content.trim()}`));
  const keys = new Set(persisted.map((block) => block.renderKey ?? block.id));
  const visible: MessageBlock[] = [];
  for (const block of live) {
    if (isText(block) && settled.has(`${block.kind}:${block.content.trim()}`)) continue;
    const key = block.renderKey ?? block.id;
    visible.push(isText(block) && keys.has(key) ? { ...block, id: `${block.id}:live`, ...(block.renderKey ? { renderKey: `${block.renderKey}:live` } : {}) } : block);
  }
  return visible;
}
