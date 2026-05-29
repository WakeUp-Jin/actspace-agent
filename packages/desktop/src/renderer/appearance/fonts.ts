/**
 * 字体预设栈。每项是一整套带 fallback 的 font-family 字符串；不打包字体文件，
 * 用户机器上有就用、没有就优雅回退。
 */
import type { CodeFontId, UiFontId } from "./types";

export interface FontPreset<Id extends string> {
  id: Id;
  label: string;
  stack: string;
}

export const UI_FONT_PRESETS: FontPreset<UiFontId>[] = [
  {
    id: "system",
    label: "系统默认",
    stack:
      '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Segoe UI", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: "sans-modern",
    label: "现代无衬线",
    stack: 'Inter, "Segoe UI", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: "serif-reading",
    label: "阅读衬线",
    stack: 'Georgia, "Times New Roman", "Songti SC", "SimSun", serif',
  },
  {
    id: "rounded",
    label: "圆润无衬线",
    stack: '"PingFang SC", "Hiragino Sans", "Quicksand", "Segoe UI", sans-serif',
  },
];

export const CODE_FONT_PRESETS: FontPreset<CodeFontId>[] = [
  {
    id: "system-mono",
    label: "系统等宽",
    stack: '"SFMono-Regular", "SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace',
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono", ui-monospace, "SFMono-Regular", Consolas, monospace',
  },
  {
    id: "fira",
    label: "Fira Code",
    stack: '"Fira Code", ui-monospace, "SFMono-Regular", Consolas, monospace',
  },
  {
    id: "source",
    label: "Source Code Pro",
    stack: '"Source Code Pro", ui-monospace, "SFMono-Regular", Consolas, monospace',
  },
];

export function uiFontStack(id: UiFontId): string {
  return (UI_FONT_PRESETS.find((preset) => preset.id === id) ?? UI_FONT_PRESETS[0]).stack;
}

export function codeFontStack(id: CodeFontId): string {
  return (CODE_FONT_PRESETS.find((preset) => preset.id === id) ?? CODE_FONT_PRESETS[0]).stack;
}
