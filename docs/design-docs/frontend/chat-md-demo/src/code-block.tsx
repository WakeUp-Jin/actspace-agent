/**
 * 代码块：语言 + 文件名标题（```ts title="a/b.ts"，标题是路径时可点开）、自动换行、复制、
 * 行号（按版本）、超长折叠；流式中围栏还没闭合时显示「写入中 · N 行」。
 * 稳定性：流式中代码块自然往下长，不封顶、不滚动；只有一开始就是完整的块（历史回复）才折叠，
 * 刚流式写完的块不会突然收起。
 */
import { Check, Copy, FileText, WrapText } from "lucide-react";
import { Children, isValidElement, useContext, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { HostContext, StreamContext, VariantContext, parsePath } from "./shared";

const FOLD_LINES = 18;
const LANG_LABEL: Record<string, string> = {
  ts: "TypeScript", tsx: "TSX", typescript: "TypeScript", js: "JavaScript", jsx: "JSX", javascript: "JavaScript",
  bash: "Shell", sh: "Shell", zsh: "Shell", shell: "Shell", json: "JSON", py: "Python", python: "Python",
  css: "CSS", html: "HTML", yaml: "YAML", yml: "YAML", rust: "Rust", go: "Go", diff: "Diff", sql: "SQL", md: "Markdown",
};

export function codeText(children: ReactNode): string {
  return Children.toArray(children).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (isValidElement<{ children?: ReactNode }>(child)) return codeText(child.props.children);
    return "";
  }).join("");
}

function codeInfo(children: ReactNode): { language?: string; meta?: string } {
  const el = Children.toArray(children).find(isValidElement) as { props?: { className?: string; "data-meta"?: string } } | undefined;
  return { language: el?.props?.className?.match(/language-([\w-]+)/)?.[1], meta: el?.props?.["data-meta"] };
}

function parseTitle(meta?: string): string | undefined {
  if (!meta) return undefined;
  return meta.match(/title=(?:"([^"]+)"|'([^']+)'|(\S+))/)?.slice(1).find(Boolean);
}

export function CodeBlock({ children, node: _node, ...rest }: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
  const host = useContext(HostContext);
  const spec = useContext(VariantContext);
  const { fenceOpen } = useContext(StreamContext);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [wrap, setWrap] = useState(false);
  const text = codeText(children);
  const lines = text.replace(/\n$/, "").split("\n").length;
  // 挂载时就已闭合才允许折叠；流式写出来的块保持展开
  const [settledAtMount] = useState(!fenceOpen);
  const foldable = settledAtMount && lines > FOLD_LINES + 4;
  const { language, meta } = codeInfo(children);
  const title = parseTitle(meta);
  const titlePath = title ? parsePath(title) : null;
  const folded = foldable && !open && !fenceOpen;

  const gutter = spec.lineNumbers && !wrap
    ? <div className="md-code-gutter" aria-hidden="true">{Array.from({ length: lines }, (_, i) => i + 1).join("\n")}</div>
    : null;

  return (
    <div className="markdown-code-shell md-code" data-folded={folded ? "true" : undefined} data-wrap={wrap ? "true" : undefined} data-live={fenceOpen ? "true" : undefined}>
      <div className="markdown-code-toolbar md-code-head">
        <span className="md-code-lang">{language ? LANG_LABEL[language] ?? language : "文本"}</span>
        {title ? (
          titlePath
            ? <button type="button" className="md-code-title is-path" title={`在 ActSpace 中打开 ${title}`} onClick={() => host.openPath(titlePath.path, titlePath.line)}><FileText size={12} aria-hidden="true" /><span>{title}</span></button>
            : <span className="md-code-title"><span>{title}</span></span>
        ) : null}
        <span className="md-code-spacer" />
        {fenceOpen ? (
          <span className="md-code-live"><i />写入中 · {lines} 行</span>
        ) : (
          <span className="md-code-actions">
            <button type="button" className="md-code-btn" aria-pressed={wrap} title="自动换行" onClick={() => setWrap(!wrap)}><WrapText size={13} /><span>换行</span></button>
            <button type="button" className="md-code-btn" title="复制" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
              {copied ? <Check size={13} /> : <Copy size={13} />}<span>{copied ? "已复制" : "复制"}</span>
            </button>
          </span>
        )}
      </div>
      <div className="md-code-body">
        {gutter}
        <pre {...rest} className="markdown-code-block">{children}</pre>
      </div>
      {foldable && !fenceOpen ? (
        <button type="button" className="md-code-fold" onClick={() => setOpen(!open)}>{open ? "收起" : `展开全部 ${lines} 行`}</button>
      ) : null}
    </div>
  );
}
