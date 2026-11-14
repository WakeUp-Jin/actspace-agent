import { type ScriptCommand, scriptLanguageLabel, scriptLineCount } from "@actspace/shared/runtime-v2";
import { useMemo, useState } from "react";
import { highlightToLines } from "../right-panel/highlight";
import { PlainButton } from "../ui/PlainButton";

/** 超过这个行数的脚本正文默认只露出前 FOLD_TO 行（设计 agent-script-execution §2.6）。 */
export const SCRIPT_FOLD_OVER_LINES = 12;
const FOLD_TO = 8;

const SHELL_CLASS = "script-source act-code-hl min-w-0 overflow-hidden rounded-act-md border border-line";
const HEAD_CLASS = "script-source-head flex min-h-7 items-center gap-2.5 px-3 text-act-xs leading-snug text-text-faint";
const BODY_CLASS =
  "script-source-body m-0 overflow-x-auto px-3 pb-2.5 font-mono text-[length:var(--act-font-mono-size,13px)] leading-relaxed text-text-main";
const FOLD_CLASS = "script-source-fold block w-full px-3 py-1.5 text-act-xs text-text-muted hover:text-text-main";

/**
 * Bash 卡片里的脚本正文：`python -c '...'` / heredoc 的内容按语言高亮成代码块，长脚本默认折叠。
 * 只给已定稿的命令用（审批卡与执行详情），不处理流式；高亮结果按正文 memo，重渲染不重算。
 */
/** `className` 给背景：审批卡里用 `bg-surface-subtle`，执行详情的浅色容器里用 `bg-surface`。 */
export function ScriptSourceBlock({
  script,
  source,
  className = "bg-surface-subtle",
}: {
  script: ScriptCommand;
  source: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const body = useMemo(() => source.replace(/^\n+|\n+$/g, ""), [source]);
  const lines = useMemo(() => highlightToLines(body, script.language), [body, script.language]);
  const total = scriptLineCount(source);
  const foldable = total > SCRIPT_FOLD_OVER_LINES;
  const folded = foldable && !expanded;
  const visible = folded ? lines.slice(0, FOLD_TO) : lines;
  return (
    <div className={`${SHELL_CLASS} ${className}`} data-folded={folded ? "true" : undefined}>
      <div className={HEAD_CLASS}>
        <span className="flex-none">{scriptLanguageLabel(script.language)}</span>
        <span className="flex-1" />
        <span className="flex-none">{total} 行</span>
      </div>
      <pre className={BODY_CLASS}>
        {visible.map((html, index) => (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: html 来自 highlight.js，自带转义，不含外部原始 HTML。
          <span key={index} className="block" dangerouslySetInnerHTML={{ __html: html || " " }} />
        ))}
      </pre>
      {foldable ? (
        <PlainButton className={FOLD_CLASS} aria-expanded={!folded} onClick={() => setExpanded((value) => !value)}>
          {folded ? `展开全部 ${total} 行` : "收起"}
        </PlainButton>
      ) : null}
    </div>
  );
}

/** 审批卡与执行行上的脚本摘要：`运行 Python 脚本（12 行）` / `运行 Python 脚本 analyze.py`。 */
export function scriptSummary(script: ScriptCommand, prefix = ""): string {
  const label = scriptLanguageLabel(script.language);
  if (script.source !== undefined) return `${prefix}${label} 脚本（${scriptLineCount(script.source)} 行）`;
  return `${prefix}${label} 脚本 ${scriptFileName(script.path ?? "")}`;
}

export function scriptFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
