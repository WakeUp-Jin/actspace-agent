import type { MessageBlock, SessionListItem } from "@actspace/shared";
import type { RuntimeV2JsonValue, RuntimeV2EventWindow } from "@actspace/shared/runtime-v2";

/** 侧边对话 tab 的稳定 id；renderer 各处必须用它生成，去重才不会失效。 */
export function sideChatTabId(sessionId: string): string {
  return `side-chat:${sessionId}`;
}

/** 会话 lineage 里的分叉点；不是侧边对话时为 null。 */
export function sideChatBoundarySeq(lineage: RuntimeV2JsonValue | null | undefined): number | null {
  if (!lineage || typeof lineage !== "object" || Array.isArray(lineage)) return null;
  const { origin, parentBoundarySeq } = lineage as Record<string, RuntimeV2JsonValue>;
  return origin === "side-chat" && typeof parentBoundarySeq === "number" ? parentBoundarySeq : null;
}

/**
 * 侧边对话复制了主会话到分叉点的 Journal；面板只显示分叉之后的消息。
 * durable 块按 sourceSeq 判断；同一 run 里没有 sourceSeq 的合成块（轮尾、用量）跟着它的 run 一起隐藏。
 */
export function hideInheritedMessages(messages: readonly MessageBlock[], boundarySeq: number | null): MessageBlock[] {
  if (boundarySeq === null) return [...messages];
  const inheritedRuns = new Set<string>();
  for (const block of messages) if (block.sourceSeq !== undefined && block.sourceSeq <= boundarySeq && block.runId) inheritedRuns.add(block.runId);
  return messages.filter((block) => block.sourceSeq !== undefined
    ? block.sourceSeq > boundarySeq
    : !(block.runId && inheritedRuns.has(block.runId)));
}

/**
 * 从侧边对话自己的事件窗口数出继承了几轮：窗口之前的轮数加上窗口里分叉点之前开始的轮。
 * 窗口已经不含分叉点（侧边对话自己聊了很久）时数不出来，返回 null。
 */
export function countInheritedTurns(window: RuntimeV2EventWindow | null | undefined, boundarySeq: number | null): number | null {
  if (!window || boundarySeq === null || window.fromSeq > boundarySeq + 1) return null;
  return window.turnOffset + window.events.filter((event) => event.type === "turn/start" && event.seq <= boundarySeq).length;
}

/** 消息流开头的分隔线文案。 */
export function sideChatDividerText(inheritedTurnCount: number | null | undefined, runningTurnExcluded = false): string {
  if (inheritedTurnCount == null) return "继承主会话的上下文";
  return `继承主会话 ${inheritedTurnCount} 轮${runningTurnExcluded ? `，不含进行中的第 ${inheritedTurnCount + 1} 轮` : ""}`;
}

/** tab 标题：侧边对话里第一条用户消息；还没有时为 null，由调用方用「侧边对话 N」。 */
export function sideChatTitleFromMessages(messages: readonly MessageBlock[]): string | null {
  const first = messages.find((block): block is Extract<MessageBlock, { kind: "user" }> => block.kind === "user");
  const text = first?.content.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 40) : null;
}

/** 侧边对话自己的标题：和主会话一样（分叉时复制过来、还没改名）或是默认标题时当作没有。 */
export function sideChatOwnTitle(title: string | null | undefined, parentTitle: string | undefined): string | null {
  const value = title?.trim();
  return value && value !== parentTitle?.trim() && value !== "New chat" ? value : null;
}

/** 收起列表里的标题：没有自己的标题时按创建先后叫「侧边对话 N」。 */
export function sideChatListTitle(item: SessionListItem, parentTitle: string | undefined, index: number): string {
  return sideChatOwnTitle(item.title, parentTitle) ?? `侧边对话 ${index + 1}`;
}

/** 收起列表的说明：最后更新是多久以前。 */
export function sideChatAge(updatedAt: string, now = Date.now()): string {
  const value = new Date(updatedAt).getTime();
  if (!Number.isFinite(value)) return "";
  const minutes = Math.max(0, Math.round((now - value) / 60_000));
  if (minutes < 1) return "刚刚更新";
  if (minutes < 60) return `${minutes} 分钟前更新`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.round(hours / 24)} 天前更新`;
}
