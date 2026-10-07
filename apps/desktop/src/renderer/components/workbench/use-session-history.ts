import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 标题栏「后退 / 前进」用的会话访问历史（16 T15，从 WorkbenchLayout 搬出）。
 * 切换到新会话时截掉前进分支再追加；后退 / 前进触发的切换不记入历史，切换失败时把位置退回去。
 */
export function useSessionHistory(activeSessionId: string | null, onSelectSession: ((sessionId: string) => unknown) | undefined) {
  const sessionHistoryRef = useRef<string[]>([]);
  const sessionHistoryIndexRef = useRef(-1);
  const suppressSessionHistoryRef = useRef(false);
  const pendingSessionNavigationRef = useRef<string | null>(null);
  const [sessionNavigationPending, setSessionNavigationPending] = useState(false);
  const [, setSessionHistoryVersion] = useState(0);

  useEffect(() => {
    if (!activeSessionId) return;

    const history = sessionHistoryRef.current;
    const currentIndex = sessionHistoryIndexRef.current;

    if (currentIndex < 0 || history.length === 0) {
      sessionHistoryRef.current = [activeSessionId];
      sessionHistoryIndexRef.current = 0;
      setSessionHistoryVersion((version) => version + 1);
      return;
    }

    if (suppressSessionHistoryRef.current) {
      suppressSessionHistoryRef.current = false;
      if (pendingSessionNavigationRef.current === activeSessionId) {
        pendingSessionNavigationRef.current = null;
        setSessionNavigationPending(false);
        return;
      }
    }

    if (history[currentIndex] === activeSessionId) return;

    sessionHistoryRef.current = [...history.slice(0, currentIndex + 1), activeSessionId];
    sessionHistoryIndexRef.current = currentIndex + 1;
    setSessionHistoryVersion((version) => version + 1);
  }, [activeSessionId]);

  const canGoBack = sessionHistoryIndexRef.current > 0 && !sessionNavigationPending;
  const canGoForward =
    sessionHistoryIndexRef.current >= 0 &&
    sessionHistoryIndexRef.current < sessionHistoryRef.current.length - 1 &&
    !sessionNavigationPending;

  const navigateSessionHistory = useCallback(
    (direction: -1 | 1) => {
      if (sessionNavigationPending || !onSelectSession) return;

      const nextIndex = sessionHistoryIndexRef.current + direction;
      const targetSessionId = sessionHistoryRef.current[nextIndex];
      if (!targetSessionId) return;

      sessionHistoryIndexRef.current = nextIndex;
      pendingSessionNavigationRef.current = targetSessionId;
      suppressSessionHistoryRef.current = true;
      setSessionNavigationPending(true);
      void Promise.resolve()
        .then(() => onSelectSession(targetSessionId))
        .catch(() => {
          if (pendingSessionNavigationRef.current === targetSessionId) {
            pendingSessionNavigationRef.current = null;
            suppressSessionHistoryRef.current = false;
            sessionHistoryIndexRef.current -= direction;
            setSessionNavigationPending(false);
          }
        });
    },
    [onSelectSession, sessionNavigationPending],
  );

  return { canGoBack, canGoForward, navigateSessionHistory };
}
