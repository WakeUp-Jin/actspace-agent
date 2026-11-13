import { useSyncExternalStore } from "react";
import { eventsApi } from "../../api/events";
import { settingsApi } from "../../api/settings";

/**
 * 「设置 › 通用 › 对话显示」里的开关，缺省都开启。每一轮、每一行思考都会读它们，
 * 所以全部订阅者共用一次查询和一个 settingsChanged 监听，最后一个订阅者卸载时再撤掉监听。读取失败时保持上一次的值。
 */
type DisplaySettings = { showTurnCodeChanges: boolean; simplifyThinking: boolean };

const DEFAULTS: DisplaySettings = { showTurnCodeChanges: true, simplifyThinking: true };
let value: DisplaySettings = DEFAULTS;
let revision = 0;
let removeListener: (() => void) | null = null;
const listeners = new Set<() => void>();

async function refresh(): Promise<void> {
  const current = ++revision;
  try {
    const snapshot = await settingsApi.getV4();
    if (current !== revision) return;
    const general = snapshot.settings.general;
    const next = { showTurnCodeChanges: general.showTurnCodeChanges !== false, simplifyThinking: general.simplifyThinking !== false };
    if (next.showTurnCodeChanges === value.showTurnCodeChanges && next.simplifyThinking === value.simplifyThinking) return;
    value = next;
    listeners.forEach((listener) => { listener(); });
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

/** 轮尾是否显示「本轮代码改动」卡。 */
export function useShowTurnCodeChanges(): boolean {
  return useSyncExternalStore(subscribe, () => value.showTurnCodeChanges, () => DEFAULTS.showTurnCodeChanges);
}

/** 思考进行时是否只显示一行标题（见中间消息区规范「简化思考过程」）。 */
export function useSimplifyThinking(): boolean {
  return useSyncExternalStore(subscribe, () => value.simplifyThinking, () => DEFAULTS.simplifyThinking);
}
