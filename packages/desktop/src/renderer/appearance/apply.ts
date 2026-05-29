/**
 * 把外观偏好落到运行时：写 :root CSS 变量 + 调用 Electron 整窗缩放。
 * 在 main.tsx 渲染前调用一次（开机重放），之后每次设置变更再调用。
 */
import { codeFontStack, uiFontStack } from "./fonts";
import { UI_FONT_SIZE_BASE, type AppearancePrefs } from "./types";

export function applyAppearance(
  prefs: AppearancePrefs,
  root: HTMLElement | null = typeof document !== "undefined" ? document.documentElement : null,
): void {
  // 界面字号 → 整窗缩放比例（仅 Electron 暴露 setUiZoom 时真正生效）。
  const zoom = prefs.uiFontSize / UI_FONT_SIZE_BASE;
  let appliedZoom = 1;
  if (typeof window !== "undefined" && typeof window.actspace?.setUiZoom === "function") {
    window.actspace.setUiZoom(zoom);
    appliedZoom = zoom;
  }

  if (root) {
    // --act-font-display 始终 = var(--act-font-ui)，故只改 ui 即可让界面 + 输出正文一起换。
    root.style.setProperty("--act-font-ui", uiFontStack(prefs.uiFontId));
    root.style.setProperty("--act-font-mono", codeFontStack(prefs.codeFontId));
    // 整窗缩放会把 css px 再乘一次，这里预除以抵消，保证代码字号精确渲染为 codeFontSize px。
    const monoSize = Math.round((prefs.codeFontSize / appliedZoom) * 100) / 100;
    root.style.setProperty("--act-font-mono-size", `${monoSize}px`);
  }
}
