import { memo, useContext, useId, useMemo, useRef } from "react";
import { ReplyStreamingContext } from "./reply-streaming-context";
import { splitMarkdownBlocks, type MarkdownBlock, type MarkdownBlockSplit } from "./markdown-blocks";
import { FootnoteNumbersContext, IdPrefixContext, ProseStreamingContext } from "./markdown/contexts";
import { collectDefinitions } from "./markdown/definitions";
import { MarkdownHostContext, type MarkdownHost } from "./markdown/host";
import { FootnoteSection, isOpenFence, MarkdownBlockView, PipelineContext } from "./markdown/MarkdownBlocks";
import { mergeHtmlBlocks } from "./markdown/merge-html-blocks";
import { createPipelineCache } from "./markdown/pipeline";
import { useSmoothText } from "./markdown/smooth-text";
import { NO_TAIL, StreamTailContext, type StreamTail } from "./markdown/StreamTail";

const NO_BLOCKS: readonly MarkdownBlock[] = [];
const EMPTY_NUMBERS: ReadonlyMap<string, number> = new Map();

/** 两次解析之间最长间隔（front-流式Markdown解析降频规范.md §3.1）。 */
export const PARSE_INTERVAL_MS = 100;

type ParseState = { text: string; at: number };

/** 一行里只有块标记（`#`、`-`、`>`、`1.` 等）或什么都没有：这一行是什么块还没定。 */
const UNSETTLED_LINE = /^[ \t]*(?:[#>*+\-=]+|\d{1,9}[.)]?)?[ \t]*$/;
/** 以围栏开头的行：没闭合的代码块里，它可能是收尾围栏。 */
const FENCE_LINE = /(?:^|\n)[ \t]*(?:`{3,}|~{3,})/;

/**
 * 正文里，结尾还没定类型的行（空行、只有块标记）连同它前面的换行先不显示，等这一行出现内容（规范 §3.1）。
 * 否则 `-`、`##` 会作为原样尾巴接在上一段末尾，或者每放出一个标记字符就要重新解析一次。
 * 不会退到已解析长度之前。没闭合的代码块里每一行都是代码，不扣。
 */
function settledText(text: string, floor: number): string {
  let end = text.length;
  while (end > floor) {
    const lineStart = text.lastIndexOf("\n", end - 1) + 1;
    if (lineStart === 0 || lineStart <= floor || !UNSETTLED_LINE.test(text.slice(lineStart, end))) break;
    end = lineStart - 1;
  }
  return end === text.length ? text : text.slice(0, end);
}

/**
 * 这一帧要不要把已解析长度推进到当前要显示的全部文字（规范 §3.1）。满足任一条就推进：
 * 1. 距上次推进已过 100ms；
 * 2. 新的一行：新放出的字里有换行（新的一行已经有内容，见 settledText），或者已解析部分停在一个还没定类型的行上；
 *    没闭合的代码块里新的一行还是代码，不算，只有出现围栏行（可能是收尾围栏）才算；
 * 3. 平滑输出追平了网络（网络停顿时不让原样尾巴一直挂着），或者回复写完（调用方直接推进到全文）；
 * 4. 内容不是追加（变短或被改写）；
 * 另外，还没有任何已解析内容时（尾巴没有地方接）也立即推进。
 */
function shouldAdvance(parsed: ParseState, visible: string, now: number, caughtUp: boolean, fenceOpen: boolean): boolean {
  if (visible === parsed.text) return false;
  if (caughtUp || !visible.startsWith(parsed.text) || !parsed.text.trim()) return true;
  const lineStart = parsed.text.lastIndexOf("\n") + 1;
  if (fenceOpen) {
    if (FENCE_LINE.test(visible.slice(lineStart))) return true;
  } else if (visible.includes("\n", parsed.text.length) || UNSETTLED_LINE.test(parsed.text.slice(lineStart))) {
    return true;
  }
  return now - parsed.at >= PARSE_INTERVAL_MS;
}

/**
 * 聊天回复的 Markdown 渲染（规范：front-聊天区Markdown渲染规范.md）。
 * 平滑输出 → 降频解析（已解析部分 + 原样尾巴）→ 顶层分块（冻结块复用）→ 合并跨块的 `<details>` → 收集全局定义 →
 * 每块用常驻的处理器单独解析渲染，脚注区整条回复只在最后渲染一次。
 * 流式时尾部最多每 100ms 解析一次（front-流式Markdown解析降频规范.md），两次之间只有尾巴组件逐帧更新。
 * 宿主能力走 `MarkdownHostContext`；`onOpenWorkspaceFile` 提供 `openPath`，没有就不可点。
 * `writing`：这条回复是否正在写（平滑输出、末尾渐显、光标）；不传时跟随所在轮是否在流式。
 */
export const MarkdownProse = memo(function MarkdownProse({ content, writing, onOpenWorkspaceFile }: { content: string; writing?: boolean; onOpenWorkspaceFile?: (path: string, line?: number) => void }) {
  const id = useId();
  const prefix = useMemo(() => `user-content-${id.replace(/:/g, "")}-`, [id]);
  const pipelines = useMemo(() => createPipelineCache(prefix), [prefix]);
  const outerHost = useContext(MarkdownHostContext);
  const host = useMemo<MarkdownHost>(() => (onOpenWorkspaceFile ? { ...outerHost, openPath: onOpenWorkspaceFile } : outerHost), [outerHost, onOpenWorkspaceFile]);

  // 版面稳定（mermaid 保持代码块、表格固定列宽）按整轮算：所在轮仍在流式，或平滑输出还有积压没放完。
  // 末尾渐显和光标只给正在写的回复：一轮里已经写完、后面接着工具的回复不带（规范 §7.1）。
  const turnStreaming = useContext(ReplyStreamingContext);
  const replyWriting = turnStreaming && (writing ?? true);
  const smooth = useSmoothText(content, replyWriting);
  const streaming = turnStreaming || smooth.backlog;
  const tail = replyWriting || smooth.backlog;

  const split = useRef<MarkdownBlockSplit | undefined>(undefined);
  const merged = useRef<readonly MarkdownBlock[]>(NO_BLOCKS);
  const parsed = useRef<ParseState>({ text: "", at: -Infinity });
  const previousLast = merged.current[merged.current.length - 1];
  const fenceOpen = previousLast !== undefined && isOpenFence(previousLast.source);
  // 写完（没有末尾效果了）：直接推进到全文，最后完整解析一次（规范 §3.5）。
  const visible = !tail ? smooth.text : fenceOpen || !smooth.text.startsWith(parsed.current.text) ? smooth.text : settledText(smooth.text, parsed.current.text.length);
  const now = performance.now();
  if (!tail ? visible !== parsed.current.text : shouldAdvance(parsed.current, visible, now, !smooth.backlog, fenceOpen)) {
    parsed.current = { text: visible, at: now };
  }
  const parsedText = parsed.current.text;
  split.current = splitMarkdownBlocks(parsedText, split.current);
  merged.current = mergeHtmlBlocks(split.current.blocks, merged.current);
  const blocks = merged.current;
  const definitions = collectDefinitions(blocks);

  // 脚注编号表：只有编号变了才换新对象，否则脚注引用以外的东西不会被通知。
  // 编号就是标识在表里的顺序（collectDefinitions），所以能从 key 原样重建，不必依赖 definitions 的对象身份。
  const numbersKey = Array.from(definitions.footnoteNumbers.keys()).join("\u0000");
  const footnoteNumbers = useMemo<ReadonlyMap<string, number>>(
    () => (numbersKey ? new Map(numbersKey.split("\u0000").map((id, index) => [id, index + 1])) : EMPTY_NUMBERS),
    [numbersKey],
  );

  // 末尾效果落在最后一个会显示的块上；最后一块是脚注定义时落在脚注区上。
  let liveIndex = -1;
  if (tail) {
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i].definition?.kind === "link") continue;
      liveIndex = i;
      break;
    }
  }
  const footnotesLive = liveIndex >= 0 && blocks[liveIndex].definition?.kind === "footnote";

  // 原样尾巴：只接在最后一块上。最后一块是不显示的链接定义时，尾巴也不显示（光标仍在上一块末尾）。
  const tailText = liveIndex === blocks.length - 1 ? visible.slice(parsedText.length) : "";
  const tailLead = tailText ? /[ \t]*$/.exec(parsedText)![0] : "";
  const streamTail = useMemo<StreamTail>(() => (tailText ? { text: tailText, lead: tailLead } : NO_TAIL), [tailText, tailLead]);

  return (
    <div className="markdown-prose act-code-hl" data-streaming={streaming ? "true" : undefined}>
      <MarkdownHostContext.Provider value={host}>
        <IdPrefixContext.Provider value={prefix}>
          <ProseStreamingContext.Provider value={streaming}>
            <FootnoteNumbersContext.Provider value={footnoteNumbers}>
              <PipelineContext.Provider value={pipelines}>
                <StreamTailContext.Provider value={streamTail}>
                  {blocks.map((block, index) => (block.definition ? null : <MarkdownBlockView key={block.start} block={block} defs={definitions.blockDefs[index] ?? ""} live={index === liveIndex} />))}
                  {definitions.footnotes ? <FootnoteSection source={definitions.footnotes.source} live={footnotesLive} /> : null}
                </StreamTailContext.Provider>
              </PipelineContext.Provider>
            </FootnoteNumbersContext.Provider>
          </ProseStreamingContext.Provider>
        </IdPrefixContext.Provider>
      </MarkdownHostContext.Provider>
    </div>
  );
});
