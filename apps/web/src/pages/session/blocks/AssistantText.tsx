import { Check, Copy } from "lucide-react";
import { isValidElement, useState, type ComponentProps, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconButton } from "../../../ui/IconButton";

const SAFE_PROTOCOL = /^(https?:|mailto:)/i;

/** 只放行 http(s)/mailto；其余协议（javascript: 等）不输出 href。相对链接和锚点也不放行。 */
export const safeHref = (href: string | undefined): string | undefined => (href && SAFE_PROTOCOL.test(href.trim()) ? href : undefined);

function Link({ href, children }: ComponentProps<"a">) {
  const safe = safeHref(href);
  return safe ? <a href={safe} target="_blank" rel="noreferrer">{children}</a> : <a>{children}</a>;
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** 复制后图标变成对勾 1.5 秒。剪贴板不可用（非 HTTPS）时不报错。 */
export function CopyButton({ text, label = "复制", size = 13 }: { readonly text: string; readonly label?: string; readonly size?: number }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => undefined);
  };
  return <IconButton label={done ? "已复制" : label} size="xs" tone="faint" onClick={copy}>{done ? <Check size={size} aria-hidden /> : <Copy size={size} aria-hidden />}</IconButton>;
}

/** 代码块：顶栏语言 + 复制。 */
function CodeBlock({ children }: ComponentProps<"pre">) {
  const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const language = /language-([\w+-]+)/.exec(code?.props.className ?? "")?.[1] ?? "";
  const text = textOf(code?.props.children ?? children).replace(/\n$/, "");
  return (
    <div className="code-block">
      <div className="code-block-bar"><span>{language || "text"}</span><CopyButton text={text} label="复制代码" /></div>
      <pre>{children}</pre>
    </div>
  );
}

const components = {
  a: Link,
  pre: CodeBlock,
  table: ({ children }: ComponentProps<"table">) => <div className="md-table"><table>{children}</table></div>,
};

/** 助手回复：Markdown，无气泡。不启用 rehype-raw，HTML 标签按文本显示。 */
export function AssistantText({ content }: { readonly content: string }) {
  return (
    <div className="md">
      <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={url => safeHref(url) ?? ""}>{content}</Markdown>
    </div>
  );
}
