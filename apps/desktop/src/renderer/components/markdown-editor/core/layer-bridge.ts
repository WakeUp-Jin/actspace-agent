/**
 * 让 `styles/markdown-editor.css` 真正生效的桥接主题。
 *
 * 问题：样式文件按规范用 `@import … layer(components)` 引入；CodeMirror 运行时注入的自带主题
 * （`@codemirror/view` 和 `@codemirror/search` 的 baseTheme）不在任何 cascade layer 里。
 * 按层叠规则，不在层里的普通声明总是压过层里的声明，与选择器优先级无关，
 * 所以样式文件里凡是 CodeMirror 自带主题也设置了的属性都不生效：
 * 正文变成 monospace、`.cm-line` 的内边距（引用竖条、列表悬挂缩进、代码块、表格）、
 * 表格行的 `display: flex`、预览居中的 `margin: 0 auto`、行号栏和搜索面板的颜色等。
 *
 * 做法：对这些属性写 `revert-layer`。它出现在不在层里的声明中时，会回退到 layer 里的取值，
 * 也就是 `markdown-editor.css` 写的值；视觉取值仍然只写在样式文件里。
 *
 * 优先级：`EditorView.theme` 的优先级高于所有 baseTheme，挂载在它们之后；
 * 下面每条选择器的优先级都不低于 CodeMirror 对应的那条（`&light X` 编译成 `.ͼ2 X`，和 `& X` 相同），
 * 同优先级时按挂载顺序取后者，所以这里的 `revert-layer` 会生效。
 *
 * 注意：`revert-layer` 会一路回退到 layer 里的取值，样式文件没写时就落到 base 层（Tailwind preflight）。
 * 所以只桥接样式文件确实写了的元素和属性，选择器要和样式文件的范围一致。
 *
 * 维护：样式文件给 CodeMirror 自带主题也设置的元素和属性加规则时，把属性补到这里。
 * 选区背景在样式文件里已经用了 `!important`（layer 里的 important 压过不在层里的普通声明），不用桥接。
 */
import { EditorView } from "@codemirror/view";

const REVERT = "revert-layer";

export const cssLayerBridge = EditorView.theme({
  "&.cm-focused": { outline: REVERT },
  "& .cm-scroller": { fontFamily: REVERT, lineHeight: REVERT },
  "& .cm-content": { padding: REVERT, margin: REVERT, caretColor: REVERT },
  "& .cm-line": { padding: REVERT },
  "& .cm-line.md-tr": { display: REVERT },
  "& .cm-cursor": { borderLeft: REVERT },
  // 只在样式文件给了值的地方回退：别处回退会落到 Tailwind preflight 的 `img { display: block }`（缓冲节点是 img），行内元素会各占一行
  "& .md-code-line .cm-widgetBuffer, & .md-tr .cm-widgetBuffer": { display: REVERT },
  "& .cm-gutters": { background: REVERT, color: REVERT, border: REVERT },
  "& .cm-gutters.cm-gutters-before": { border: REVERT },
  "& .cm-lineNumbers .cm-gutterElement": { padding: REVERT },
  "& .cm-panels": { background: REVERT, color: REVERT },
  "& .cm-panels-top": { borderBottomColor: REVERT },
  "& .cm-textfield": { background: REVERT, color: REVERT, fontSize: REVERT, border: REVERT },
  "& .cm-button, & .cm-button:active": {
    background: REVERT,
    color: REVERT,
    fontSize: REVERT,
    border: REVERT,
    borderRadius: REVERT,
  },
  "& .cm-searchMatch, & .cm-searchMatch-selected": { background: REVERT },
});
