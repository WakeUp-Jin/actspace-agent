/**
 * 外观偏好类型。外观是纯 renderer UI 偏好，走 localStorage，不进 settings.json / IPC。
 */

export type UiFontId = "system" | "sans-modern" | "serif-reading" | "rounded";
export type CodeFontId = "system-mono" | "jetbrains" | "fira" | "source";

export interface AppearancePrefs {
  version: 1;
  /** UI 字体预设；驱动 --act-font-ui（连带 AI 输出正文）。 */
  uiFontId: UiFontId;
  /** 代码字体预设；驱动 --act-font-mono。 */
  codeFontId: CodeFontId;
  /**
   * 界面字号（px，名义基准）。范围 12–20，步进 1。
   * 我们 UI 用写死像素而非 rem，无法逐元素改字号，故按 uiFontSize / UI_FONT_SIZE_BASE
   * 的比例做整窗缩放（webFrame.setZoomFactor），对外呈现为 px 基准字号。
   */
  uiFontSize: number;
  /** 代码字号（px）。范围 11–18，步进 1；写入 --act-font-mono-size（已对界面缩放反向补偿）。 */
  codeFontSize: number;
}

/** 界面字号基准：等于该值时整窗缩放为 1.0（即当前默认观感）。 */
export const UI_FONT_SIZE_BASE = 14;
export const UI_FONT_SIZE_MIN = 12;
export const UI_FONT_SIZE_MAX = 20;
export const UI_FONT_SIZE_STEP = 1;

export const CODE_FONT_SIZE_MIN = 11;
export const CODE_FONT_SIZE_MAX = 18;
export const CODE_FONT_SIZE_STEP = 1;

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  version: 1,
  uiFontId: "system",
  codeFontId: "system-mono",
  uiFontSize: 14,
  codeFontSize: 13,
};
