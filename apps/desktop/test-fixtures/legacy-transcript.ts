import { createMessageBlocks, type MessageBlock } from "@actspace/shared";
import type { DurableTranscript, LiveTranscript, LocalTranscript } from "../src/renderer/session/transcript";

/**
 * 14 T14 的对照实现：逐字搬自 T13 时 App 的 `persistedMessages` / `messages` 两个 useMemo
 * （按 renderKey 前缀和 `:tool:` 子串判断归属）。只作测试对照，`mergeTranscript` 必须与它深度相等。
 * 放在 src/renderer 之外，T15 的「renderer 不再解析字符串」grep 才能保持为 0。
 */
export function legacyMergeTranscript(durable: DurableTranscript, live: LiveTranscript, local: LocalTranscript): MessageBlock[] {
  const persistedEvents = durable.events;
  const streamingBlocks = live.blocks;
  const activeAgentRunId = live.runId;
  const isRecoveredRun = live.recovered;
  const persistedMessages = (() => {
    const streamingAgentRunId = streamingBlocks.length > 0 && !isRecoveredRun ? activeAgentRunId : null;
    const streamingTurnEventIds = streamingAgentRunId
      ? new Set(
          persistedEvents
            .filter((event) => event.agentRunId === streamingAgentRunId)
            .map((event) => event.id),
        )
      : null;
    const fromRecord = durable.blocks as MessageBlock[] | undefined;
    if (fromRecord && fromRecord.length > 0) {
      if (isRecoveredRun) {
        const recoveredToolKeys = new Set(streamingBlocks.filter(block => block.id.includes(":tool:")).map(block => block.id));
        return fromRecord.filter(block => !recoveredToolKeys.has(block.renderKey ?? block.id));
      }
      return streamingTurnEventIds
        ? fromRecord.filter((block) => !streamingTurnEventIds.has(block.id) && !block.renderKey?.startsWith(`turn:${streamingAgentRunId}:`))
        : fromRecord;
    }

    const visibleEvents = streamingAgentRunId
      ? persistedEvents.filter((event) => event.agentRunId !== streamingAgentRunId)
      : persistedEvents;
    const fromEvents = createMessageBlocks([...visibleEvents]);
    if (fromEvents.length > 0) return fromEvents;
    return [];
  })();

  const { compactionFailure, isStreaming, bashUpdates: bashTaskUpdates } = local;
  const durableUserKeys = new Set(persistedMessages.filter(block => block.kind === "user").map(block => block.renderKey ?? block.id));
  const visibleStreaming = streamingBlocks.filter(block => block.kind !== "user" || !durableUserKeys.has(block.renderKey ?? block.id));
  const withStreaming = visibleStreaming.length === 0 ? persistedMessages : [...persistedMessages, ...visibleStreaming];
  const merged = compactionFailure && !isStreaming ? [...withStreaming, compactionFailure] : withStreaming;
  if (Object.keys(bashTaskUpdates).length === 0) return merged;
  return merged.map((block) => {
    if (block.kind !== "bash" || !block.backgroundTaskId) return block;
    const update = bashTaskUpdates[block.backgroundTaskId];
    if (!update) return block;
    return { ...block, backgroundStatus: update.status, exitCode: update.exitCode ?? block.exitCode };
  });
}
