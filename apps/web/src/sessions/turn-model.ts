import type { MessageBlock, TurnUsageSummary } from "@actspace/shared";
import { itemBlocks, type TranscriptItem } from "./transcript-model";

// 时间线按轮次拆分（规则对齐桌面端 renderer/components/conversation/turns.ts）：
// 用户消息开一轮；过程（thinking、工具、工具间旁白）收进「Worked for」，末尾连续的助手回复留在外面，错误和状态提示放在最后。

export type UserBlock = Extract<MessageBlock, { kind: "user" }>;
export type AssistantBlock = Extract<MessageBlock, { kind: "assistant" }>;

export type Turn = {
  readonly key: string;
  readonly user: UserBlock | null;
  readonly process: readonly TranscriptItem[];
  readonly reply: readonly TranscriptItem[];
  /** 错误、状态提示（已停止等）、上下文压缩：不收进过程组。 */
  readonly tail: readonly TranscriptItem[];
};

const isKind = (item: TranscriptItem, kinds: ReadonlySet<string>) => item.type === "block" && kinds.has(item.block.kind);
const TAIL_KINDS: ReadonlySet<string> = new Set(["error", "status"]);
const ASSISTANT: ReadonlySet<string> = new Set(["assistant"]);
const SEPARATE: ReadonlySet<string> = new Set(["context_compaction", "workspace_preparation"]);

export function buildTurns(items: readonly TranscriptItem[]): Turn[] {
  const raw: { key: string; user: UserBlock | null; items: TranscriptItem[] }[] = [];
  let current: (typeof raw)[number] | null = null;
  for (const item of items) {
    if (item.type === "block" && item.block.kind === "user") {
      current = { key: item.key, user: item.block, items: [] };
      raw.push(current);
      continue;
    }
    if (isKind(item, SEPARATE)) {
      current = null;
      raw.push({ key: item.key, user: null, items: [item] });
      continue;
    }
    if (!current) { current = { key: `turn-${item.key}`, user: null, items: [] }; raw.push(current); }
    current.items.push(item);
  }
  return raw.map(({ key, user, items: list }) => {
    if (list.length === 1 && isKind(list[0]!, SEPARATE)) return { key, user, process: [], reply: [], tail: list };
    const tail = list.filter(item => isKind(item, TAIL_KINDS));
    const rest = list.filter(item => !isKind(item, TAIL_KINDS));
    let split = rest.length;
    while (split > 0 && isKind(rest[split - 1]!, ASSISTANT)) split -= 1;
    return { key, user, process: rest.slice(0, split), reply: rest.slice(split), tail };
  });
}

/** 过程耗时：第一个过程块到回复开始（没有回复就到最后一个过程块）。拿不到时间时为 undefined。 */
export function workedMs(turn: Turn): number | undefined {
  const blocks = turn.process.flatMap(itemBlocks);
  if (blocks.length === 0) return undefined;
  const start = Date.parse(blocks[0]!.createdAt);
  const endBlock = turn.reply.length ? itemBlocks(turn.reply[0]!)[0] : blocks[blocks.length - 1];
  const end = endBlock ? Date.parse(endBlock.createdAt) : Number.NaN;
  return Number.isFinite(start) && Number.isFinite(end) ? end - start : undefined;
}

/** 「Worked for 1m 12s」，和桌面端 formatWorkedDuration 一致。 */
export function formatWorked(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return "Worked";
  const total = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60), seconds = total % 60;
  if (minutes <= 0) return `Worked for ${seconds}s`;
  return seconds === 0 ? `Worked for ${minutes}m` : `Worked for ${minutes}m ${seconds}s`;
}

export const replyAssistants = (turn: Turn): AssistantBlock[] => turn.reply.flatMap(itemBlocks).filter((block): block is AssistantBlock => block.kind === "assistant");

export type TurnChanges = { readonly files: readonly { readonly path: string; readonly additions: number; readonly deletions: number }[]; readonly additions: number; readonly deletions: number };

/** 本轮成功落盘的文件改动（edit_diff / write_diff），按路径合并；没有改动时为 null。 */
export function turnChanges(turn: Turn): TurnChanges | null {
  const byPath = new Map<string, { additions: number; deletions: number }>();
  for (const block of turn.process.flatMap(itemBlocks)) {
    if (block.kind !== "edit_diff" && block.kind !== "write_diff") continue;
    if (block.status === "failed" || block.status === "denied" || block.status === "running" || block.status === "pending" || block.errorMessage) continue;
    const entry = byPath.get(block.filePath) ?? { additions: 0, deletions: 0 };
    entry.additions += block.additions; entry.deletions += block.deletions;
    byPath.set(block.filePath, entry);
  }
  if (byPath.size === 0) return null;
  const files = [...byPath].map(([path, value]) => ({ path, ...value }));
  return { files, additions: files.reduce((sum, file) => sum + file.additions, 0), deletions: files.reduce((sum, file) => sum + file.deletions, 0) };
}

/** 本轮用量挂在最终可见回复上（Host 投影的 assistant.usage）。 */
export function turnUsage(turn: Turn): TurnUsageSummary | undefined {
  const withUsage = replyAssistants(turn).filter(block => block.usage);
  return withUsage[withUsage.length - 1]?.usage;
}
