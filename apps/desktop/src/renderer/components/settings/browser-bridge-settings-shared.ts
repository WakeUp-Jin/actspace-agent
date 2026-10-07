import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserBridgeStatus } from "@actspace/shared";
import { browserBridgeApi } from "../../api/browser-bridge";

const STATUS_POLL_MS = 1000;
const STATUS_ERROR_POLL_MS = 5000;

/** 挂载期间串行轮询 Browser Bridge doctor 状态，异常时降低频率。 */
export function useBrowserBridgeStatus(): {
  status: BrowserBridgeStatus | null;
  refreshStatus: () => Promise<BrowserBridgeStatus | null>;
} {
  const [status, setStatus] = useState<BrowserBridgeStatus | null>(null);
  const alive = useRef(true);
  const sequence = useRef(0);

  const refreshStatus = useCallback(async () => {
    try {
      const request = ++sequence.current;
      const next = await browserBridgeApi.getStatus();
      if (alive.current && request === sequence.current) setStatus(next);
      return next;
    } catch (error) {
      console.error("Failed to load browser-bridge status", error);
      return null;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    let canceled = false;
    let timer: number | undefined;
    const poll = async () => {
      const next = await refreshStatus();
      if (canceled) return;
      timer = window.setTimeout(poll, next?.runState === "error" ? STATUS_ERROR_POLL_MS : STATUS_POLL_MS);
    };
    void poll();
    return () => {
      canceled = true;
      alive.current = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refreshStatus]);

  return { status, refreshStatus };
}
