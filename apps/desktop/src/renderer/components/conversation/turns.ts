import type { MessageBlock } from "@actspace/shared";
import type { ConversationTurnNavigationItem } from "../ConversationTurnRail";

// 会话消息按轮次分组、拆分过程和最终回复等纯函数，ConversationView 和 TurnView 共用。

export type UserMessageBlock = Extract<MessageBlock, { kind: "user" }>;
export type AssistantMessageBlock = Extract<MessageBlock, { kind: "assistant" }>;
export type BackgroundNoticeBlock = Extract<MessageBlock, { kind: "background_notice" }>;
type TodoMessageBlock = Extract<MessageBlock, { kind: "todo" }>;

export type ConversationTurn = {
  id: string;
  user: UserMessageBlock | null;
  /** 后台任务通知唤醒的轮次没有用户输入，以这条分隔行开头。 */
  notice?: BackgroundNoticeBlock;
  messages: MessageBlock[];
};

const TOOL_LOG_MESSAGE_KINDS = new Set<MessageBlock["kind"]>([
  "read",
  "search",
  "grep",
  "glob",
  "web_search",
  "media_analysis",
  "image_generation",
  "directory_list",
  "delete",
  "present",
  "agent",
  "tool",
]);
const DIFF_MESSAGE_KINDS = new Set<MessageBlock["kind"]>(["edit_diff", "write_diff"]);

export function groupMessagesIntoTurns(messages: MessageBlock[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentTurn: ConversationTurn | null = null;

  for (const message of messages) {
    if (message.kind === "user") {
      currentTurn = {
        id: message.renderKey ?? message.id,
        user: message,
        messages: []
      };
      turns.push(currentTurn);
      continue;
    }

    if (message.kind === "background_notice") {
      currentTurn = { id: message.renderKey ?? message.id, user: null, notice: message, messages: [] };
      turns.push(currentTurn);
      continue;
    }

    if (message.kind === "context_compaction" || message.kind === "workspace_preparation") {
      currentTurn = null;
      turns.push({
        id: message.renderKey ?? message.id,
        user: null,
        messages: [message],
      });
      continue;
    }

    if (!currentTurn) {
      currentTurn = {
        id: `turn-${message.renderKey ?? message.id}`,
        user: null,
        messages: []
      };
      turns.push(currentTurn);
    }

    currentTurn.messages.push(message);
  }

  return turns;
}

// 工具活动组：哪些消息算「过程行」（thinking + 工具 + diff），有它才把过程聚合成活动组。
const WORK_TOOL_LIKE_KINDS = new Set<MessageBlock["kind"]>([
  ...TOOL_LOG_MESSAGE_KINDS,
  ...DIFF_MESSAGE_KINDS,
  "thinking",
  "bash",
]);

export function hasToolLikeItem(messages: MessageBlock[]): boolean {
  return messages.some((message) => WORK_TOOL_LIKE_KINDS.has(message.kind));
}

/**
 * 把一个 turn 的消息拆成「过程」「最终回复」「失败」三段。
 *
 * 失败 = 运行失败的错误，单独放在轮次末尾，不收进活动组。
 * 最终回复 = 其余消息末尾、后面不再跟任何工具/thinking 的连续 assistant 块。
 * 其余（thinking / 工具 / 工具间旁白 content）都归到过程段，统一收进一个 Worked for 活动组。
 */
export function splitTurnMessages(messages: MessageBlock[]): {
  workItems: MessageBlock[];
  finalReply: MessageBlock[];
  failures: MessageBlock[];
} {
  const failures = messages.filter((message) => message.kind === "error");
  const rest = failures.length === 0 ? messages : messages.filter((message) => message.kind !== "error");
  let splitIndex = rest.length;
  while (splitIndex > 0 && rest[splitIndex - 1].kind === "assistant") {
    splitIndex -= 1;
  }
  return {
    workItems: rest.slice(0, splitIndex),
    finalReply: rest.slice(splitIndex),
    failures,
  };
}

function normalizeTurnPreviewText(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

export function createTurnNavigationItems(
  turns: ConversationTurn[],
  isStreaming: boolean,
): ConversationTurnNavigationItem[] {
  const userTurns = turns.filter((turn): turn is ConversationTurn & { user: UserMessageBlock } => Boolean(turn.user));

  return userTurns.map((turn, index) => {
    const finalReply = splitTurnMessages(turn.messages).finalReply
      .filter((message): message is AssistantMessageBlock => message.kind === "assistant")
      .map((message) => message.content)
      .join("\n\n");

    return {
      id: turn.id,
      input: normalizeTurnPreviewText(turn.user.content),
      reply: finalReply ? normalizeTurnPreviewText(finalReply) : null,
      pending: isStreaming && index === userTurns.length - 1,
    };
  });
}

export function workDurationMs(workItems: MessageBlock[], finalReply: MessageBlock[]): number | undefined {
  if (workItems.length === 0) return undefined;
  const start = Date.parse(workItems[0].createdAt);
  const endSource = finalReply[0]?.createdAt ?? workItems[workItems.length - 1].createdAt;
  const end = Date.parse(endSource);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return end - start;
}

export function getLatestTodoMessage(messages: MessageBlock[]): TodoMessageBlock | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind === "todo") return message;
  }
  return undefined;
}

/** 一轮里最终回复中的 assistant 消息：复制、可视化和用量都看它们。 */
export function finalAssistantMessages(turn: ConversationTurn): AssistantMessageBlock[] {
  return splitTurnMessages(turn.messages).finalReply.filter(
    (message): message is AssistantMessageBlock => message.kind === "assistant",
  );
}

/** Composer 里按 ↑ 翻出的历史输入：按顺序列出非空的用户消息。 */
export function userInputHistory(messages: MessageBlock[]): string[] {
  return messages
    .filter((message): message is UserMessageBlock => message.kind === "user" && message.content.length > 0)
    .map((message) => message.content);
}

/**
 * 滚动时高亮哪一轮：取顶部已越过阅读线的最后一轮；都没越过时取第一轮。
 * `topOf` 拿不到位置（还没挂载）的轮次跳过。
 */
export function pickActiveTurnId(
  items: readonly ConversationTurnNavigationItem[],
  topOf: (turnId: string) => number | undefined,
  readingLine: number,
): string | null {
  if (items.length === 0) return null;
  let nextActiveTurnId = items[0].id;
  for (const item of items) {
    const top = topOf(item.id);
    if (top === undefined) continue;
    if (top <= readingLine) {
      nextActiveTurnId = item.id;
      continue;
    }
    break;
  }
  return nextActiveTurnId;
}
