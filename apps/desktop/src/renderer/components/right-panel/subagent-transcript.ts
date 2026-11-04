import { jsonEqual } from "../../json-equal";
import { createMessageBlocks, type MessageBlock, type SessionEvent, type SubagentListItem } from "@actspace/shared";

export type TranscriptState = { readonly events: readonly SessionEvent[]; readonly blocks: MessageBlock[] };

/**
 * Fold a freshly fetched transcript onto the previous one. The Host only offers the full transcript, so the
 * diff happens here: an identical fetch returns the previous state (no setState, no re-render); otherwise the
 * blocks are rebuilt (they depend on the whole fold: usage per turn, last assistant reply, ...) but every block
 * equal to the previous block at the same position keeps its object, so memoized rows skip rendering and only
 * the changed / appended tail updates.
 */
export function reconcileTranscript(previous: TranscriptState | null, events: SessionEvent[]): TranscriptState {
  if (previous && jsonEqual(previous.events, events)) return previous;
  const built = createMessageBlocks(events);
  if (!previous) return { events, blocks: built };
  const blocks = built.map((block, index) => {
    const prior = previous.blocks[index];
    return prior !== undefined && jsonEqual(prior, block) ? prior : block;
  });
  const unchanged = blocks.length === previous.blocks.length && blocks.every((block, index) => block === previous.blocks[index]);
  return { events, blocks: unchanged ? previous.blocks : blocks };
}

/** Keep the previous list (and each unchanged item object) when the polled list carries no change. */
export function reconcileSubagents(previous: SubagentListItem[], next: SubagentListItem[]): SubagentListItem[] {
  const items = next.map((item) => previous.find((candidate) => candidate.agentId === item.agentId && jsonEqual(candidate, item)) ?? item);
  return items.length === previous.length && items.every((item, index) => item === previous[index]) ? previous : items;
}
