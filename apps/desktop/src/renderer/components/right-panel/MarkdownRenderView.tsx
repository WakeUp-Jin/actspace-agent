import { memo, useContext, useRef, useState, createContext, type AnchorHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { LANGUAGE_MODULES } from "./highlight";
import { loadAppearance } from "../../appearance/storage";
import { MermaidDiagramBlock } from "../messages/MermaidDiagramBlock";
import { codeText, fenceLanguage } from "../messages/MarkdownProse";
import { splitMarkdownBlocks, type MarkdownBlock, type MarkdownBlockSplit } from "../messages/markdown-blocks";
import { isFenceClosed, isMermaidLanguage } from "../messages/mermaid-renderer";

/**
 * Markdown 预览正文（见 `front-右侧面板与文件渲染规范.md`「Markdown 渲染」和 `front-文档面板规范.md`）。
 * 预览 / 源码切换、滚动容器和操作栏在「文档」面板（`docs/DocsReader.tsx`），这里只负责把一段 Markdown 渲染出来。
 *
 * 渲染栈：react-markdown + remark-gfm（表格 / 任务列表）+ rehype-highlight（highlight.js）。
 * Mermaid：闭合的 ```mermaid 围栏复用聊天区的 `MermaidDiagramBlock`（源码按不可信输入处理，渲染失败回退显示源码）。
 * 长文档按顶层块拆开渲染（`splitMarkdownBlocks`），块内容不变时整块跳过。
 * 安全：**不引 rehype-raw**，原始 HTML 一律转义不渲染；链接经默认 urlTransform 过滤后再统一加 target/rel。
 * 配色：包一层 `markdown-doc`，代码块与 hljs token 配色在 `markdown.css` 内随主题翻转。
 */

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

/** 当前块的原文，用来判断 mermaid 围栏是否已闭合。 */
const BlockSourceContext = createContext("");

type PositionedNode = { position?: { start?: { offset?: number }; end?: { offset?: number } } };

function MermaidFence({ children }: { children: ReactNode }) {
  const [themeId] = useState(() => loadAppearance().mermaidTheme);
  return <MermaidDiagramBlock source={codeText(children).replace(/\n$/, "")} themeId={themeId} sourceView={children} />;
}

/** 闭合的 mermaid 围栏换成图；其余围栏保持原来的代码块。 */
function MarkdownPre({ node, ...props }: ComponentPropsWithoutRef<"pre"> & { node?: PositionedNode }) {
  const markdown = useContext(BlockSourceContext);
  if (isMermaidLanguage(fenceLanguage(props.children))) {
    const start = node?.position?.start?.offset;
    const end = node?.position?.end?.offset;
    if (start !== undefined && end !== undefined && isFenceClosed(markdown.slice(start, end))) {
      return <MermaidFence>{props.children}</MermaidFence>;
    }
  }
  return <pre {...props} />;
}

/** 宽表格在自己的容器里横向滚动，不撑宽整篇正文。 */
function MarkdownTable(props: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="markdown-table-wrap">
      <table {...props} />
    </div>
  );
}

const MARKDOWN_COMPONENTS: Components = { a: MarkdownLink, pre: MarkdownPre, table: MarkdownTable };

const MarkdownBlockView = memo(function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  return (
    <BlockSourceContext.Provider value={block.source}>
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rehypePlugins={REHYPE_PLUGINS as any}
        components={MARKDOWN_COMPONENTS}
      >
        {block.source}
      </Markdown>
    </BlockSourceContext.Provider>
  );
}, (previous, next) => previous.block.source === next.block.source);

/** Markdown 预览正文（不含滚动容器）：文件预览和「文档」面板共用。 */
export const MarkdownPreviewBody = memo(function MarkdownPreviewBody({ source }: { source: string }) {
  const split = useRef<MarkdownBlockSplit | undefined>(undefined);
  split.current = splitMarkdownBlocks(source, split.current);
  return (
    <div className="markdown-prose markdown-doc act-code-hl">
      {split.current.blocks.map((block) => <MarkdownBlockView key={block.start} block={block} />)}
    </div>
  );
});
