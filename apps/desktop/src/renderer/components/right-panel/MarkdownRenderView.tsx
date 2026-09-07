import { useState, type AnchorHTMLAttributes } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CodeRenderView } from "./CodeRenderView";
import { LANGUAGE_MODULES } from "./highlight";
import { PreviewSourceToggle, type PreviewMode } from "./PreviewSourceToggle";

/**
 * 右侧面板 Markdown 渲染视图（V1，见 `front-右侧面板与文件渲染规范.md`）。
 *
 * 渲染栈：react-markdown + remark-gfm（表格 / 任务列表）+ rehype-highlight（highlight.js）。
 * 安全：**不引 rehype-raw**，原始 HTML 一律转义不渲染；链接经默认 urlTransform 过滤后再统一加 target/rel。
 * 配色：包一层 `markdown-doc`，代码块与 hljs token 配色在 `markdown.css` 内随主题翻转。
 */

// 只有「聊天生成的 markdown」才用到这条工具栏：它没有工作区操作栏可以挂切换按钮。
const TOOLBAR_CLASS = "flex shrink-0 items-center justify-end gap-2 border-b border-line px-3 py-1.5";
const PREVIEW_SCROLL_CLASS = "min-h-0 flex-1 overflow-auto p-[18px] text-[13px] leading-[1.7] text-text-main";

const REMARK_PLUGINS = [remarkGfm];

/**
 * fenced code 复用文件视图那套语言表。
 *
 * `languages` 是**替换**默认的 lowlight `common`，不是追加。换掉的收益是覆盖面对齐：
 * dockerfile / protobuf / dart / cmake / powershell 等原来在 fence 里根本不着色。
 * 代价是 common 独有的 arduino / objectivec / php-template / python-repl / vbnet / wasm
 * 不再支持 —— 本仓库不写这些语言，够换。
 *
 * 注意这里换不来体积：rehype-highlight 无条件静态 import 了 `common`，摇不掉。
 */
const REHYPE_PLUGINS = [
  [rehypeHighlight, { detect: true, ignoreMissing: true, languages: LANGUAGE_MODULES }],
] as const;

function MarkdownLink({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

const MARKDOWN_COMPONENTS = { a: MarkdownLink };

/**
 * `mode` / `onModeChange` 一起传 = 受控（切换按钮在工作区操作栏上，视图不再自带工具栏）；
 * 都不传 = 自持状态并渲染视图内的分段控件，供没有操作栏的聊天 markdown 使用。
 */
export function MarkdownRenderView({
  source,
  mode,
  onModeChange,
}: {
  source: string;
  mode?: PreviewMode;
  onModeChange?: (mode: PreviewMode) => void;
}) {
  const [ownMode, setOwnMode] = useState<PreviewMode>("preview");
  const activeMode = mode ?? ownMode;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {onModeChange ? null : (
        <div className={TOOLBAR_CLASS}>
          <PreviewSourceToggle mode={activeMode} onChange={setOwnMode} />
        </div>
      )}
      {activeMode === "preview" ? (
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
        // 源码态复用代码视图：早期这里是裸 <pre>，既没有行号也不高亮，
        // 和「代码文件 Tab」两套体验不一致。
        <CodeRenderView content={source} language="markdown" />
      )}
    </div>
  );
}
