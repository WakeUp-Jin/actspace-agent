import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

/**
 * Where turns, requests and tool calls sit in a Journal, so a reader can cut a history window or
 * fetch one tool call without scanning the events. Every list is in ascending seq order.
 */
export type HistoryIndex = {
  /** First seq after the last `turn/end`: where the open (or next) turn begins. */
  floor: number;
  /** Start of each turn: the floor when its `turn/start` arrived, so input claimed before `turn/start` belongs to the turn. */
  readonly starts: number[];
  /** Seqs of `request/header` and `llm/auxiliary-start`. */
  readonly requests: number[];
  readonly prompts: number[];
  readonly toolSets: number[];
  /** callId → seqs of the events that carry it. No prototype: a call id is model output and may be any string. */
  readonly calls: Record<string, number[]>;
};

/** What a window reader needs from an index; a cached read satisfies it as is. */
export type HistoryIndexView = {
  readonly starts: readonly number[];
  readonly requests: readonly number[];
  readonly prompts: readonly number[];
  readonly toolSets: readonly number[];
  readonly calls: Readonly<Record<string, readonly number[]>>;
};

export function createHistoryIndex(): HistoryIndex {
  return {
    floor: 0,
    starts: [],
    requests: [],
    prompts: [],
    toolSets: [],
    calls: Object.create(null) as Record<string, number[]>,
  };
}

/**
 * A separate index that continues `base`. The lists are copied, and a call's list is copied on its
 * first write (tracked in `touched`), so an index that readers already hold stays as it was.
 */
export function forkHistoryIndex(
  base: HistoryIndexView,
  floor: number,
): { readonly index: HistoryIndex; readonly touched: Set<string> } {
  const calls = Object.assign(Object.create(null) as Record<string, number[]>, base.calls);
  return {
    index: {
      floor,
      starts: [...base.starts],
      requests: [...base.requests],
      prompts: [...base.prompts],
      toolSets: [...base.toolSets],
      calls,
    },
    touched: new Set(),
  };
}

/** Fold one event into the index, in place. Pass the `touched` of a fork when the index came from `forkHistoryIndex`. */
export function indexHistoryEvent(
  index: HistoryIndex,
  event: SessionEventEnvelopeV1,
  touched: Set<string> | null = null,
): void {
  if (event.type === "turn/start") index.starts.push(index.floor);
  if (event.type === "turn/end") index.floor = event.seq + 1;
  if (event.type === "request/header" || event.type === "llm/auxiliary-start") index.requests.push(event.seq);
  if (event.type === "request/system-prompt") index.prompts.push(event.seq);
  if (event.type === "request/tools") index.toolSets.push(event.seq);
  const data = event.data;
  const callId =
    data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).callId : null;
  if (typeof callId === "string") {
    if (touched !== null && !touched.has(callId)) {
      touched.add(callId);
      index.calls[callId] = [...(index.calls[callId] ?? [])];
    }
    (index.calls[callId] ??= []).push(event.seq);
  }
}

export function indexHistoryEvents(
  events: Iterable<SessionEventEnvelopeV1>,
  index: HistoryIndex,
  touched: Set<string> | null = null,
): void {
  for (const event of events) indexHistoryEvent(index, event, touched);
}
