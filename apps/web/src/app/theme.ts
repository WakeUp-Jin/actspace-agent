import { useSyncExternalStore } from "react";

// 外观三态，写 html[data-theme]，与桌面端同一套 token 选择器（system 时跟随 prefers-color-scheme）。
export type ThemePreference = "system" | "light" | "dark";
const KEY = "actspace.web.theme";
// 与 tokens.css 的 --act-color-bg 浅色 / 深色值一致，用于状态栏颜色。
export const THEME_COLORS = { light: "#f7f7f5", dark: "#181916" } as const;

export function readTheme(storage: Storage = localStorage): ThemePreference {
  try {
    const value = storage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch { return "system"; }
}

/** 系统模式下按当前系统明暗解析。 */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): "light" | "dark" {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}

function prefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const listeners = new Set<() => void>();

/** 写 data-theme，并让两条 theme-color meta 跟随所选主题（状态栏颜色）。 */
export function applyTheme(preference: ThemePreference, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = preference;
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach(meta => {
    const media = meta.getAttribute("data-media") ?? meta.getAttribute("media") ?? "";
    if (!meta.hasAttribute("data-media")) meta.setAttribute("data-media", media);
    const tone = preference === "system" ? (media.includes("dark") ? "dark" : "light") : preference;
    meta.setAttribute("content", THEME_COLORS[tone]);
  });
}

export function setTheme(preference: ThemePreference, storage: Storage = localStorage): void {
  try {
    if (preference === "system") storage.removeItem(KEY); else storage.setItem(KEY, preference);
  } catch { /* 只在本次页面内有效 */ }
  applyTheme(preference);
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useTheme(): { preference: ThemePreference; resolved: "light" | "dark" } {
  const preference = useSyncExternalStore(subscribe, () => readTheme(), () => "system" as const);
  return { preference, resolved: resolveTheme(preference, typeof window !== "undefined" && prefersDark()) };
}
