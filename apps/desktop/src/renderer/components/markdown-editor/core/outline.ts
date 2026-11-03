/**
 * 大纲：从语法树取标题（规范 §9.2），纯函数。
 * - 取 h2、h3 的文字、行号和位置；Setext 标题（`===` / `---` 下划线）也算；
 * - 代码块、frontmatter、公式块、HTML 块里的 `#` 不是标题（语法树里它们不是标题节点）；
 * - slug 按全部标题（h1–h6）依次生成，重名规则与 GitHub 一致，`#标题` 链接用同一份数据。
 */
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode, SyntaxTree } from "./lezer-types";
import { uniqueSlugs } from "./slug";

export interface HeadingInfo {
  /** 1–6 */
  level: number;
  /** 去掉标记后的纯文字 */
  text: string;
  /** 1 起始的行号 */
  line: number;
  /** 标题起点（该行行首）和终点 */
  from: number;
  to: number;
  slug: string;
}

export interface OutlineItem extends HeadingInfo {
  level: 2 | 3;
}

const SKIPPED_CHILD = /Mark$|^URL$|^LinkTitle$|^LinkLabel$|^HTMLTag$/;

/** 标题节点的纯文字：跳过标记、链接地址，保留链接文字、图片 alt、行内代码内容。 */
function plainText(state: EditorState, node: SyntaxNode): string {
  let out = "";
  let pos = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    out += state.sliceDoc(pos, child.from);
    if (!SKIPPED_CHILD.test(child.name)) out += plainText(state, child);
    pos = child.to;
  }
  return out + state.sliceDoc(pos, node.to);
}

/** 容器块：往里找标题；其余块（段落、代码、表格…）不再往里走，避免遍历行内节点。 */
const CONTAINERS = new Set(["Document", "Blockquote", "BulletList", "OrderedList", "ListItem"]);

export function collectHeadings(state: EditorState, tree: SyntaxTree = syntaxTree(state)): HeadingInfo[] {
  const found: Omit<HeadingInfo, "slug">[] = [];
  tree.iterate({
    enter(ref) {
      const match = /^(?:ATXHeading|SetextHeading)([1-6])$/.exec(ref.name);
      if (match) {
        const line = state.doc.lineAt(ref.from);
        found.push({
          level: Number(match[1]),
          text: plainText(state, ref.node).replace(/\s+/g, " ").trim(),
          line: line.number,
          from: line.from,
          to: ref.to,
        });
        return false;
      }
      return CONTAINERS.has(ref.name);
    },
  });
  const slugs = uniqueSlugs(found.map((heading) => heading.text));
  return found.map((heading, index) => ({ ...heading, slug: slugs[index] }));
}

/** 完整解析一遍（给 50ms 预算）再取大纲；超时就用已有的部分语法树。 */
export function getOutline(state: EditorState): OutlineItem[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state);
  return collectHeadings(state, tree).filter((heading): heading is OutlineItem => heading.level === 2 || heading.level === 3);
}

export function findHeadingBySlug(state: EditorState, slug: string): HeadingInfo | null {
  const tree = ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state);
  return collectHeadings(state, tree).find((heading) => heading.slug === slug) ?? null;
}

export function sameOutline(a: readonly OutlineItem[], b: readonly OutlineItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.level === b[i].level && item.text === b[i].text && item.line === b[i].line && item.from === b[i].from);
}
