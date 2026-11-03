/**
 * 数学 chunk：remark-math、rehype-katex 和 KaTeX 都只经这个文件进来（规范 §9.2），
 * 由 lazy-plugins.ts 动态 import，不进主包。KaTeX 样式在加载时一起带上。
 */
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { KATEX_OPTIONS, loadKatexCss } from "../../markdown-common/katex";
import { rehypeMathExclude } from "./rehype-math-exclude";
import { remarkMathGuard } from "./remark-math-guard";

export const MATH_REMARK_PLUGINS = [remarkMath, remarkMathGuard];
export const MATH_REHYPE_PLUGINS = [[rehypeKatex, { ...KATEX_OPTIONS }], rehypeMathExclude];

export function prepareMath(): Promise<unknown> {
  return loadKatexCss();
}
