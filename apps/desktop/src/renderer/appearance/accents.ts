/**
 * 强调色调色板注册表。只登记 ID 与名称；浅深色值在 styles/tokens.css 的
 * :root[data-accent="<id>"] 块里（pnpm check:frontend-theme 校验两边一一对应）。
 * 强调色只驱动发送按钮、开关开启态、焦点、普通链接与文字选中；
 * 默认调色板不定义源值，全部回落到原有 action / operational / info / 中性 token。
 * 设计：docs/design-docs/frontend/front-accent-palette.md。
 */
import type { AccentPaletteId } from "./types";

export interface AccentPalette {
  id: AccentPaletteId;
  label: string;
}

export const DEFAULT_ACCENT_PALETTE: AccentPaletteId = "default";

export const ACCENT_PALETTES: AccentPalette[] = [
  { id: "default", label: "默认" },
  { id: "blue", label: "蓝" },
  { id: "purple", label: "紫" },
  { id: "pink", label: "粉" },
  { id: "orange", label: "橙" },
];
