import { Check, Copy, FileText, TextWrap } from "lucide-react";
import { useContext, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { loadAppearance } from "../../../appearance/storage";
import { parseInlinePath, resolveWorkspacePath } from "../../markdown-common/paths";
import { PlainButton } from "../../ui/PlainButton";
import { MermaidDiagramBlock } from "../MermaidDiagramBlock";
import { isFenceClosed, isMermaidLanguage } from "../mermaid-renderer";
import { codeText, fenceLanguage, fenceMeta } from "./code-text";
import { BlockStateContext, ProseStreamingContext } from "./contexts";
import { MarkdownHostContext } from "./host";
import { parseCodeTitle } from "./remark-code-meta";

/** 挂载时就已闭合、行数超过这个值才折叠；折叠后只露出前 FOLD_TO 行（规范 §5.2）。 */
const FOLD_OVER_LINES = 22;

const LANGUAGE_LABEL: Record<string, string> = {
  ts: "TypeScript", typescript: "TypeScript", tsx: "TSX", js: "JavaScript", javascript: "JavaScript", jsx: "JSX", mjs: "JavaScript", cjs: "JavaScript",
  bash: "Shell", sh: "Shell", zsh: "Shell", shell: "Shell", console: "Shell", json: "JSON", jsonc: "JSON", py: "Python", python: "Python",
  css: "CSS", scss: "SCSS", html: "HTML", xml: "XML", yaml: "YAML", yml: "YAML", toml: "TOML", rust: "Rust", rs: "Rust", go: "Go",
  java: "Java", kotlin: "Kotlin", swift: "Swift", c: "C", cpp: "C++", csharp: "C#", cs: "C#", ruby: "Ruby", rb: "Ruby", php: "PHP",
  diff: "Diff", sql: "SQL", md: "Markdown", markdown: "Markdown", dockerfile: "Dockerfile", graphql: "GraphQL", text: "文本", txt: "文本", plaintext: "文本",
};

/**
 * 这次运行里流式写出来的代码（按语言 + 原文记）。流式结束、回复落盘时整条回复会重新挂载，
 * 新挂载的代码块已经闭合，单看“挂载时是否闭合”会被当成历史回复折叠起来——写完自动收起，违反 C9。
 * 重新挂载时查这里：流式写过的代码不折叠。只保留最近的 STREAMED_LIMIT 段。
 */
const STREAMED_LIMIT = 300;
const streamedCode = new Set<string>();

function rememberStreamed(key: string, previous: string | undefined) {
  if (previous !== undefined && previous !== key) streamedCode.delete(previous);
  streamedCode.delete(key);
  streamedCode.add(key);
  if (streamedCode.size > STREAMED_LIMIT) streamedCode.delete(streamedCode.values().next().value!);
}

function languageLabel(language: string | undefined): string {
  return language ? LANGUAGE_LABEL[language.toLowerCase()] ?? language : "文本";
}

/** 围栏还没闭合时的行数：去掉末尾换行再数。 */
function lineCount(text: string): number {
  return text.replace(/\n$/, "").split("\n").length;
}

type PreProps = ComponentPropsWithoutRef<"pre"> & { node?: PositionedNode };
type PositionedNode = { position?: { start?: { offset?: number }; end?: { offset?: number } } };

function CodeTitle({ title }: { title: string }) {
  const { openPath, workspaceRoot } = useContext(MarkdownHostContext);
  const hit = parseInlinePath(title, { absolute: true });
  const path = hit && resolveWorkspacePath(hit.path, { workspaceRoot });
  if (hit && path && openPath) {
    return (
      <PlainButton className="md-code-title is-path" title={`在 ActSpace 中打开 ${title}`} onClick={() => (hit.line ? openPath(path, hit.line) : openPath(path))}>
        <FileText size={12} aria-hidden="true" />
        <span>{title}</span>
      </PlainButton>
    );
  }
  return <span className="md-code-title"><span>{title}</span></span>;
}

/**
 * 聊天回复里的围栏代码块（规范 §5.2、§6.8）。
 * 稳定性：流式写出来的代码块自然往下长，不封顶、不内部滚动、写完也不自动收起——
 * 折叠只在“挂载时就已闭合”的块（历史回复）上发生，所以是否可折叠只在挂载时决定一次。
 */
export function CodeBlock({ children, node: _node, ...rest }: PreProps) {
  const { fenceOpen } = useContext(BlockStateContext);
  const proseStreaming = useContext(ProseStreamingContext);
  const text = codeText(children);
  const language = fenceLanguage(children);
  const streamKey = `${language ?? ""}\u0000${text.replace(/\n$/, "")}`;
  // 回复还在流式中时挂载的（哪怕一帧就写完了整块）也算流式写出来的。
  const [settledAtMount] = useState(() => !fenceOpen && !proseStreaming && !streamedCode.has(streamKey));
  const [expanded, setExpanded] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const rememberedKey = useRef<string | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  useEffect(() => {
    if (settledAtMount) return;
    rememberStreamed(streamKey, rememberedKey.current);
    rememberedKey.current = streamKey;
  }, [settledAtMount, streamKey]);

  const lines = lineCount(text);
  const title = parseCodeTitle(fenceMeta(children));
  const foldable = settledAtMount && lines > FOLD_OVER_LINES;
  const folded = foldable && !expanded;

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1_200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="markdown-code-shell md-code" data-folded={folded ? "true" : undefined} data-wrap={wrap ? "true" : undefined} data-live={fenceOpen ? "true" : undefined}>
      <div className="markdown-code-toolbar md-code-head">
        <span className="md-code-lang">{languageLabel(language)}</span>
        {title ? <CodeTitle title={title} /> : null}
        <span className="md-code-spacer" />
        {fenceOpen ? (
          <span className="md-code-live" role="status"><i aria-hidden="true" />写入中 · {lines} 行</span>
        ) : (
          <span className="md-code-actions">
            <PlainButton className="md-code-btn" aria-label="自动换行" aria-pressed={wrap} title="自动换行" onClick={() => setWrap((value) => !value)}>
              <TextWrap size={13} aria-hidden="true" /><span>换行</span>
            </PlainButton>
            <PlainButton className="md-code-btn" aria-label="复制代码" title="复制" onClick={() => void copy()}>
              {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              <span>{copied ? "已复制" : "复制"}</span>
            </PlainButton>
          </span>
        )}
      </div>
      <div className="md-code-body">
        <pre {...rest} className="markdown-code-block">{children}</pre>
      </div>
      {foldable ? (
        <PlainButton className="md-code-fold" aria-expanded={!folded} onClick={() => setExpanded((value) => !value)}>
          {folded ? `展开全部 ${lines} 行` : "收起"}
        </PlainButton>
      ) : null}
    </div>
  );
}

function MermaidFence({ children }: { children: ReactNode }) {
  const [themeId] = useState(() => loadAppearance().mermaidTheme);
  return <MermaidDiagramBlock source={codeText(children).replace(/\n$/, "")} themeId={themeId} sourceView={children} />;
}

/** 闭合的 ```mermaid 围栏在这一轮结束后变成图；其余围栏（包括这一轮流式写出来的）保持代码块。 */
export function MarkdownPre({ node, ...props }: PreProps) {
  const { source } = useContext(BlockStateContext);
  const streaming = useContext(ProseStreamingContext);
  if (!streaming && isMermaidLanguage(fenceLanguage(props.children))) {
    const start = node?.position?.start?.offset;
    const end = node?.position?.end?.offset;
    if (start !== undefined && end !== undefined && isFenceClosed(source.slice(start, end))) {
      return <MermaidFence>{props.children}</MermaidFence>;
    }
  }
  return <CodeBlock {...props} />;
}
