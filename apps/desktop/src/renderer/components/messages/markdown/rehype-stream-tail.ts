import { classNames, type HastNode } from "./hast-types";

/**
 * 流式输出的末尾效果，只作用于正在生成的最后一块（聊天区 Markdown 渲染规范 §5）：
 * - 末尾渐显：从末尾往前数，第 1–10 个字透明度最低，11–22 次之，23–36 再浅一点（CSS 里按 md-tail-N 定值）；公式内部不参与；
 * - 光标：一个空的呼吸圆点，紧跟在最后一个可见字后面。
 *
 * 两次解析之间新放出的字是一段没解析的「原样尾巴」（front-流式Markdown解析降频规范.md §3.2），每帧都在变。
 * 为了不每帧重跑整条管线，这里不直接生成渐显 span 和光标，只在 hast 上放两种占位元素，交给 StreamTail.tsx 的组件：
 * - `act-stream-tail`：尾巴的位置，渲染尾巴文字、它的渐显和光标；
 * - `act-fade`：已解析部分最后 36 个字所在的文字片段，`dataAfter` 是它后面还有几个已解析的字。
 *   组件按「后面的字数 + 尾巴字数」决定每个字的渐显层级，尾巴越长，已解析部分承担的渐显越少。
 *
 * 稳定性约束（规范 §5，违反任何一条内容高度都会一帧一跳）：
 * - 光标放在结尾空白（含换行）之前，不能落在结尾换行符后面；
 * - 代码块里不放光标（代码块头部已经有「写入中」），尾巴接在代码最后一行的行尾，不另起一行；
 * - 尾巴放在最后一个块级容器里（段落、列表项、标题、表格单元格），不放在根上，否则行内元素会单独占一行。
 * 只拆分文本节点、不改变文字，光标是空元素，所以不影响批注依赖的可见文本（规范 §8）。
 */

/** 各层的累计字数：第 1 层 10 个字，第 2 层到 22，第 3 层到 36。 */
export const TAIL_LEVELS = [10, 22, 36] as const;
export const TAIL_FADE_LIMIT = TAIL_LEVELS[TAIL_LEVELS.length - 1];

export const STREAM_TAIL_TAG = "act-stream-tail";
export const STREAM_FADE_TAG = "act-fade";

export type StreamTailOptions = {
  /** 普通块里自己生成的脚注区不显示（components-map 的 HiddenFootnotes），尾巴和渐显都不能落进去。 */
  skipFootnoteSection?: boolean;
};

/** 行内元素：尾巴放在它们后面，不放进去（不然尾巴会跟着加粗、变成链接）。 */
const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
]);
/** 空元素不能有子节点。 */
const VOID = new Set(["br", "hr", "img", "input", "wbr", "area", "col", "embed", "source", "track"]);

type TextRef = { node: HastNode; parent: HastNode };
/** 尾巴插在 parent.children[index]；split 是要拆开的文本节点（结尾空白或代码末尾的换行放到尾巴后面）。 */
type Anchor = { parent: HastNode; index: number; inPre: boolean; split?: HastNode };

function isExcluded(node: HastNode): boolean {
  // 公式（KaTeX 输出）和显式排除批注的节点：内部不渐显，也不放尾巴。
  return (
    classNames(node).some((name) => name.startsWith("katex")) || node.properties?.dataAnnotationExclude !== undefined
  );
}

function isSkipped(node: HastNode, options: StreamTailOptions): boolean {
  return (
    Boolean(options.skipFootnoteSection) &&
    node.type === "element" &&
    node.tagName === "section" &&
    node.properties?.dataFootnotes !== undefined
  );
}

function isBlank(node: HastNode): boolean {
  return node.type === "text" ? !(node.value ?? "").trim() : node.type !== "element";
}

/** 脚注定义末尾的「↩」：尾巴接在它前面的正文后面，它自己也不渐显。 */
function isBackref(node: HastNode): boolean {
  return node.type === "element" && node.tagName === "a" && node.properties?.dataFootnoteBackref !== undefined;
}

function collectTexts(node: HastNode, options: StreamTailOptions, out: TextRef[]) {
  for (const child of node.children ?? []) {
    // 纯空白文本（列表、表格结构之间的换行）不拆分：包成元素会放进 <table> 等不允许的位置，也会白占字数。
    if (child.type === "text") {
      if ((child.value ?? "").trim()) out.push({ node: child, parent: node });
    } else if (child.type === "element" && !isExcluded(child) && !isSkipped(child, options) && !isBackref(child)) {
      collectTexts(child, options, out);
    }
  }
}

