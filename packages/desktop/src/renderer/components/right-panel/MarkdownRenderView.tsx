import { useState, type AnchorHTMLAttributes } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { PreviewSourceToggle, type PreviewMode } from "./PreviewSourceToggle";

/**
 * 右侧面板 Markdown 渲染视图（V1，见 `Markdown渲染规范.md`）。
 *
 * 渲染栈：react-markdown + remark-gfm（表格 / 任务列表）+ rehype-highlight（highlight.js）。
 * 安全：**不引 rehype-raw**，原始 HTML 一律转义不渲染；链接经默认 urlTransform 过滤后再统一加 target/rel。
 * 配色：包一层 `markdown-doc`，代码块与 hljs token 配色在 `markdown.css` 内随主题翻转。
 */

const TOOLBAR_CLASS = "flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-1.5";
const PATH_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-text-faint";
const PREVIEW_SCROLL_CLASS = "min-h-0 flex-1 overflow-auto p-[18px] text-[13px] leading-[1.7] text-text-main";
const SOURCE_CLASS =
  "m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-[1.55] text-text-main";

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [[rehypeHighlight, { detect: true, ignoreMissing: true }]] as const;

function MarkdownLink({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

const MARKDOWN_COMPONENTS = { a: MarkdownLink };

export function MarkdownRenderView({ source, relativePath }: { source: string; relativePath?: string }) {
  const [mode, setMode] = useState<PreviewMode>("preview");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={TOOLBAR_CLASS}>
        <span className={PATH_CLASS} title={relativePath}>
          {relativePath ?? "Markdown 预览"}
        </span>
        <PreviewSourceToggle mode={mode} onChange={setMode} />
      </div>
      {mode === "preview" ? (
        <div className={PREVIEW_SCROLL_CLASS}>
          <div className="markdown-prose markdown-doc act-code-hl">
            <Markdown
              remarkPlugins={REMARK_PLUGINS}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              rehypePlugins={REHYPE_PLUGINS as any}
              components={MARKDOWN_COMPONENTS}
            >
              {source}
            </Markdown>
          </div>
        </div>
      ) : (
        <pre className={SOURCE_CLASS}>
          <code>{source}</code>
        </pre>
      )}
    </div>
  );
}
