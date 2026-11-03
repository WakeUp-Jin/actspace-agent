import { classNames, type HastNode } from "./hast-types";

/**
 * 流式输出的末尾效果，只作用于正在生成的最后一块（规范 §7.1）：
 * - 末尾渐显：从末尾往前数，第 1–10 个字透明度最低，11–22 次之，23–36 再浅一点（CSS 里按 md-tail-N 定值）；公式内部不参与；
 * - 光标：一个空的呼吸圆点，紧跟在最后一个可见字后面。
 *
 * 稳定性约束（规范 §7.2，违反任何一条内容高度都会一帧一跳）：
 * - 光标放在结尾空白（含换行）之前，不能落在结尾换行符后面；
 * - 代码块里不放光标（代码块头部已经有「写入中」）。
 * 只拆分文本节点、不改变文字，光标是空元素，所以不影响批注依赖的可见文本（规范 §11）。
 */

/** 各层的累计字数：第 1 层 10 个字，第 2 层到 22，第 3 层到 36。 */
export const TAIL_LEVELS = [10, 22, 36] as const;

type TextRef = { node: HastNode; parent: HastNode; inPre: boolean };

function collectTexts(node: HastNode, inPre: boolean, out: TextRef[]) {
  for (const child of node.children ?? []) {
    // 纯空白文本（列表、表格结构之间的换行）不拆分：包成 span 会放进 <table> 等不允许 span 的位置，也会白占字数。
    if (child.type === "text") {
      if ((child.value ?? "").trim()) out.push({ node: child, parent: node, inPre });
    } else if (child.type === "element") {
      // 公式（KaTeX 输出）和显式排除批注的节点：内部不渐显，也不放光标。
      if (classNames(child).some((name) => name.startsWith("katex")) || child.properties?.dataAnnotationExclude !== undefined) continue;
      collectTexts(child, inPre || child.tagName === "pre", out);
    }
  }
}

function replaceNode(ref: { node: HastNode; parent: HastNode }, replacement: HastNode[]) {
  const siblings = ref.parent.children!;
  siblings.splice(siblings.indexOf(ref.node), 1, ...replacement);
}

export function rehypeStreamTail() {
  return (tree: HastNode) => {
    const texts: TextRef[] = [];
    collectTexts(tree, false, texts);
    const last = texts[texts.length - 1];
    if (!last) return;

    if (!last.inPre) {
      const value = last.node.value ?? "";
      const trail = /\s*$/.exec(value)![0];
      const head: HastNode = { type: "text", value: value.slice(0, value.length - trail.length) };
      const caret: HastNode = { type: "element", tagName: "span", properties: { className: ["md-caret"], ariaHidden: "true" }, children: [] };
      replaceNode(last, [head, caret, ...(trail ? [{ type: "text", value: trail }] : [])]);
      last.node = head;
    }

    const limit = TAIL_LEVELS[TAIL_LEVELS.length - 1];
    let consumed = 0;
    for (let i = texts.length - 1; i >= 0 && consumed < limit; i -= 1) {
      const { node, parent } = texts[i];
      const value = node.value ?? "";
      const pieces: HastNode[] = [];
      let end = value.length;
      while (end > 0 && consumed < limit) {
        const level = TAIL_LEVELS.findIndex((threshold) => consumed < threshold);
        const take = Math.min(end, TAIL_LEVELS[level] - consumed);
        pieces.unshift({ type: "element", tagName: "span", properties: { className: ["md-tail", `md-tail-${level + 1}`] }, children: [{ type: "text", value: value.slice(end - take, end) }] });
        end -= take;
        consumed += take;
      }
      if (end > 0) pieces.unshift({ type: "text", value: value.slice(0, end) });
      replaceNode({ node, parent }, pieces);
    }
  };
}
