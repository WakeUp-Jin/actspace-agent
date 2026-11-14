/**
 * Markdown 语法：Lezer markdown（CommonMark）+ GFM（表格、任务列表、删除线、自动链接）
 * + 数学扩展（`MathBlock` / `MathInline`，规则见规范 §5 补充）+ Frontmatter。
 * 代码块的语言包用 `@codemirror/language-data` 按需加载，遇到该语言时才下载。
 *
 * 不用 `markdownLanguage`：它还带下标、上标和 emoji，会把 `~x~`、`^x^`、`:smile:` 解析成额外节点。
 */
import type { Extension } from "@codemirror/state";
import { commonmarkLanguage, markdown } from "@codemirror/lang-markdown";
import { LanguageDescription, syntaxTree } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { EditorState } from "@codemirror/state";
import { Tag, tags as t } from "@lezer/highlight";
import { GFM, type BlockContext, type Line, type MarkdownConfig } from "@lezer/markdown";

/** 公式源码的高亮标签（`highlight.ts` 里映射到 `tok-math`）。 */
export const mathTag = Tag.define();

const SPACE = 32;
const TAB = 9;
const DOLLAR = 36;
const BACKSLASH = 92;
const NEWLINE = 10;

/** 向后读文本用的输入接口；`BlockContext.input` 在类型里是 internal，这里按需断言，拿不到就退化成不做前瞻。 */
type LookaheadInput = { read(from: number, to: number): string };

function inputOf(cx: BlockContext): LookaheadInput | null {
  const input = (cx as unknown as { input?: LookaheadInput }).input;
  return input && typeof input.read === "function" ? input : null;
}

/** 前瞻上限：块公式、frontmatter 的结束行必须在这个范围内，避免每敲一个 `$$` 就扫完整份大文件。 */
const LOOKAHEAD_CHARS = 200_000;

/**
 * 从下一行开始找结束行，返回结束行的 [起点, 终点)；`isClose` 判断某一行是不是结束行。
 * 没找到返回 null。
 */
function findCloseLine(
  cx: BlockContext,
  nextLineStart: number,
  isClose: (text: string) => boolean,
): { start: number; end: number } | null {
  const input = inputOf(cx);
  if (!input) return null;
  const chunk = input.read(nextLineStart, nextLineStart + LOOKAHEAD_CHARS);
  let offset = 0;
  while (offset <= chunk.length) {
    let lineEnd = chunk.indexOf("\n", offset);
    if (lineEnd < 0) lineEnd = chunk.length;
    const text = chunk.slice(offset, lineEnd).replace(/\r$/, "");
    if (isClose(text)) return { start: nextLineStart + offset, end: nextLineStart + offset + text.length };
    if (lineEnd >= chunk.length) return null;
    offset = lineEnd + 1;
  }
  return null;
}

/** 当前行的下一行起点：当前行起点 + 行长 + 换行（兼容 `\r\n`）。 */
function nextLineStartOf(cx: BlockContext, line: Line): number {
  const input = inputOf(cx);
  const end = cx.lineStart + line.text.length;
  if (!input) return end + 1;
  return end + (input.read(end, end + 2).startsWith("\r\n") ? 2 : 1);
}

/** 消费到结束行（含），返回后 `line` 已经移到结束行之后。 */
function consumeThrough(cx: BlockContext, closeStart: number): void {
  while (cx.lineStart < closeStart && cx.nextLine()) {
    /* 逐行前进 */
  }
}

const MATH_FENCE = /^[ \t]{0,3}\$\$[ \t]*$/;

/**
 * 数学扩展。
 * - 块公式：独占一行的 `$$` 开头和结尾；没有结尾行就不算公式（整段保持普通文字，不会吞掉后面的内容）。
 * - 行内公式 `$…$`：开头的 `$` 后面不能是空格，结尾的 `$` 前面不能是空格、后面不能紧跟数字，
 *   所以 `$5 和 $10` 不会被当成公式；`\$` 是转义，由 Escape 先吃掉；不能跨行（替换装饰不能跨行）。
 */
