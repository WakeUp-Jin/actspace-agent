import type { HastNode } from "./hast-types";

/** 只保留脚注区：整条回复的脚注区单独渲染一次，前面那行用来排编号的引用不显示（规范 §8.2）。 */
export function rehypeKeepFootnoteSection() {
  return (tree: HastNode) => {
    tree.children = (tree.children ?? []).filter(
      (child) =>
        child.type === "element" && child.tagName === "section" && child.properties?.dataFootnotes !== undefined,
    );
  };
}
