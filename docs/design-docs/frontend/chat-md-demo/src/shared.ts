import { createContext } from "react";

export type Host = { openPath(path: string, line?: number): void; openUrl(url: string): void; image(path: string): string | null };
export const HostContext = createContext<Host>({ openPath() {}, openUrl() {}, image: () => null });

/** A 方向的几版：共用 .mdv-book 的书页底子，差别在 variants.css 和这里的开关。 */
export type VariantId = "a" | "a1" | "a2" | "a3" | "a4" | "a5";
export type VariantSpec = {
  id: VariantId;
  name: string;
  note: string;
  /** 代码块行号 */
  lineNumbers: boolean;
  /** 流式时文字末尾的光标形态 */
  caret: "none" | "dot" | "bar" | "block";
  /** 流式时末尾渐显的层数（0 = 不渐显） */
  fade: 0 | 1 | 2 | 3;
};
export const VARIANTS: Record<VariantId, VariantSpec> = {
  a: { id: "a", name: "A 书页", note: "上一轮的 A，作参照", lineNumbers: false, caret: "dot", fade: 3 },
  a1: { id: "a1", name: "A1 宋体", note: "中文也用宋体，字号更大、行距更松，最像读书", lineNumbers: false, caret: "none", fade: 3 },
  a2: { id: "a2", name: "A2 Claude 味", note: "西文衬线 + 苹方，行内代码暖色，提示框软底，代码块轻", lineNumbers: false, caret: "dot", fade: 2 },
  a3: { id: "a3", name: "A3 印刷", note: "照印刷排版：三线表、代码像书里的程序清单、引用缩进不加竖条", lineNumbers: false, caret: "none", fade: 3 },
  a4: { id: "a4", name: "A4 书页·有分寸", note: "正文衬线，机器的东西（代码、表格、标签）用等宽和发丝线，强调色只给可点的", lineNumbers: true, caret: "bar", fade: 2 },
  a5: { id: "a5", name: "A5 暖纸", note: "整体暖色：墨色正文、米色代码底、暖棕行内代码，深色下是暖黑", lineNumbers: false, caret: "dot", fade: 3 },
};

/** 当前块是否在流式中、它是不是一个还没闭合的代码围栏。 */
export const StreamContext = createContext<{ live: boolean; fenceOpen: boolean }>({ live: false, fenceOpen: false });
export const VariantContext = createContext<VariantSpec>(VARIANTS.a);

/* ---------- 路径识别（与文档面板规范 §8.1 同一条规则） ---------- */
const PATH_RE = /^(?:\.{1,2}\/)?(?:[\w@一-龥.-]+\/)*[\w@一-龥-][\w@一-龥.-]*\.[A-Za-z]\w{0,7}(?::\d+(?:-\d+)?)?$/;
export function parsePath(text: string): { path: string; line?: number } | null {
  if (/\s/.test(text) || /^[a-z]+:\/\//i.test(text) || text.startsWith("/") || text.startsWith("~") || !PATH_RE.test(text)) return null;
  const m = text.match(/^(.*?)(?::(\d+)(?:-\d+)?)?$/);
  if (!m || m[1].split("/").includes("..")) return null;
  return { path: m[1], line: m[2] ? Number(m[2]) : undefined };
}

export function isFenceOpen(source: string): boolean {
  const block = source.trimStart();
  const open = block.match(/^(`{3,}|~{3,})/);
  if (!open) return false;
  return !block.split("\n").slice(1).some((line) => new RegExp(`^ {0,3}${open[1][0]}{${open[1].length},}\\s*$`).test(line));
}
