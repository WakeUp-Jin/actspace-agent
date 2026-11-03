import { visit } from "unist-util-visit";
import { CALLOUT_LABEL, parseCalloutMarker } from "../../markdown-common/callouts";
import type { MdastNode } from "./hast-types";

/**
 * GitHub 提示框：`> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]`（规范 §5.3）。
 * 把标记从正文里拿掉，给 blockquote 加类名和 `data-callout-label`；标签由 CSS `::before` 生成，不进入 DOM 文本。
 * 必须排在 remark-breaks 之前：这时标记后面的换行还在文本节点里。
 */
export function remarkCallouts() {
  return (tree: MdastNode) => {
    visit(tree, "blockquote", (node: MdastNode) => {
      const paragraph = node.children?.[0];
      const first = paragraph?.type === "paragraph" ? paragraph.children?.[0] : undefined;
      if (!paragraph || !first || first.type !== "text" || typeof first.value !== "string") return;
      const marker = parseCalloutMarker(first.value);
      if (!marker) return;
      first.value = first.value.slice(marker.length);
      if (!first.value) paragraph.children!.shift();
      if (paragraph.children!.length === 0) node.children!.shift();
      node.data = {
        ...node.data,
        hProperties: { className: ["md-callout", `md-callout-${marker.type}`], dataCalloutLabel: CALLOUT_LABEL[marker.type] },
      };
    });
  };
}
