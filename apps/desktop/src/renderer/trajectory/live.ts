import type { RuntimeV2JsonValue, RuntimeV2TrajectoryNode, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import type { TrajectoryCell, TrajectoryRecord, TrajectorySourceBlock } from "./contract";
import { dataOf, pick, sourceBlocks, valueText } from "./node-data";

/**
 * Streaming split (DSH `finalized` + `streamingCells`): the assistant that is still streaming keeps an
 * empty placeholder in the settled layout, and its content is accumulated chunk by chunk on the side.
 */

/** Chunk group key, shared with the builder: the message id, then the request, then a per-session fallback. */
export function chunkKey(node: RuntimeV2TrajectoryNode): string {
  const data = dataOf(node);
  const requestId = pick(data, ["requestId"]);
  return pick(data, ["messageId"]) ?? (requestId === null ? `${node.sessionId}:partial` : `request:${requestId}`);
}

/** The open chunk group an `assistant/message` closes. */
export function closedKey(node: RuntimeV2TrajectoryNode, open: ReadonlyMap<string, readonly RuntimeV2TrajectoryNode[]>): string | undefined {
  const data = dataOf(node);
  const messageId = pick(data, ["messageId"]);
  const requestId = pick(data, ["requestId"]);
  if (messageId !== null && open.has(messageId)) return messageId;
  if (requestId !== null && open.has(`request:${requestId}`)) return `request:${requestId}`;
  // A thrown provider stream can finalize with a fresh messageId. The exact
  // request identity still ties its observed chunks to that terminal reply.
  if (requestId === null || (data.finishReason !== "failed" && data.finishReason !== "aborted")) return undefined;
  for (const [key, list] of open) if (list[0] !== undefined && pick(dataOf(list[0]), ["requestId"]) === requestId) return key;
  return undefined;
}

/** Content folded from chunks. Mutable so the accumulator can append in place. */
export type LiveContent = {
  text: string;
  thinking: string;
  readonly calls: Map<string, { readonly toolName: string | null; content: string }>;
  readonly sequences: number[];
  readonly chunks: RuntimeV2JsonValue[];
};

export const emptyLiveContent = (): LiveContent => ({ text: "", thinking: "", calls: new Map(), sequences: [], chunks: [] });

/** Fold `chunks[from..]` into `content`: message text, reasoning, and tool-argument deltas per callId. */
export function appendChunks(content: LiveContent, chunks: readonly RuntimeV2TrajectoryNode[], from = 0): LiveContent {
  for (let index = from; index < chunks.length; index += 1) {
    const node = chunks[index]!;
    const data = dataOf(node);
    content.sequences.push(node.eventSeq);
    content.chunks.push(node.data);
    if (data.kind === "reasoning-delta") content.thinking += valueText(data.content);
    else if (data.kind === "tool-call-delta") {
      const callId = pick(data, ["callId"]) ?? "";
      const call = content.calls.get(callId);
      if (call === undefined) content.calls.set(callId, { toolName: pick(data, ["name"]), content: valueText(data.content) });
      else call.content += valueText(data.content);
    } else content.text += valueText(data.delta ?? data.content);
  }
  return content;
}

type LiveFields = Pick<TrajectoryRecord, "summary" | "preview" | "raw" | "outputDetail" | "sourceBlocks" | "thinkingDetail" | "sourceSequences">;

/** The assistant record fields that grow with each chunk. */
export function liveFields(content: LiveContent): LiveFields {
  const toolCalls: TrajectorySourceBlock[] = [...content.calls].map(([callId, call]) => ({
    type: "tool-call", content: call.content, ...(callId ? { callId } : {}), ...(call.toolName ? { toolName: call.toolName } : {}),
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

export type LiveGroup = {
  readonly key: string;
  readonly recordId: string;
  readonly chunks: readonly RuntimeV2TrajectoryNode[];
  readonly firstNonEmpty: RuntimeV2TrajectoryNode | null;
};

export type TrajectorySplit = {
  /** Unchanged while only live chunks grow; Journal events are append-only. */
  readonly settledKey: string;
  /** Streaming chunk groups by group key. */
  readonly live: ReadonlyMap<string, LiveGroup>;
  /** Settled nodes plus each live group's first and first non-empty chunk, which fix the placeholder. */
  settled(): RuntimeV2TrajectorySnapshot;
};

type OpenGroup = { chunks: RuntimeV2TrajectoryNode[]; firstNonEmpty: RuntimeV2TrajectoryNode | null; turn: string | null; callIds: Set<string> | null };

/**
 * A chunk group is live while no `assistant/message` has closed it and its turn has not ended. A group
 * whose tool-call deltas name a settled `tool/call` stays settled, since that tool links to its content.
 */
export function splitLiveChunks(snapshot: RuntimeV2TrajectorySnapshot): TrajectorySplit {
  const sorted = snapshot.nodes.every((node, index) => index === 0 || snapshot.nodes[index - 1]!.eventSeq <= node.eventSeq);
  const nodes = sorted ? snapshot.nodes : [...snapshot.nodes].sort((a, b) => a.eventSeq - b.eventSeq);
  const open = new Map<string, OpenGroup>();
  const lists = new Map<string, RuntimeV2TrajectoryNode[]>();
  const ended = new Set<string>();
  const toolCalls = new Set<string>();
  let activeTurn: string | null = null;
  let lastSettled = -1;
  for (const node of nodes) {
    const data = dataOf(node);
    if (node.eventType === "assistant/chunk") {
      const key = chunkKey(node);
      let group = open.get(key);
      if (group === undefined) {
        group = { chunks: [], firstNonEmpty: null, turn: pick(data, ["turnId", "turn"]) ?? activeTurn, callIds: null };
        open.set(key, group);
        lists.set(key, group.chunks);
      }
      group.chunks.push(node);
      if (group.firstNonEmpty === null && valueText(data.delta ?? data.content) !== "") group.firstNonEmpty = node;
      if (data.kind === "tool-call-delta") (group.callIds ??= new Set()).add(pick(data, ["callId"]) ?? "");
      continue;
    }
    lastSettled = node.eventSeq;
    if (node.eventType === "assistant/message") {
      const key = closedKey(node, lists);
      if (key !== undefined) { open.delete(key); lists.delete(key); }
      continue;
    }
    const turn = pick(data, ["turnId", "turn"]);
    if (node.eventType === "turn/start" && turn !== null) activeTurn = turn;
    if (node.eventType === "turn/end") {
      if (turn !== null) ended.add(turn);
      activeTurn = null;
    }
    if (node.eventType === "tool/call") {
      const callId = node.callId ?? pick(data, ["callId", "toolCallId"]);
      if (callId !== null) toolCalls.add(callId);
    }
  }

  const live = new Map<string, LiveGroup>();
  let dropped = 0;
  const signature: string[] = [];
  for (const [key, group] of open) {
    const first = group.chunks[0]!;
    const settled = (group.turn !== null && ended.has(group.turn)) || [...group.callIds ?? []].some(callId => toolCalls.has(callId));
    if (settled) {
      lastSettled = Math.max(lastSettled, group.chunks.at(-1)!.eventSeq);
      continue;
    }
    live.set(key, { key, recordId: `${first.sessionId}:record:assistant:${key}`, chunks: group.chunks, firstNonEmpty: group.firstNonEmpty });
    dropped += group.chunks.length - (group.firstNonEmpty === null || group.firstNonEmpty === first ? 1 : 2);
    signature.push(`${key}@${first.eventSeq}/${group.firstNonEmpty?.eventSeq ?? "-"}`);
  }
  const history = snapshot.history;
  const settledKey = [
    snapshot.sessionId, history?.fromSeq ?? "", history?.turnOffset ?? "", history?.requestOffset ?? "",
    nodes.length - dropped, nodes[0]?.eventSeq ?? "", lastSettled, ...signature,
  ].join("\u0000");

  return {
    settledKey,
    live,
    settled: () => {
      if (live.size === 0) return sorted ? snapshot : { ...snapshot, nodes };
      const drop = new Set<RuntimeV2TrajectoryNode>();
      for (const group of live.values()) {
        for (const chunk of group.chunks) if (chunk !== group.chunks[0] && chunk !== group.firstNonEmpty) drop.add(chunk);
      }
      return { ...snapshot, nodes: nodes.filter(node => !drop.has(node)) };
    },
  };
}

/** Keeps each live group's content and folds in only the chunks that arrived since the last update. */
export function createLiveAccumulator() {
  const states = new Map<string, { first: number; count: number; content: LiveContent }>();
  let processed = 0;
  return {
    /** Chunks folded so far, for tests: each chunk is folded once. */
    get processed() { return processed; },
    /** Live content by record id. */
    update(live: ReadonlyMap<string, LiveGroup>): ReadonlyMap<string, LiveContent> {
      const result = new Map<string, LiveContent>();
      for (const group of live.values()) {
        const first = group.chunks[0]!.eventSeq;
        let state = states.get(group.recordId);
        if (state === undefined || state.first !== first || state.count > group.chunks.length) {
          state = { first, count: 0, content: emptyLiveContent() };
          states.set(group.recordId, state);
        }
        appendChunks(state.content, group.chunks, state.count);
        processed += group.chunks.length - state.count;
        state.count = group.chunks.length;
        result.set(group.recordId, state.content);
      }
      for (const recordId of states.keys()) if (!result.has(recordId)) states.delete(recordId);
      return result;
    },
  };
}
export type LiveAccumulator = ReturnType<typeof createLiveAccumulator>;

/** The placeholder cell with the live content merged in. */
export function withLiveContent(cell: TrajectoryCell, content: LiveContent): TrajectoryCell {
  return { ...cell, record: { ...cell.record, ...liveFields(content) } };
}

/** Streaming cells by record id, built from the settled layout's placeholder cells. */
export function streamingCells(cells: ReadonlyMap<string, TrajectoryCell>, contents: ReadonlyMap<string, LiveContent>): ReadonlyMap<string, TrajectoryCell> {
  const result = new Map<string, TrajectoryCell>();
  for (const [recordId, content] of contents) {
    const cell = cells.get(recordId);
    if (cell !== undefined) result.set(recordId, withLiveContent(cell, content));
  }
  return result;
}
