/**
 * 聊天区 Markdown「改进版」原型：以仓库里的 MarkdownProse 为底，只加插件和组件覆盖，
 * 分块、高亮语言表直接复用仓库源码。各版本共用这一套结构，差别在 variants.css 和 VariantSpec。
 */
import { FileText } from "lucide-react";
import { createContext, memo, useContext, useId, useMemo, useRef, type ComponentPropsWithoutRef } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { visit } from "unist-util-visit";
import "katex/dist/katex.min.css";
import { LANGUAGE_MODULES } from "@repo/components/right-panel/highlight";
import { splitMarkdownBlocks, type MarkdownBlock, type MarkdownBlockSplit } from "@repo/components/messages/markdown-blocks";
import { CodeBlock } from "./code-block";
import { HostContext, StreamContext, VariantContext, isFenceOpen, parsePath, type Host, type VariantSpec } from "./shared";
import { rehypeStreamTail } from "./stream";

export type ImprovedOptions = { breaks: boolean; variant: VariantSpec; streaming: boolean };
const PrefixContext = createContext("user-content-");

/* ---------- remark：GitHub 提示框 ---------- */
const CALLOUT_LABEL: Record<string, string> = { note: "说明", tip: "提示", important: "重要", warning: "注意", caution: "警告" };
function remarkCallouts() {
  return (tree: any) => {
    visit(tree, "blockquote", (node: any) => {
      const para = node.children?.[0];
      const first = para?.type === "paragraph" ? para.children?.[0] : null;
      if (!first || first.type !== "text") return;
      const m = first.value.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/i);
      if (!m) return;
      const type = m[1].toLowerCase();
      first.value = first.value.slice(m[0].length);
      if (!first.value) para.children.shift();
      if (para.children[0]?.type === "break") para.children.shift();
      if (para.children.length === 0) node.children.shift();
      node.data = { ...node.data, hProperties: { className: ["md-callout", `md-callout-${type}`], dataCalloutLabel: CALLOUT_LABEL[type] } };
    });
  };
}

/* ---------- remark：代码块的 meta（title="…"）带到 code 元素上 ---------- */
function remarkCodeMeta() {
  return (tree: any) => {
    visit(tree, "code", (node: any) => {
      if (node.meta) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, dataMeta: node.meta } };
    });
  };
}

/* ---------- rehype：行内代码里的路径 ---------- */
function rehypeInlinePaths() {
  return (tree: any) => {
    visit(tree, "element", (node: any, _i: any, parent: any) => {
      if (node.tagName !== "code" || parent?.tagName === "pre") return;
      const text = node.children?.map((c: any) => c.value ?? "").join("") ?? "";
      const hit = parsePath(text);
      if (hit) node.properties = { ...node.properties, dataPath: hit.path, dataLine: hit.line ?? "" };
    });
  };
}

/* ---------- 原始 HTML：白名单（GitHub 同款 schema），只多放行本组件自己加的类名 ---------- */
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  clobber: [],
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-./, "math-inline", "math-display"], "dataPath", "dataLine", "dataMeta"],
    blockquote: [["className", "md-callout", /^md-callout-/], "dataCalloutLabel"],
  },
};

function InlineCode({ node: _node, children, ...props }: ComponentPropsWithoutRef<"code"> & { node?: unknown; "data-path"?: string; "data-line"?: string }) {
  const host = useContext(HostContext);
  const path = props["data-path"];
  if (!path) return <code {...props}>{children}</code>;
  const line = props["data-line"] ? Number(props["data-line"]) : undefined;
  return (
    <code className="md-path" title={`在 ActSpace 中打开${line ? `（第 ${line} 行）` : ""}`} onClick={() => host.openPath(path, line)}>
      <FileText className="md-path-icon" size={12} strokeWidth={2} aria-hidden="true" />{children}
    </code>
  );
}

function Link({ href = "", children, node: _node, ...rest }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
  const host = useContext(HostContext);
  const local = href && !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href) ? parsePathOrPlain(href) : null;
  if (local) {
    return (
      <a {...rest} href={href} className="md-link-file" onClick={(e) => { e.preventDefault(); host.openPath(local.path, local.line); }}>
        <FileText className="md-path-icon" size={12} strokeWidth={2} aria-hidden="true" />{children}
      </a>
    );
  }
  if (href.startsWith("#")) return <a {...rest} href={href}>{children}</a>;
  return <a {...rest} href={href} onClick={(e) => { e.preventDefault(); host.openUrl(href); }}>{children}</a>;
}
function parsePathOrPlain(href: string) {
  let decoded = href;
  try { decoded = decodeURI(href); } catch { /* 保持原样 */ }
  return parsePath(decoded) ?? (decoded.split("/").includes("..") ? null : { path: decoded, line: undefined });
}

