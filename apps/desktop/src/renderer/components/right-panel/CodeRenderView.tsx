import { memo, useMemo } from "react";
import { highlightToLines } from "./highlight";
import { VirtualCodeView } from "./VirtualCodeView";

/**
 * 文本 / 代码文件视图。
 *
 * 三件事（见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`）：
 * - **行号**：CSS grid 双列，每个逻辑行一个 grid row，所以软换行的续行仍落在同一 row 内，
 *   不会与行号错位；gutter 带 `select-none`，复制内容不会把行号一起带走。
 * - **软换行固定开启**：不提供开关。长行横向滚动在窄面板里比折行更难读，
 *   而右侧面板本来就窄，所以直接按折行呈现。
 * - **有界窗口**：大文件只挂载可见及相邻行，软换行动态测量；复制依据源文本偏移。
 *
 * 本视图**没有工具栏**：查找 / 复制 / 换行开关都不放在这里。文件级动作集中在上方的
 * 工作区操作栏，视图本身只负责把内容读得清楚。
 * 颜色全部走语义 token，浅深两态都随主题翻转。
 */

const ROOT_CLASS = "flex min-h-0 flex-1 flex-col";
const SCROLL_CLASS = "min-h-0 flex-1 overflow-auto";
// 折行时宽度必须是 `w-full`：`w-max` 会让 grid 取内容宽度，代码列那个 `1fr` 跟着变成
// 「最长行的宽度」，`whitespace-pre-wrap` 就永远没有需要折行的机会。
const GRID_CLASS = "grid w-full grid-cols-[auto_1fr] font-mono text-act-xs leading-[1.55]";
// sticky left-0：折行后仍可能有单个超长不可断 token 顶出横向滚动，行号跟着滚走就看不出在第几行。
// 需要不透明背景（bg-surface-subtle）压住从下面滚过去的代码。
const GUTTER_CLASS =
  "sticky left-0 z-1 select-none border-r border-line bg-surface-subtle px-2 text-right text-text-faint [font-variant-numeric:tabular-nums]";
const LINE_CLASS = "min-w-0 whitespace-pre-wrap break-words px-3 text-text-main";
const FOOTER_CLASS = "border-t border-line bg-surface-subtle px-3 py-1.5 text-act-xxs text-text-faint";

const VIRTUAL_LINE_THRESHOLD = 4000;
const VIRTUAL_CHAR_THRESHOLD = 256 * 1024;

/**
 * 最多渲染这么多行。
 *
 * 每个逻辑行是两个 DOM 节点（行号 + 代码），2MB 的日志能有二十万行 ——
 * 四十万个节点会把面板卡死几十秒。旧实现是单个 `<pre>`（一个节点）所以不受影响，
 * 换成按行渲染就必须自己设上限，否则是拿大文件的可用性换行号。
 * 这个数覆盖了绝大多数源码文件（本仓库最长的 pnpm-lock.yaml 也只有约一万行）。
 */
const MAX_RENDERED_LINES = 20000;

export function CodeRenderView({ content, language }: { content: string; language?: string }) {
  const allLines = useMemo(() => content.split("\n"), [content]);
  // 超长文件只渲染前 MAX_RENDERED_LINES 行；截断也发生在高亮之前，避免白算后面那些。
  const hiddenLineCount = Math.max(0, allLines.length - MAX_RENDERED_LINES);
  const plainLines = useMemo(
    () => (hiddenLineCount > 0 ? allLines.slice(0, MAX_RENDERED_LINES) : allLines),
    [allLines, hiddenLineCount],
  );
  const renderedContent = useMemo(
    () => (hiddenLineCount > 0 ? plainLines.join("\n") : content),
    [hiddenLineCount, plainLines, content],
  );
  const isLarge = plainLines.length > VIRTUAL_LINE_THRESHOLD || renderedContent.length > VIRTUAL_CHAR_THRESHOLD;
  const highlightedLines = useMemo(() => isLarge ? [] : highlightToLines(renderedContent, language), [renderedContent, language, isLarge]);
  const footer = hiddenLineCount > 0 ? (
    <div className={FOOTER_CLASS} role="status">
      {`仅渲染前 ${MAX_RENDERED_LINES.toLocaleString()} 行，另有 ${hiddenLineCount.toLocaleString()} 行未显示`}
    </div>
  ) : null;

  if (isLarge) return (
    <div className={ROOT_CLASS}>
      <VirtualCodeView lines={plainLines} language={language}
        renderLine={(index, html) => <LineRow lineNumber={index + 1} html={html} />}>
        {footer}
      </VirtualCodeView>
    </div>
  );

  return (
    <div className={ROOT_CLASS}>
      <div className={SCROLL_CLASS}>
        <div className={`${GRID_CLASS} act-code-hl`} role="presentation">
          {plainLines.map((_, index) => (
            <LineRow key={index} lineNumber={index + 1} html={highlightedLines[index] ?? ""} />
          ))}
        </div>
        {footer}
      </div>
    </div>
  );
}

const LineRow = memo(function LineRow({ lineNumber, html }: { lineNumber: number; html: string }) {
  return (
    <>
      <span className={GUTTER_CLASS} aria-hidden="true" data-line-number={lineNumber}>
        {lineNumber}
      </span>
      <code
        className={LINE_CLASS}
        data-line-index={lineNumber - 1}
        // html 来自 highlight.js，自带转义，不含外部原始 HTML。
        dangerouslySetInnerHTML={{ __html: html || "\u200b" }}
      />
    </>
  );
});