/** 代码区里最后一个文本节点（高亮的 span 里也找），连同它的父节点。 */
function lastText(node: HastNode): TextRef | null {
  const children = node.children ?? [];
  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i];
    if (child.type === "text") return { node: child, parent: node };
    if (child.type === "element") {
      const found = lastText(child);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 尾巴的位置：沿最右边一路往下找最后一个块级容器，跳过结尾的空白、隐藏的脚注区和脚注的「↩」；
 * 遇到行内元素、空元素、公式就停在它后面（尾巴不跟着加粗、不变成链接）。
 * 结尾文字带空白时，尾巴放在空白前面（光标不能落在结尾换行后面）。
 * 代码块：mdast-util-to-hast 给代码末尾补了一个换行，尾巴放在这个换行前面（同一行接着写）。
 * 块里找不到块级容器（最后是独立公式、分隔线）时放在根上并标 `dataRoot`：根上的行内元素会单独占一行，
 * 所以那里既不显示尾巴也不放光标（和以前一样，这种块本来就没有可放光标的文字），下次解析就归位。
 */
function findAnchor(root: HastNode, options: StreamTailOptions): Anchor {
  let node = root;
  for (;;) {
    const children = node.children ?? [];
    let index = children.length - 1;
    while (
      index >= 0 &&
      (isBlank(children[index]) || isSkipped(children[index], options) || isBackref(children[index]))
    )
      index -= 1;
    const child = children[index] as HastNode | undefined;
    const tag = child?.type === "element" ? (child.tagName ?? "") : "";
    if (child && tag === "pre") {
      const code = (child.children ?? []).find((item) => item.type === "element" && item.tagName === "code") ?? child;
      const text = lastText(code);
      if (!text) return { parent: code, index: (code.children ?? []).length, inPre: true };
      const at = text.parent.children!.indexOf(text.node);
      return (text.node.value ?? "").endsWith("\n")
        ? { parent: text.parent, index: at, inPre: true, split: text.node }
        : { parent: text.parent, index: at + 1, inPre: true };
    }
    if (child && child.type === "element" && !isExcluded(child) && !VOID.has(tag) && !INLINE.has(tag)) {
      node = child;
      continue;
    }
    if (child?.type === "text" && node !== root && /\s$/.test(child.value ?? ""))
      return { parent: node, index, inPre: false, split: child };
    return { parent: node, index: index + 1, inPre: false };
  }
}

export function rehypeStreamTail(options: StreamTailOptions = {}) {
  return (tree: HastNode) => {
    const texts: TextRef[] = [];
    collectTexts(tree, options, texts);
    const anchor = findAnchor(tree, options);

    // 先插尾巴；拆出来的结尾空白（代码块里是补的换行）在尾巴后面，不参与渐显。
    // 代码区已有内容（拆开了末尾补的换行）时标 dataFilled：块源码以换行结尾的话，尾巴是新的一行，组件先补一个换行。
    const properties = anchor.inPre
      ? { dataPre: "", ...(anchor.split ? { dataFilled: "" } : {}) }
      : anchor.parent === tree
        ? { dataRoot: "" }
        : {};
    const element: HastNode = { type: "element", tagName: STREAM_TAIL_TAG, properties, children: [] };
    const siblings = anchor.parent.children!;
    if (anchor.split) {
      const value = anchor.split.value ?? "";
      const trail = anchor.inPre ? "\n" : /\s*$/.exec(value)![0];
      const head: HastNode = { type: "text", value: value.slice(0, value.length - trail.length) };
      siblings.splice(anchor.index, 1, head, element, { type: "text", value: trail });
      const ref = texts.find((text) => text.node === anchor.split);
      if (ref) ref.node = head;
    } else {
      siblings.splice(anchor.index, 0, element);
    }

    let consumed = 0;
    for (let i = texts.length - 1; i >= 0 && consumed < TAIL_FADE_LIMIT; i -= 1) {
      const { node, parent } = texts[i];
      const value = node.value ?? "";
      if (!value) continue;
      const take = Math.min(value.length, TAIL_FADE_LIMIT - consumed);
      const fade: HastNode = {
        type: "element",
        tagName: STREAM_FADE_TAG,
        properties: { dataAfter: consumed },
        children: [{ type: "text", value: value.slice(value.length - take) }],
      };
      const pieces =
        take < value.length ? [{ type: "text", value: value.slice(0, value.length - take) }, fade] : [fade];
      parent.children!.splice(parent.children!.indexOf(node), 1, ...pieces);
      consumed += take;
    }
  };
}