function Image({ src = "", alt = "" }: ComponentPropsWithoutRef<"img"> & { node?: unknown }) {
  const host = useContext(HostContext);
  if (/^https?:/i.test(src)) return <span className="md-img-remote" title="远程图片不加载">图片：{alt || src}（远程地址，不加载）</span>;
  const url = host.image(src);
  if (!url) return <span className="md-img-remote">图片：{alt || src}（找不到文件）</span>;
  return <span className="md-img"><img src={url} alt={alt} /></span>;
}

function Table({ node: _node, ...props }: ComponentPropsWithoutRef<"table"> & { node?: unknown }) {
  return <div className="markdown-table-wrap"><table {...props} /></div>;
}

const COMPONENTS: Components = { a: Link as any, pre: CodeBlock as any, code: InlineCode as any, img: Image as any, table: Table as any };

/** `<details>` 这类成对的 HTML 会被空行切到不同块里：遇到没闭合的就把后面的块并进来。 */
function mergeHtmlBlocks(blocks: readonly MarkdownBlock[]): readonly MarkdownBlock[] {
  const out: MarkdownBlock[] = [];
  let open: MarkdownBlock | null = null;
  for (const block of blocks) {
    if (open) {
      open = { start: open.start, source: open.source + block.source, frozen: block.frozen };
      if (/<\/details>/i.test(open.source)) { out.push(open); open = null; }
      continue;
    }
    if (/<details[\s>]/i.test(block.source) && !/<\/details>/i.test(block.source)) { open = block; continue; }
    out.push(block);
  }
  if (open) out.push(open);
  return out;
}

const BASE_REHYPE = [
  rehypeRaw,
  [rehypeSanitize, SANITIZE_SCHEMA],
  rehypeInlinePaths,
  [rehypeKatex, { throwOnError: false, trust: false, strict: "ignore" }],
  // 未标语言的代码块不再自动识别：识别经常猜错（日志被认成 dart），按纯文本显示。
  [rehypeHighlight, { detect: false, ignoreMissing: true, languages: LANGUAGE_MODULES, plainText: ["text", "txt"] }],
];

const BlockView = memo(function BlockView({ source, breaks, live, variant }: { source: string; breaks: boolean; live: boolean; variant: VariantSpec }) {
  const clobberPrefix = useContext(PrefixContext);
  const remark = useMemo(() => [remarkGfm, remarkMath, remarkCallouts, remarkCodeMeta, ...(breaks ? [remarkBreaks] : [])], [breaks]);
  const rehype = useMemo(() => (live ? [...BASE_REHYPE, [rehypeStreamTail, { fade: variant.fade, caret: variant.caret }]] : BASE_REHYPE) as any, [live, variant]);
  const stream = useMemo(() => ({ live, fenceOpen: live && isFenceOpen(source) }), [live, source]);
  return (
    <StreamContext.Provider value={stream}>
      <Markdown remarkPlugins={remark} rehypePlugins={rehype} remarkRehypeOptions={{ allowDangerousHtml: true, clobberPrefix }} components={COMPONENTS}>{source}</Markdown>
    </StreamContext.Provider>
  );
});

export const ImprovedProse = memo(function ImprovedProse({ content, host, options }: { content: string; host: Host; options: ImprovedOptions }) {
  const id = useId();
  const split = useRef<MarkdownBlockSplit | undefined>(undefined);
  split.current = splitMarkdownBlocks(content, split.current);
  const blocks = mergeHtmlBlocks(split.current.blocks);
  const { variant, streaming } = options;
  return (
    <div className={`markdown-prose md-improved act-code-hl mdv-book mdv-${variant.id}`} data-streaming={streaming ? "true" : undefined}>
      <HostContext.Provider value={host}>
        <VariantContext.Provider value={variant}>
          <PrefixContext.Provider value={`user-content-${id.replace(/:/g, "")}-`}>
            {blocks.map((b, i) => <BlockView key={b.start} source={b.source} breaks={options.breaks} live={streaming && i === blocks.length - 1} variant={variant} />)}
          </PrefixContext.Provider>
        </VariantContext.Provider>
      </HostContext.Provider>
    </div>
  );
});
