import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { SKIP, visit } from "unist-util-visit";
import type { MdastNode } from "./hast-types";

/**
 * 行内公式的判定规则（规范 §5.4，与「文档」面板一致）：
 * - 开头的 `$` 后面不能是空白；
 * - 结尾的 `$` 前面不能是空白、后面不能紧跟数字（`$5 和 $10` 不是公式）。
 * `remark-math` 默认把这些都当公式，所以放在它后面把不合格的还原成文字。
 */
export function isValidInlineMath(raw: string, nextChar: string | undefined): boolean {
  const open = /^\$+/.exec(raw)?.[0].length ?? 0;
  const close = /\$+$/.exec(raw)?.[0].length ?? 0;
  if (open === 0 || close === 0 || open + close >= raw.length) return false;
  const inner = raw.slice(open, raw.length - close);
  if (/^\s/.test(inner) || /\s$/.test(inner)) return false;
  return !(nextChar !== undefined && /\d/.test(nextChar));
}

/** 还原成文字时重新解析一遍，保住公式范围内的 **加粗**、`代码` 等行内格式。 */
function restore(raw: string): MdastNode[] {
  const tree = fromMarkdown(raw, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as MdastNode;
  const only = tree.children?.length === 1 ? tree.children[0] : undefined;
  return only?.type === "paragraph" && only.children ? only.children : [{ type: "text", value: raw }];
}

export function remarkMathGuard() {
  return (tree: MdastNode, file: { value?: unknown }) => {
    const source = typeof file.value === "string" ? file.value : "";
    if (!source) return;
    visit(tree, "inlineMath", (node: MdastNode, index, parent) => {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (index === undefined || index === null || !parent || start === undefined || end === undefined) return;
      const raw = source.slice(start, end);
      if (isValidInlineMath(raw, source[end])) return;
      const replacement = restore(raw);
      (parent as MdastNode).children!.splice(index, 1, ...replacement);
      return [SKIP, index + replacement.length];
    });
  };
}
