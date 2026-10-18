import { useSyncExternalStore } from "react";

// 新建会话面板的开关：入口在列表底部输入坞，面板在窄屏全屏、宽屏盖在右栏（front-web-pwa客户端规范 §7）。
let open = false;
const listeners = new Set<() => void>();
function set(value: boolean) {
  if (open === value) return;
  open = value;
  for (const listener of [...listeners]) listener();
}
export const openNewSession = () => set(true);
export const closeNewSession = () => set(false);
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useNewSessionOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
