import { describe, expect, it } from "vitest";
import type { MessageBlock, SessionListItem } from "@actspace/shared";
import type { RuntimeV2EventWindow } from "@actspace/shared/runtime-v2";
import {
  countInheritedTurns,
  hideInheritedMessages,
  sideChatAge,
  sideChatBoundarySeq,
  sideChatDividerText,
  sideChatListTitle,
  sideChatOwnTitle,
  sideChatTitleFromMessages,
} from "../components/right-panel/side-chat/side-chat-transcript";

const createdAt = "2026-10-21T00:00:00.000Z";
const user = (id: string, content: string, sourceSeq?: number, runId?: string): MessageBlock => ({ kind: "user", id, content, createdAt, sourceSeq, runId });
const assistant = (id: string, sourceSeq?: number, runId?: string): MessageBlock => ({ kind: "assistant", id, content: id, createdAt, sourceSeq, runId });

function eventWindow(types: readonly string[], fromSeq = 0, turnOffset = 0): RuntimeV2EventWindow {
  return {
    events: types.map((type, index) => ({ seq: fromSeq + index, type })),
    fromSeq,
    throughJournalSeq: fromSeq + types.length - 1,
    beforeSeq: fromSeq > 0 ? fromSeq - 1 : null,
    turnOffset,
    requestOffset: 0,
  } as unknown as RuntimeV2EventWindow;
}

describe("side chat transcript", () => {
  it("reads the fork point only from side chat lineage", () => {
    expect(sideChatBoundarySeq({ origin: "side-chat", parentSessionId: "main", parentBoundarySeq: 12 })).toBe(12);
    expect(sideChatBoundarySeq({ origin: "fork", parentSessionId: "main", parentBoundarySeq: 12 })).toBeNull();
    expect(sideChatBoundarySeq(null)).toBeNull();
    expect(sideChatBoundarySeq([1, 2])).toBeNull();
  });

  it("hides inherited messages and the synthetic blocks of inherited runs", () => {
    const messages = [
      user("u1", "主会话的问题", 1, "run-1"),
      assistant("a1", 2, "run-1"),
      assistant("tail-1", undefined, "run-1"),
      user("u2", "侧边问题", 5, "run-2"),
      assistant("a2", undefined, "run-2"),
    ];
    expect(hideInheritedMessages(messages, 3).map((block) => block.id)).toEqual(["u2", "a2"]);
    expect(hideInheritedMessages(messages, null)).toHaveLength(5);
  });

  it("counts inherited turns from the side chat's own window", () => {
    const window = eventWindow(["turn/start", "user/message", "assistant/message", "turn/start", "user/message", "assistant/message", "turn/start", "user/message"]);
    expect(countInheritedTurns(window, 5)).toBe(2);
    expect(countInheritedTurns(eventWindow(["turn/start", "user/message"], 4, 3), 5)).toBe(4);
    // 窗口已经从分叉点之后开始：数不出来。
    expect(countInheritedTurns(eventWindow(["turn/start"], 20, 6), 5)).toBeNull();
    expect(countInheritedTurns(null, 5)).toBeNull();
  });

  it("writes the divider", () => {
    expect(sideChatDividerText(3)).toBe("继承主会话 3 轮");
    expect(sideChatDividerText(3, true)).toBe("继承主会话 3 轮，不含进行中的第 4 轮");
    expect(sideChatDividerText(null, true)).toBe("继承主会话的上下文");
  });

  it("titles a side chat by its own title, then its first question", () => {
    expect(sideChatTitleFromMessages([assistant("a"), user("u", "  这个函数\n为什么慢？ ")])).toBe("这个函数 为什么慢？");
    expect(sideChatTitleFromMessages([user("u", "x".repeat(60))])).toHaveLength(40);
    expect(sideChatTitleFromMessages([])).toBeNull();
    expect(sideChatOwnTitle("梳理插件加载", "梳理插件加载")).toBeNull();
    expect(sideChatOwnTitle("New chat", "主会话")).toBeNull();
    expect(sideChatOwnTitle(" 插件热更新 ", "主会话")).toBe("插件热更新");
    const item = (title: string): SessionListItem => ({ id: "s", title, updatedAt: createdAt, agentRunCount: 1 });
    expect(sideChatListTitle(item("梳理插件加载"), "梳理插件加载", 1)).toBe("侧边对话 2");
    expect(sideChatListTitle(item("插件热更新"), "梳理插件加载", 1)).toBe("插件热更新");
  });

  it("describes how long ago a collapsed side chat was updated", () => {
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    expect(sideChatAge("2026-10-21T11:59:50.000Z", now)).toBe("刚刚更新");
    expect(sideChatAge("2026-10-21T11:52:00.000Z", now)).toBe("8 分钟前更新");
    expect(sideChatAge("2026-10-21T09:00:00.000Z", now)).toBe("3 小时前更新");
    expect(sideChatAge("2026-10-19T12:00:00.000Z", now)).toBe("2 天前更新");
    expect(sideChatAge("not a date", now)).toBe("");
  });
});
