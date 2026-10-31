import { useCallback, useState } from "react";
import type { SessionListItem } from "@actspace/shared";
import type { ComposerSendOptions } from "../../Composer";
import { useRightPanel } from "../RightPanelContext";
import { useSideChatRuntime } from "./side-chat-runtime";
import { sideChatTabId } from "./side-chat-transcript";

/** 打开失败的原因；后端的错误码可能夹在 IPC 包装的消息里。 */
export function sideChatOpenError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/SIDE_CHAT_NO_COMPLETED_TURN|还没有完成的一轮/.test(message)) return "主会话还没有完成的一轮，暂时不能开侧边对话。";
  if (/SIDE_CHAT_PARENT_NOT_MAIN/.test(message)) return "侧边对话里不能再开侧边对话。";
  if (/SESSION_BUSY|admission/i.test(message)) return "主会话暂时不能分出侧边对话，请稍后再试。";
  return "侧边对话没有打开，请重试。";
}

/**
 * 从主会话开一个侧边对话并聚焦它的 tab；带问题时（`/side 问题`）接着在侧边对话里发出。
 * 重新打开已收起的侧边对话用 `reopen`，不新建会话。
 */
export function useOpenSideChat(parentSessionId: string | null) {
  const runtime = useSideChatRuntime();
  const { tabs, openTab } = useRightPanel();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = Boolean(runtime?.available && parentSessionId);
  const siblingCount = tabs.filter((tab) => tab.kind === "sideChat" && tab.parentSessionId === parentSessionId).length;

  const open = useCallback(async (question?: string, sendOptions?: ComposerSendOptions) => {
    if (!runtime || !parentSessionId) return;
    setOpening(true);
    setError(null);
    try {
      let opened;
      try { opened = await runtime.open(parentSessionId); }
      catch (cause) { throw new Error(sideChatOpenError(cause)); }
      const sessionId = opened.session.sessionId;
      openTab({
        id: sideChatTabId(sessionId),
        kind: "sideChat",
        title: `侧边对话 ${siblingCount + 1}`,
        sessionId,
        parentSessionId,
        inheritedTurnCount: opened.inheritedTurnCount,
        runningTurnExcluded: opened.runningTurnExcluded,
      });
      const text = question?.trim();
      if (text && sendOptions) {
        await runtime.send(sessionId, text, { ...sendOptions, mode: opened.session.snapshot.agentMode ?? sendOptions.mode });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : sideChatOpenError(cause);
      setError(message);
      throw new Error(message);
    } finally {
      setOpening(false);
    }
  }, [runtime, parentSessionId, openTab, siblingCount]);

  const reopen = useCallback((item: SessionListItem, title: string) => {
    if (!parentSessionId) return;
    openTab({ id: sideChatTabId(item.id), kind: "sideChat", title, sessionId: item.id, parentSessionId });
  }, [openTab, parentSessionId]);

  return { available, opening, error, open, reopen };
}
