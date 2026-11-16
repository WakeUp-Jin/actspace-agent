import { useSyncExternalStore } from "react";
import { loadAppearance } from "./storage";
import type { AppearancePrefs } from "./types";

/**
 * 「设置 › 外观 › 精灵模式」的当前值，供压缩分隔线订阅（front-轮尾与导航规范「上下文压缩分隔线」）。
 * 外观页每次保存后调 publishSpriteMode，已在屏上的压缩块即时换样式；不在渲染时反复读 localStorage。
 */
let value: boolean | undefined;
const listeners = new Set<() => void>();

function current(): boolean {
  value ??= loadAppearance().spriteMode;
  return value;
}

export function publishSpriteMode(prefs: AppearancePrefs): void {
  if (value === prefs.spriteMode) return;
  value = prefs.spriteMode;
  listeners.forEach((listener) => { listener(); });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSpriteMode(): boolean {
  return useSyncExternalStore(subscribe, current, () => false);
}

/** 测试用：丢掉缓存，下次从 localStorage 重新读。 */
export function resetSpriteModeForTest(): void {
  value = undefined;
}
