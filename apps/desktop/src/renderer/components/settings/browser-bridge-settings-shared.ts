import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserBridgeStatus } from "@actspace/shared";

const STATUS_POLL_MS = 1000;
const STATUS_ERROR_POLL_MS = 5000;

export function hasBrowserBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace?.getBrowserBridgeStatus);
}

/** 挂载期间串行轮询 Browser Bridge doctor 状态，异常时降低频率。 */
export function useBrowserBridgeStatus(bridgeReady: boolean): {
  status: BrowserBridgeStatus | null;
  refreshStatus: () => Promise<BrowserBridgeStatus | null>;
} {
  const [status, setStatus] = useState<BrowserBridgeStatus | null>(null);
  const alive = useRef(true);
  const sequence = useRef(0);

  const refreshStatus = useCallback(async () => {
    if (!bridgeReady || !window.actspace.getBrowserBridgeStatus) return null;
    try {
      const request = ++sequence.current;
      const next = await window.actspace.getBrowserBridgeStatus();
      if (alive.current && request === sequence.current) setStatus(next);
      return next;
    } catch (error) {
      console.error("Failed to load browser-bridge status", error);
      return null;
    }
  }, [bridgeReady]);

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
