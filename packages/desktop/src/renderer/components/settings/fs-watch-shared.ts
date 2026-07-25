/**
 * fs-watch 相关设置 UI 的共享逻辑，被两个分区复用：
 * - 「插件」分区（PluginsSettings.tsx）：安装 / 编译 / 版本管理
 * - 「文件监听」分区（FileWatchSettings.tsx）：开关 / 状态 / 监听配置
 *
 * 两个分区同一时刻只挂载一个，各自独立轮询状态即可，不需要全局 store。
 */
import { useCallback, useEffect, useState } from "react";
import type { BrowserBridgeStatus, FsWatchStatus } from "@actspace/shared";

export const FS_WATCH_BTN_PRIMARY =
  "inline-flex h-8 items-center rounded-act-md bg-action px-3.5 text-[13px] font-semibold text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60";
export const FS_WATCH_BTN_SECONDARY =
  "inline-flex h-8 items-center rounded-act-md border border-line bg-surface px-3 text-[13px] font-semibold text-text-main transition hover:border-line-strong hover:bg-hover-overlay disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_POLL_MS = 2000;
const STATUS_ERROR_POLL_MS = 5000;

export function hasFsWatchBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace?.getFsWatchStatus);
}

export function runStateBadge(status: FsWatchStatus): { text: string; className: string } {
  switch (status.runState) {
    case "not_installed":
      return { text: "未安装", className: "bg-surface-subtle text-text-faint" };
    case "running":
      return status.heartbeatFresh
        ? { text: "运行中", className: "bg-success-soft text-on-success" }
        : { text: "启动中", className: "bg-operational-soft text-operational" };
    case "error":
      return { text: "异常", className: "bg-danger-soft text-on-danger" };
    default:
      return { text: "已停止", className: "bg-surface-subtle text-text-faint" };
  }
}

export function formatHeartbeat(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

/** 挂载期间每 2s 轮询一次 fs-watch 运行状态。 */
export function useFsWatchStatus(bridgeReady: boolean): {
  status: FsWatchStatus | null;
  refreshStatus: () => Promise<void>;
} {
  const [status, setStatus] = useState<FsWatchStatus | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!bridgeReady || !window.actspace.getFsWatchStatus) return;
    try {
      setStatus(await window.actspace.getFsWatchStatus());
    } catch (error) {
      console.error("Failed to load fs-watch status", error);
    }
  }, [bridgeReady]);

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  return { status, refreshStatus };
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
