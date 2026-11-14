/**
 * 高亮：把 Lezer 高亮标签映射成 `tok-*` 类名，颜色在 `styles/markdown-editor.css` 里：
 * - 代码块里的代码用 `--md-hl-*` 变量（`.act-code-hl` 定义，编辑器根节点带这个类，与聊天区代码块同一套配色）；
 * - Markdown 自身的标记（标题、链接、引用…）只在源码模式下着色，预览模式由装饰接管。
 */
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { mathTag } from "./syntax";

export const markdownHighlightStyle = HighlightStyle.define([
  // Markdown 自身
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], class: "tok-heading" },
  { tag: t.emphasis, class: "tok-em" },
  { tag: t.strong, class: "tok-strong" },
  { tag: t.strikethrough, class: "tok-strike" },
  { tag: t.link, class: "tok-link" },
  { tag: t.url, class: "tok-url" },
  { tag: t.monospace, class: "tok-mono" },
  { tag: t.quote, class: "tok-quote" },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator, t.labelName], class: "tok-meta" },
  { tag: [t.angleBracket, t.documentMeta], class: "tok-html" },
  { tag: mathTag, class: "tok-math" },
  // 代码块里的语言
  {
    tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier],
    class: "tok-kw",
  },
  { tag: [t.string, t.special(t.string), t.regexp, t.escape], class: "tok-str" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: "tok-cmt" },
  { tag: [t.number, t.integer, t.float], class: "tok-num" },
  { tag: [t.bool, t.null, t.atom, t.self], class: "tok-lit" },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))],
    class: "tok-fn",
  },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], class: "tok-type" },
  { tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)], class: "tok-var" },
  { tag: [t.operator, t.punctuation, t.bracket], class: "tok-op" },
]);

export const markdownHighlighting = syntaxHighlighting(markdownHighlightStyle);
