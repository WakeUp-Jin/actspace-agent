import type { RuntimeJsonValue, RuntimeTrajectoryNode } from "@actspace/shared/runtime-v2";
import type { RequestLiveOutput } from "@actspace/client/live";
import type { TrajectoryCell, TrajectoryRecord, TrajectorySourceBlock } from "./contract";
import { dataOf, pick, sourceBlocks, valueText } from "./node-data";

/**
 * Streaming split (DSH `finalized` + `streamingCells`): the call still streaming keeps an empty placeholder
 * in the settled layout (builder.ts, one per open request), and its content comes from the live run state
 * (spec agent-spec-live-assistant-stream §6). Old Sessions' chunks are still folded by the builder.
 */

/** Chunk group key, shared with the builder: the message id, then the request, then a per-session fallback. */
export function chunkKey(node: RuntimeTrajectoryNode): string {
  const data = dataOf(node);
  const requestId = pick(data, ["requestId"]);
  return pick(data, ["messageId"]) ?? (requestId === null ? `${node.sessionId}:partial` : `request:${requestId}`);
}

/** The open chunk group an `assistant/message` closes. */
export function closedKey(
  node: RuntimeTrajectoryNode,
  open: ReadonlyMap<string, readonly RuntimeTrajectoryNode[]>,
): string | undefined {
  const data = dataOf(node);
  const messageId = pick(data, ["messageId"]);
  const requestId = pick(data, ["requestId"]);
  if (messageId !== null && open.has(messageId)) return messageId;
  if (requestId !== null && open.has(`request:${requestId}`)) return `request:${requestId}`;
  // A thrown provider stream can finalize with a fresh messageId. The exact
  // request identity still ties its observed chunks to that terminal reply.
  if (requestId === null || (data.finishReason !== "failed" && data.finishReason !== "aborted")) return undefined;
  for (const [key, list] of open)
    if (list[0] !== undefined && pick(dataOf(list[0]), ["requestId"]) === requestId) return key;
  return undefined;
}

/** Content folded from an old Session's chunks. */
export type LiveContent = {
  text: string;
  thinking: string;
  readonly calls: Map<string, { readonly toolName: string | null; content: string }>;
  readonly sequences: number[];
  readonly chunks: RuntimeJsonValue[];
};

export const emptyLiveContent = (): LiveContent => ({
  text: "",
  thinking: "",
  calls: new Map(),
  sequences: [],
  chunks: [],
});

/** Fold `chunks[from..]` into `content`: message text, reasoning, and tool-argument deltas per callId. */
export function appendChunks(content: LiveContent, chunks: readonly RuntimeTrajectoryNode[], from = 0): LiveContent {
  for (let index = from; index < chunks.length; index += 1) {
    const node = chunks[index];
    const data = dataOf(node);
    content.sequences.push(node.eventSeq);
    content.chunks.push(node.data);
    if (data.kind === "reasoning-delta") content.thinking += valueText(data.content);
    else if (data.kind === "tool-call-delta") {
      const callId = pick(data, ["callId"]) ?? "";
      const call = content.calls.get(callId);
      if (call === undefined)
        content.calls.set(callId, { toolName: pick(data, ["name"]), content: valueText(data.content) });
      else call.content += valueText(data.content);
    } else content.text += valueText(data.delta ?? data.content);
  }
  return content;
}

type LiveFields = Pick<
  TrajectoryRecord,
  "summary" | "preview" | "raw" | "outputDetail" | "sourceBlocks" | "thinkingDetail" | "sourceSequences"
>;

/** The assistant record fields folded from an old Session's chunks. */
export function liveFields(content: LiveContent): LiveFields {
  const toolCalls: TrajectorySourceBlock[] = [...content.calls].map(([callId, call]) => ({
    type: "tool-call",
    content: call.content,
    ...(callId ? { callId } : {}),
    ...(call.toolName ? { toolName: call.toolName } : {}),
  }));
  return {
    summary: content.text || content.thinking,
    preview: content.text || content.thinking,
    raw: { chunks: [...content.chunks] },
    outputDetail: content.text || null,
    sourceBlocks: [...sourceBlocks(content.thinking, "reasoning"), ...sourceBlocks(content.text), ...toolCalls],
    thinkingDetail: content.thinking || null,
    sourceSequences: [...content.sequences],
  };
}

/** Request id → message id of every request the live run streams; the builder gives their placeholders that id. */
export function liveMessageIds(outputs: ReadonlyMap<string, RequestLiveOutput>): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  for (const [requestId, output] of outputs) if (output.messageId !== null) ids.set(requestId, output.messageId);
  return ids;
}

/** Changes only when a request starts streaming or names its message, so the settled layer rebuilds that rarely. */
export function liveMessageIdsKey(outputs: ReadonlyMap<string, RequestLiveOutput>): string {
  return [...outputs].map(([requestId, output]) => `${requestId}=${output.messageId ?? ""}`).join("\n");
}

/** The placeholder cell with the live output merged in. */
export function withLiveOutput(cell: TrajectoryCell, output: RequestLiveOutput): TrajectoryCell {
  const toolCalls: TrajectorySourceBlock[] = [...output.calls].map(([callId, call]) => ({
    type: "tool-call",
    content: "",
    callId,
    toolName: call.toolName,
  }));
  return {
    ...cell,
    record: {
      ...cell.record,
      summary: output.text || output.thinking,
      preview: output.text || output.thinking,
      raw: {
        requestId: cell.record.requestId,
        messageId: output.messageId,
        text: output.text,
        thinking: output.thinking,
        calls: [...output.calls].map(([callId, call]) => ({ callId, toolName: call.toolName })),
      },
      outputDetail: output.text || null,
      sourceBlocks: [...sourceBlocks(output.thinking, "reasoning"), ...sourceBlocks(output.text), ...toolCalls],
      thinkingDetail: output.thinking || null,
    },
  };
}

/** Streaming cells by record id: each placeholder whose request the live run is streaming. */
export function streamingCells(
  cells: readonly TrajectoryCell[],
  outputs: ReadonlyMap<string, RequestLiveOutput>,
): ReadonlyMap<string, TrajectoryCell> {
  const result = new Map<string, TrajectoryCell>();
  if (outputs.size === 0) return result;
  for (const cell of cells) {
    if (cell.record.placeholder !== true || cell.record.requestId === null) continue;
    const output = outputs.get(cell.record.requestId);
    if (output !== undefined) result.set(cell.recordId, withLiveOutput(cell, output));
  }
  return result;
}
