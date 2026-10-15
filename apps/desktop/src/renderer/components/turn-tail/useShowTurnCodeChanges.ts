import { useSyncExternalStore } from "react";
import { eventsApi } from "../../api/events";
import { settingsApi } from "../../api/settings";

/**
 * 设置「显示本轮代码改动」（缺省开启）。每一轮都会读它，所以全部轮次共用一次查询和一个 settingsChanged 监听，
 * 最后一个订阅者卸载时再撤掉监听。读取失败时保持上一次的值。
 */
let value = true;
let revision = 0;
let removeListener: (() => void) | null = null;
const listeners = new Set<() => void>();

async function refresh(): Promise<void> {
  const current = ++revision;
  try {
    const snapshot = await settingsApi.getV4();
    if (current !== revision) return;
    const next = snapshot.settings.general.showTurnCodeChanges !== false;
    if (next === value) return;
    value = next;
    listeners.forEach((listener) => listener());
  } catch {
    // 保持现值。
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!removeListener) {
    removeListener = eventsApi.settingsChanged(() => { void refresh(); });
    void refresh();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || !removeListener) return;
    removeListener();
    removeListener = null;
  };
}

export function useShowTurnCodeChanges(): boolean {
  return useSyncExternalStore(subscribe, () => value, () => true);
}
