import { Check, Copy } from "lucide-react";
import { Children, createContext, isValidElement, memo, useContext, useId, useMemo, useRef, useState, type AnchorHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { LANGUAGE_MODULES } from "../right-panel/highlight";
import { loadAppearance } from "../../appearance/storage";
import { MermaidDiagramBlock } from "./MermaidDiagramBlock";
import { isFenceClosed, isMermaidLanguage } from "./mermaid-renderer";
import { ReplyStreamingContext } from "./reply-streaming-context";
import { splitMarkdownBlocks, type MarkdownBlock, type MarkdownBlockSplit } from "./markdown-blocks";

/** Raw markdown of the block being rendered, so fence handlers can tell whether a streaming fence has closed. */
const MarkdownSourceContext = createContext("");
/** 工作区链接的打开方式走 context，components 映射因此保持稳定，冻结块不用跟着重渲染。 */
const WorkspaceFileContext = createContext<((path: string) => void) | undefined>(undefined);
const FootnotePrefixContext = createContext("user-content-");

function MarkdownLink({ href, children, node: _node, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  const onOpenWorkspaceFile = useContext(WorkspaceFileContext);
  const footnotePrefix = useContext(FootnotePrefixContext);
  const isFragment = href?.startsWith("#");
  const isWorkspacePath = Boolean(href && onOpenWorkspaceFile && !/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href));
  return (
    <a
      {...rest}
      href={href}
      target={isWorkspacePath || isFragment ? undefined : "_blank"}
      rel={isWorkspacePath || isFragment ? undefined : "noreferrer noopener"}
      aria-describedby={rest["aria-describedby"]?.split(/\s+/).map((id) => id === "footnote-label" ? `${footnotePrefix}footnote-label` : id).join(" ")}
      onClick={(event) => {
        rest.onClick?.(event);
        if (event.defaultPrevented) return;
        if (isFragment && href) {
          event.preventDefault();
          let id: string;
          try { id = decodeURIComponent(href.slice(1)); } catch { return; }
          // Resolve within this reply; never navigate the Electron file URL or another reply.
          const reply = event.currentTarget.closest(".markdown-prose");
          const target = Array.from(reply?.querySelectorAll<HTMLElement>("[id]") ?? []).find((element) => element.id === id);
          if (!target) return;
          target.scrollIntoView({ block: "center" });
          if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
            target.setAttribute("tabindex", "-1");
            target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
          }
          target.focus({ preventScroll: true });
        } else if (isWorkspacePath && href) {
          event.preventDefault();
          onOpenWorkspaceFile?.(href);
        }
      }}
    >{children}</a>
  );
}

function MarkdownHeading({ id, node: _node, ...props }: ComponentPropsWithoutRef<"h2"> & { node?: unknown }) {
  const footnotePrefix = useContext(FootnotePrefixContext);
  return <h2 {...props} id={id === "footnote-label" ? `${footnotePrefix}footnote-label` : id} />;
}

function codeText(children: ReactNode): string {
  return Children.toArray(children).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (isValidElement<{ children?: ReactNode }>(child)) return codeText(child.props.children);
    return "";
  }).join("");
}

type PositionedNode = { position?: { start?: { offset?: number }; end?: { offset?: number } } };

function fenceLanguage(children: ReactNode): string | undefined {
  const codeElement = Children.toArray(children).find(isValidElement);
  const className = isValidElement<{ className?: string }>(codeElement) ? codeElement.props.className : undefined;
  return className?.match(/language-([\w-]+)/)?.[1];
}

function MermaidFence({ children }: { children: ReactNode }) {
  const [themeId] = useState(() => loadAppearance().mermaidTheme);
  return <MermaidDiagramBlock source={codeText(children).replace(/\n$/, "")} themeId={themeId} sourceView={children} />;
}

