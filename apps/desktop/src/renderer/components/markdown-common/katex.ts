/**
 * KaTeX 的唯一懒加载入口：「文档」编辑器和聊天区都从这里拿，打包后是同一个 chunk，CSS 也只加载一次。
 * 聊天区的 rehype-katex 在自己的懒加载 chunk 里引用 katex，Vite 会把 katex 本体拆成共享 chunk；
 * 这里额外负责 KaTeX 的样式。
 */

type Katex = typeof import("katex").default;

let katexPromise: Promise<Katex> | null = null;

export function loadKatex(): Promise<Katex> {
  katexPromise ??= Promise.all([import("katex"), loadKatexCss()]).then(([mod]) => mod.default);
  return katexPromise;
}

let cssPromise: Promise<unknown> | null = null;

/** 只加载 KaTeX 样式（聊天区用 rehype-katex 渲染时调用）。 */
export function loadKatexCss(): Promise<unknown> {
  cssPromise ??= import("katex/dist/katex.min.css");
  return cssPromise;
}

/** KaTeX 渲染参数：两处统一。写错的公式不抛错，由调用方显示原文。 */
export const KATEX_OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: "ignore",
  maxSize: 20,
  maxExpand: 200,
  output: "htmlAndMathml",
} as const;
