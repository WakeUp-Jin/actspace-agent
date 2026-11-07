import { useContext, type ComponentPropsWithoutRef } from "react";
import type { Components } from "react-markdown";
import { IdPrefixContext } from "./contexts";
import { MarkdownPre } from "./CodeBlock";
import { InlineCode } from "./InlineCode";
import { MarkdownImage } from "./MarkdownImage";
import { MarkdownLink } from "./MarkdownLink";
import { MarkdownTable } from "./MarkdownTable";
import { STREAM_FADE_TAG, STREAM_TAIL_TAG } from "./rehype-stream-tail";
import { StreamFade, StreamTailSlot } from "./StreamTail";

type WithNode<T> = T & { node?: unknown };

/** 脚注区标题的 id 是固定的 `footnote-label`，这里补上这条回复的前缀，和引用的 aria-describedby 对得上。 */
function FootnoteHeading({ node: _node, id, ...props }: WithNode<ComponentPropsWithoutRef<"h2">>) {
  const prefix = useContext(IdPrefixContext);
  return <h2 {...props} id={id === "footnote-label" ? `${prefix}footnote-label` : id} />;
}

/** 每块自己生成的脚注区不显示：整条回复的脚注区在最后单独渲染一次。 */
function HiddenFootnotes({ node: _node, ...props }: WithNode<ComponentPropsWithoutRef<"section">>) {
  return (props as Record<string, unknown>)["data-footnotes"] === undefined ? <section {...props} /> : null;
}

/** 都是模块级常量：components 必须是稳定引用，否则平滑输出的每一帧所有块都重新渲染。 */
const SHARED: Components = {
  a: MarkdownLink as Components["a"],
  pre: MarkdownPre as Components["pre"],
  code: InlineCode as Components["code"],
  img: MarkdownImage as Components["img"],
  table: MarkdownTable as Components["table"],
  h2: FootnoteHeading as Components["h2"],
  // rehype-stream-tail 的占位元素（不是 HTML 标签，hast-util-to-jsx-runtime 按名字查这里）。
  ...({ [STREAM_TAIL_TAG]: StreamTailSlot, [STREAM_FADE_TAG]: StreamFade } as Components),
};

export const BLOCK_COMPONENTS: Components = { ...SHARED, section: HiddenFootnotes as Components["section"] };
export const FOOTNOTE_COMPONENTS: Components = SHARED;
