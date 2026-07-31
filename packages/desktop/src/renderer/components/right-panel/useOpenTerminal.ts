import { useCallback, useState } from "react";
import { useRightPanel } from "./RightPanelContext";
import { preloadTerminalRenderView } from "./terminal-render-loader";

type PendingTerminalStart = { cancelled: boolean };

const pendingTerminalStarts = new Map<string, PendingTerminalStart>();
let fallbackRequestSequence = 0;

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `terminal-start-${Date.now()}-${fallbackRequestSequence += 1}`;
}

export function cancelTerminalStart(requestId: string): void {
  const pending = pendingTerminalStarts.get(requestId);
  if (pending) pending.cancelled = true;
}

export function useOpenTerminal(sessionId: string | null) {
  const { openTab } = useRightPanel();
  const [creatingTerminal, setCreatingTerminal] = useState(false);

  const openTerminal = useCallback(async () => {
    if (!sessionId || creatingTerminal) return false;
    const requestId = createRequestId();
    const tabId = `terminal-start:${requestId}`;
    const pending: PendingTerminalStart = { cancelled: false };
    pendingTerminalStarts.set(requestId, pending);
    openTab({
      id: tabId,
      kind: "terminalStarting",
      title: "Terminal",
      requestId,
      sessionId,
    });
    setCreatingTerminal(true);
    try {
      if (!window.actspace.createTerminal) {
        if (!pending.cancelled) {
          openTab({
            id: tabId,
            kind: "terminalError",
            title: "Terminal",
            sessionId,
            message: "当前桌面版本尚未加载终端桥接，请重启应用后重试。",
          });
        }
        return false;
      }
      const [createOutcome, moduleOutcome] = await Promise.allSettled([
        window.actspace.createTerminal({ sessionId, cols: 80, rows: 24 }),
        preloadTerminalRenderView(),
      ]);
      if (createOutcome.status === "rejected") throw createOutcome.reason;
      const result = createOutcome.value;
      if (result.ok === false) {
        if (!pending.cancelled) {
          openTab({
            id: tabId,
            kind: "terminalError",
            title: "Terminal",
            sessionId,
            message: result.error.message,
          });
        }
        return false;
      }
      const terminal = result.terminal;
      if (moduleOutcome.status === "rejected") {
        await window.actspace.closeTerminal?.({ terminalId: terminal.id });
        throw moduleOutcome.reason;
      }
      if (pending.cancelled) {
        await window.actspace.closeTerminal?.({ terminalId: terminal.id });
        return false;
      }
      openTab({
        id: tabId,
        kind: "terminal",
        title: terminal.title,
        terminalId: terminal.id,
        sessionId: terminal.sessionId,
        shellName: terminal.shellName,
      });
      return true;
    } catch (error) {
      if (!pending.cancelled) {
        openTab({
          id: tabId,
          kind: "terminalError",
          title: "Terminal",
          sessionId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return false;
    } finally {
      pendingTerminalStarts.delete(requestId);
      setCreatingTerminal(false);
    }
  }, [creatingTerminal, openTab, sessionId]);

  return { openTerminal, creatingTerminal };
}
