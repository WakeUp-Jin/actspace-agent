import { visit } from "unist-util-visit";
import type { MdastNode } from "./hast-types";

/** 围栏 meta 里的 `title="…"`：支持双引号、单引号、不加引号（到下一个空白为止）；空标题当作没有。 */
export function parseCodeTitle(meta: string | undefined): string | undefined {
  if (!meta) return undefined;
  const match = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
  const title = match?.slice(1).find((part) => part !== undefined)?.trim();
  return title || undefined;
}

/** 把围栏的 meta（语言后面的部分）带到 `<code data-meta>` 上，CodeBlock 从这里取文件名标题。 */
export function remarkCodeMeta() {
  return (tree: MdastNode) => {
    visit(tree, "code", (node: MdastNode & { meta?: string | null }) => {
      if (!node.meta) return;
      node.data = { ...node.data, hProperties: { ...((node.data as { hProperties?: object } | undefined)?.hProperties), dataMeta: node.meta } };
    });
  };
}
