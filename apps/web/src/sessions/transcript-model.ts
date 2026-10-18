import type { MessageBlock } from "@actspace/shared";

// 会话时间线 = 已落盘块 + 流式块（规则对齐桌面端 renderer/session/transcript.ts），再把相邻的探索类工具合并成一组。

export type TranscriptEntry = { readonly key: string; readonly block: MessageBlock };
export type ExploreBlock = Extract<MessageBlock, { kind: "read" | "search" | "grep" | "glob" | "web_search" }>;
export type TranscriptItem =
  | { readonly type: "block"; readonly key: string; readonly block: MessageBlock }
  | { readonly type: "explore"; readonly key: string; readonly blocks: readonly ExploreBlock[] };

const EXPLORE_KINDS: ReadonlySet<string> = new Set(["read", "search", "grep", "glob", "web_search"]);
export const isExploreBlock = (block: MessageBlock): block is ExploreBlock => EXPLORE_KINDS.has(block.kind);
const blockKey = (block: MessageBlock): string => block.renderKey ?? block.id;
const isText = (block: MessageBlock): block is Extract<MessageBlock, { kind: "assistant" | "thinking" }> => block.kind === "assistant" || block.kind === "thinking";

export type LiveSlice = { readonly blocks: readonly MessageBlock[]; readonly runId: string | null };

/**
 * durable 在前，live 接在后面。去重：
 * - 工具等有稳定 id 的块：live 与 durable 的 renderKey 相同就以 durable 为准；
 * - assistant / thinking：live 的序号在中途加入的 run 里会重新从 0 数，不能靠 key，按「同一 run 内容相同」去重；
 * - user 以 durable 为准（live 的 user 块只来自本地 steer，web 不产生）。
 */
export function mergeTranscript(durable: readonly MessageBlock[], live: LiveSlice): TranscriptEntry[] {
  const used = new Set<string>();
  const unique = (key: string) => { let next = key; while (used.has(next)) next += "~"; used.add(next); return next; };
  const entries: TranscriptEntry[] = durable.map(block => ({ key: unique(blockKey(block)), block }));
  if (live.blocks.length === 0) return entries;
  const keys = new Set(durable.map(blockKey));
  const texts = new Set(durable.filter(isText).filter(block => !live.runId || block.runId === live.runId).map(block => `${block.kind}:${block.content.trim()}`));
  const compacted = durable.some(block => block.kind === "context_compaction" && block.runId === live.runId);
  for (const block of live.blocks) {
    if (block.kind === "user") continue;
    if (isText(block)) { if (texts.has(`${block.kind}:${block.content.trim()}`)) continue; }
    else if (block.kind === "context_compaction") { if (block.status !== "running" && compacted) continue; }
    else if (block.kind !== "status" && keys.has(blockKey(block))) continue;
    entries.push({ key: unique(blockKey(block)), block });
  }
  return entries;
}

export function groupTranscript(entries: readonly TranscriptEntry[]): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  let group: { key: string; blocks: ExploreBlock[] } | null = null;
  const flush = () => { if (group) items.push({ type: "explore", key: `explore:${group.key}`, blocks: group.blocks }); group = null; };
  for (const entry of entries) {
    if (isExploreBlock(entry.block)) {
      if (group) group.blocks.push(entry.block); else group = { key: entry.key, blocks: [entry.block] };
      continue;
    }
    flush();
    items.push({ type: "block", key: entry.key, block: entry.block });
  }
  flush();
  return items;
}

export const buildTranscript = (durable: readonly MessageBlock[], live: LiveSlice): TranscriptItem[] => groupTranscript(mergeTranscript(durable, live));

/** 「已探索 N 个文件，搜索 M 次」：read 算文件，其余算搜索。 */
export function exploreSummary(blocks: readonly ExploreBlock[]): { files: number; searches: number; running: boolean } {
  const files = blocks.filter(block => block.kind === "read").length;
  return { files, searches: blocks.length - files, running: blocks.some(block => block.status === "running" || block.status === "pending") };
}

/** 工具块的 callId：durable 的 renderKey 和 live 的 id 都是 `turn:<run>:tool:<callId>`。 */
export function blockCallId(block: MessageBlock): string | null {
  const match = /:tool:(.+)$/.exec(blockKey(block));
  return match ? match[1]! : null;
}

export function itemBlocks(item: TranscriptItem): readonly MessageBlock[] { return item.type === "block" ? [item.block] : item.blocks; }

/** 审批卡放在对应工具调用之后；找不到返回 -1。 */
export function approvalAnchorIndex(items: readonly TranscriptItem[], callId: string): number {
  return items.findIndex(item => itemBlocks(item).some(block => blockCallId(block) === callId));
}

export function toolBlockForCall(items: readonly TranscriptItem[], callId: string): MessageBlock | undefined {
  for (const item of items) for (const block of itemBlocks(item)) if (blockCallId(block) === callId) return block;
  return undefined;
}
