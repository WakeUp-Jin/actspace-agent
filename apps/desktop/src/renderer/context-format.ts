/**
 * Context 用量的数字格式，Composer 的 Context 弹层和右侧 Context 面板共用。
 * token 是估算值，统一用「≈」加 K / M；百分比不足 1% 时写「<1%」，避免把非零占比显示成 0%。
 */

export function formatTokenCount(value: number): string {
  const safe = Math.max(0, Math.round(value));
  if (safe < 1_000) return String(safe);
  if (safe < 1_000_000) return `${trimZero((safe / 1_000).toFixed(1))}K`;
  return `${trimZero((safe / 1_000_000).toFixed(1))}M`;
}

export function formatApproxTokens(value: number): string {
  return `≈${formatTokenCount(value)}`;
}

/** 带正负号的增减，负号用 U+2212；0 返回空串（调用方据此不渲染标记）。 */
export function formatSignedTokens(value: number): string {
  if (value === 0) return "";
  return `${value > 0 ? "+" : "−"}${formatTokenCount(Math.abs(value))}`;
}

export function formatShare(part: number, whole: number): string {
  if (!(whole > 0)) return "—";
  const percent = (part / whole) * 100;
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

function trimZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}