export const MathExtension: MarkdownConfig = {
  defineNodes: [
    { name: "MathBlock", block: true, style: mathTag },
    { name: "MathInline", style: mathTag },
  ],
  parseBlock: [
    {
      name: "MathBlock",
      before: "FencedCode",
      parse(cx, line) {
        if (cx.parentType().name !== "Document" || !MATH_FENCE.test(line.text)) return false;
        const start = cx.lineStart + line.pos;
        const close = findCloseLine(cx, nextLineStartOf(cx, line), (text) => MATH_FENCE.test(text));
        if (!close) return false;
        consumeThrough(cx, close.start);
        cx.addElement(cx.elt("MathBlock", start, close.end));
        cx.nextLine();
        return true;
      },
    },
  ],
  parseInline: [
    {
      name: "MathInline",
      before: "Escape",
      parse(cx, next, pos) {
        if (next !== DOLLAR) return -1;
        const after = cx.char(pos + 1);
        // `$$`：不当行内公式，整个跳过，避免第二个 `$` 被当成开头
        if (after === DOLLAR) return pos + 2;
        if (after === SPACE || after === TAB || after === NEWLINE || Number.isNaN(after)) return -1;
        for (let i = pos + 1; i < cx.end; i++) {
          const c = cx.char(i);
          if (c === NEWLINE) return -1;
          if (c === BACKSLASH) {
            i++;
            continue;
          }
          if (c !== DOLLAR) continue;
          const before = cx.char(i - 1);
          if (before === SPACE || before === TAB) return -1;
          const following = cx.char(i + 1);
          if (following >= 48 && following <= 57) return -1;
          return cx.addElement(cx.elt("MathInline", pos, i + 1));
        }
        return -1;
      },
    },
  ],
};

const FRONTMATTER_OPEN = /^---[ \t]*$/;
const FRONTMATTER_CLOSE = /^(?:---|\.\.\.)[ \t]*$/;

/**
 * Frontmatter：文档第一行是 `---`，后面某行是 `---` 或 `...`，中间整块当成一个节点，里面的 `#`、`---` 都不再解析。
 * 没有结束行就不算（第一行仍是分隔线）。
 */
export const FrontmatterExtension: MarkdownConfig = {
  defineNodes: [{ name: "Frontmatter", block: true, style: t.meta }],
  parseBlock: [
    {
      name: "Frontmatter",
      before: "HorizontalRule",
      parse(cx, line) {
        if (cx.lineStart !== 0 || cx.parentType().name !== "Document" || !FRONTMATTER_OPEN.test(line.text))
          return false;
        const close = findCloseLine(cx, nextLineStartOf(cx, line), (text) => FRONTMATTER_CLOSE.test(text));
        if (!close) return false;
        consumeThrough(cx, close.start);
        cx.addElement(cx.elt("Frontmatter", 0, close.end));
        cx.nextLine();
        return true;
      },
    },
  ],
};

/** 围栏信息串 → 语言描述（`ts`、`python`、`sh`…）；认不出（包括 `mermaid`）就不高亮。 */
export function codeLanguageFor(info: string): LanguageDescription | null {
  const name = info.trim().split(/\s+/, 1)[0];
  if (!name) return null;
  return LanguageDescription.matchLanguageName(languages, name, true);
}

export function markdownSyntax(): Extension {
  return markdown({
    base: commonmarkLanguage,
    codeLanguages: codeLanguageFor,
    extensions: [GFM, FrontmatterExtension, MathExtension],
    addKeymap: false,
  });
}

/** 文档开头的 frontmatter 范围（`from` 恒为 0）；没有返回 null。 */
export function frontmatterRange(state: EditorState): { from: number; to: number } | null {
  const first = syntaxTree(state).topNode.firstChild;
  return first && first.name === "Frontmatter" ? { from: first.from, to: first.to } : null;
}
