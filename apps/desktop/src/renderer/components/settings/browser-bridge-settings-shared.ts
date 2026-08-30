import { useCallback, useEffect, useState } from "react";
import type { BrowserBridgeStatus } from "@actspace/shared";

export const PLUGIN_BTN_SECONDARY =
  "inline-flex h-8 items-center rounded-act-md border border-line bg-surface px-3 text-[13px] font-semibold text-text-main transition hover:border-line-strong hover:bg-hover-overlay disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_POLL_MS = 2000;
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

  const refreshStatus = useCallback(async () => {
    if (!bridgeReady || !window.actspace.getBrowserBridgeStatus) return null;
    try {
      const next = await window.actspace.getBrowserBridgeStatus();
      setStatus(next);
      return next;
    } catch (error) {
      console.error("Failed to load browser-bridge status", error);
      return null;
    }
  }, [bridgeReady]);

  useEffect(() => {
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
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refreshStatus]);

  return { status, refreshStatus };
}