/** Closed ```mermaid fences become diagrams once the turn has finished; everything else (including fences streamed in this turn) stays a code block. */
function MarkdownPre({ node, ...props }: ComponentPropsWithoutRef<"pre"> & { node?: PositionedNode }) {
  const markdown = useContext(MarkdownSourceContext);
  const turnStreaming = useContext(ReplyStreamingContext);
  if (!turnStreaming && isMermaidLanguage(fenceLanguage(props.children))) {
    const start = node?.position?.start?.offset;
    const end = node?.position?.end?.offset;
    if (start !== undefined && end !== undefined && isFenceClosed(markdown.slice(start, end))) {
      return <MermaidFence>{props.children}</MermaidFence>;
    }
  }
  return <MarkdownCodeBlock {...props} />;
}

function MarkdownCodeBlock({ children, ...rest }: ComponentPropsWithoutRef<"pre">) {
  const [copied, setCopied] = useState(false);
  const text = codeText(children);
  const language = fenceLanguage(children);
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_200);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="markdown-code-shell">
      <div className="markdown-code-toolbar">
        <span>{language ?? "code"}</span>
        <button type="button" className="markdown-code-copy" onClick={() => void copy()} aria-label="复制代码">
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      <pre {...rest} className="markdown-code-block">{children}</pre>
    </div>
  );
}

const REMARK_PLUGINS = [remarkGfm];
// 语言自动识别要把每个高亮器都跑一遍：还在写的代码围栏每帧都会变，只按标注的语言高亮，闭合后再识别。
const HIGHLIGHT_OPTIONS = { ignoreMissing: true, languages: LANGUAGE_MODULES };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SETTLED_REHYPE_PLUGINS = [[rehypeHighlight, { ...HIGHLIGHT_OPTIONS, detect: true }]] as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OPEN_FENCE_REHYPE_PLUGINS = [[rehypeHighlight, { ...HIGHLIGHT_OPTIONS, detect: false }]] as any;
const COMPONENTS: Components = { a: MarkdownLink, pre: MarkdownPre, h2: MarkdownHeading };

function isOpenFence(source: string): boolean {
  const block = source.trimStart();
  return /^(`{3,}|~{3,})/.test(block) && !isFenceClosed(block);
}

/** 一个顶层块单独解析渲染；块对象没变时整块跳过。 */
const MarkdownBlockView = memo(function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  const clobberPrefix = useContext(FootnotePrefixContext);
  const remarkRehypeOptions = useMemo(() => ({ clobberPrefix }), [clobberPrefix]);
  return (
    <MarkdownSourceContext.Provider value={block.source}>
      <Markdown remarkPlugins={REMARK_PLUGINS} remarkRehypeOptions={remarkRehypeOptions} rehypePlugins={isOpenFence(block.source) ? OPEN_FENCE_REHYPE_PLUGINS : SETTLED_REHYPE_PLUGINS} components={COMPONENTS}>
        {block.source}
      </Markdown>
    </MarkdownSourceContext.Provider>
  );
});

/** Chat replies use the same GFM and highlight.js pipeline as the file preview, split into blocks so streaming only re-parses the tail. */
export const MarkdownProse = memo(function MarkdownProse({ content, onOpenWorkspaceFile }: { content: string; onOpenWorkspaceFile?: (path: string) => void }) {
  const id = useId();
  const split = useRef<MarkdownBlockSplit | undefined>(undefined);
  split.current = splitMarkdownBlocks(content, split.current);
  const streaming = useContext(ReplyStreamingContext);
  return (
    <div className="markdown-prose act-code-hl" data-streaming={streaming ? "true" : undefined}>
      <WorkspaceFileContext.Provider value={onOpenWorkspaceFile}>
        <FootnotePrefixContext.Provider value={`user-content-${id.replace(/:/g, "")}-`}>
          {split.current.blocks.map((block) => <MarkdownBlockView key={block.start} block={block} />)}
        </FootnotePrefixContext.Provider>
      </WorkspaceFileContext.Provider>
    </div>
  );
});
