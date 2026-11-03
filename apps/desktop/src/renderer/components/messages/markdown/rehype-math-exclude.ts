import { classNames, type HastNode } from "./hast-types";

/**
 * 给 KaTeX 输出的最外层打上 `data-annotation-exclude`（规范 §11）：
 * KaTeX 默认输出 MathML 和 HTML 两份文字，不排除的话，批注依赖的可见文本会把公式重复计入。
 * 写错的公式（`katex-error`）显示的是原文，同样排除。必须排在 rehype-katex 后面。
 */
export function rehypeMathExclude() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      for (const child of node.children ?? []) {
        if (child.type !== "element") continue;
        const names = classNames(child);
        if (names.includes("katex") || names.includes("katex-display") || names.includes("katex-error")) {
          child.properties = { ...child.properties, dataAnnotationExclude: "" };
          continue;
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
