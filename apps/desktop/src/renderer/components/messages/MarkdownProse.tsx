import { Check, Copy } from "lucide-react";
import { Children, isValidElement, useState, type AnchorHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { LANGUAGE_MODULES } from "../right-panel/highlight";

function MarkdownLink({ href, children, onOpenWorkspaceFile, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { onOpenWorkspaceFile?: (path: string) => void }) {
  const isWorkspacePath = Boolean(href && onOpenWorkspaceFile && !/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href));
  return (
    <a
      {...rest}
      href={href}
      target={isWorkspacePath ? undefined : "_blank"}
      rel={isWorkspacePath ? undefined : "noreferrer noopener"}
      onClick={(event) => {
        rest.onClick?.(event);
        if (!event.defaultPrevented && isWorkspacePath && href) {
          event.preventDefault();
          onOpenWorkspaceFile?.(href);
        }
      }}
    >{children}</a>
  );
}

function codeText(children: ReactNode): string {
  return Children.toArray(children).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (isValidElement<{ children?: ReactNode }>(child)) return codeText(child.props.children);
    return "";
  }).join("");
}

function MarkdownPre({ children, ...rest }: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
  const [copied, setCopied] = useState(false);
  const text = codeText(children);
  const codeElement = Children.toArray(children).find(isValidElement);
  const className = isValidElement<{ className?: string }>(codeElement) ? codeElement.props.className : undefined;
  const language = className?.match(/language-([\w-]+)/)?.[1];
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

/** Chat replies use the same GFM and highlight.js pipeline as the file preview. */
export function MarkdownProse({ content, onOpenWorkspaceFile }: { content: string; onOpenWorkspaceFile?: (path: string) => void }) {
  return (
    <div className="markdown-prose act-code-hl">
      <Markdown
        remarkPlugins={[remarkGfm]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true, languages: LANGUAGE_MODULES }]] as any}
        components={{
          a: (props) => <MarkdownLink {...props} onOpenWorkspaceFile={onOpenWorkspaceFile} />,
          pre: MarkdownPre,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
