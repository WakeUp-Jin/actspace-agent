import type { Root, TableCell } from "mdast";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const inlineProcessor = unified()
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeStringify);

export function renderInlineMarkdown(cell: TableCell): string {
  const root: Root = {
    type: "root",
    children: [{ type: "paragraph", children: cell.children }],
  };
  const transformed = inlineProcessor.runSync(root);
  const html = inlineProcessor.stringify(transformed);

  return html.replace(/^<p>/, "").replace(/<\/p>\n?$/, "");
}
