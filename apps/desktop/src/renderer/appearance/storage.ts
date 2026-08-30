/**
 * 外观偏好的 localStorage 读写。读取永远返回一个合法对象（坏数据 / 缺字段回落默认，
 * 数值越界 clamp），保证 applyAppearance 不会拿到非法值。
 */
import { CODE_FONT_PRESETS, UI_FONT_PRESETS } from "./fonts";
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  DEFAULT_APPEARANCE,
  THEME_MODES,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  type AppearancePrefs,
  type CodeFontId,
  type ThemeMode,
  type UiFontId,
} from "./types";

const STORAGE_KEY = "actspace.appearance.v1";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function asUiFontId(value: unknown): UiFontId {
  return UI_FONT_PRESETS.some((preset) => preset.id === value)
    ? (value as UiFontId)
    : DEFAULT_APPEARANCE.uiFontId;
}

function asCodeFontId(value: unknown): CodeFontId {
  return CODE_FONT_PRESETS.some((preset) => preset.id === value)
    ? (value as CodeFontId)
    : DEFAULT_APPEARANCE.codeFontId;
}

function asTheme(value: unknown): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode)
    ? (value as ThemeMode)
    : DEFAULT_APPEARANCE.theme;
}

export function loadAppearance(): AppearancePrefs {
  if (typeof localStorage === "undefined") return { ...DEFAULT_APPEARANCE };
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
  if (!raw) return { ...DEFAULT_APPEARANCE };

  let parsed: Partial<AppearancePrefs>;
  try {
    parsed = JSON.parse(raw) as Partial<AppearancePrefs>;
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
  if (!parsed || typeof parsed !== "object") return { ...DEFAULT_APPEARANCE };

  return {
    version: 1,
    theme: asTheme(parsed.theme),
    uiFontId: asUiFontId(parsed.uiFontId),
    codeFontId: asCodeFontId(parsed.codeFontId),
    uiFontSize: Math.round(
      clamp(
        typeof parsed.uiFontSize === "number" ? parsed.uiFontSize : DEFAULT_APPEARANCE.uiFontSize,
        UI_FONT_SIZE_MIN,
        UI_FONT_SIZE_MAX,
      ),
    ),
    codeFontSize: Math.round(
      clamp(
        typeof parsed.codeFontSize === "number" ? parsed.codeFontSize : DEFAULT_APPEARANCE.codeFontSize,
        CODE_FONT_SIZE_MIN,
        CODE_FONT_SIZE_MAX,
      ),
    ),
  };
}

export function saveAppearance(prefs: AppearancePrefs): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 忽略写入失败（隐私模式 / 配额）；当前会话内偏好仍通过 applyAppearance 生效。
  }
}
