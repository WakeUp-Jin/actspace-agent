import { memo, useContext, useId, useMemo, useRef } from "react";
import { ReplyStreamingContext } from "./reply-streaming-context";
import { splitMarkdownBlocks, type MarkdownBlock, type MarkdownBlockSplit } from "./markdown-blocks";
import { FootnoteNumbersContext, IdPrefixContext, ProseStreamingContext } from "./markdown/contexts";
import { collectDefinitions } from "./markdown/definitions";
import { MarkdownHostContext, type MarkdownHost } from "./markdown/host";
import { FootnoteSection, MarkdownBlockView, PipelineContext } from "./markdown/MarkdownBlocks";
import { mergeHtmlBlocks } from "./markdown/merge-html-blocks";
import { createPipelineCache } from "./markdown/pipeline";
import { useSmoothText } from "./markdown/smooth-text";

const NO_BLOCKS: readonly MarkdownBlock[] = [];
const EMPTY_NUMBERS: ReadonlyMap<string, number> = new Map();

/**
 * 聊天回复的 Markdown 渲染（规范：front-聊天区Markdown渲染规范.md）。
 * 平滑输出 → 顶层分块（冻结块复用）→ 合并跨块的 `<details>` → 收集全局定义 → 每块一个 react-markdown，
 * 脚注区整条回复只在最后渲染一次。流式时只有最后一块重新渲染。
 * 宿主能力走 `MarkdownHostContext`；`onOpenWorkspaceFile` 提供 `openPath`，没有就不可点。
 */
export const MarkdownProse = memo(function MarkdownProse({ content, onOpenWorkspaceFile }: { content: string; onOpenWorkspaceFile?: (path: string, line?: number) => void }) {
  const id = useId();
  const prefix = useMemo(() => `user-content-${id.replace(/:/g, "")}-`, [id]);
  const pipelines = useMemo(() => createPipelineCache(prefix), [prefix]);
  const outerHost = useContext(MarkdownHostContext);
  const host = useMemo<MarkdownHost>(() => (onOpenWorkspaceFile ? { ...outerHost, openPath: onOpenWorkspaceFile } : outerHost), [outerHost, onOpenWorkspaceFile]);

  // 所在轮仍在流式，或平滑输出还有积压没放完，都算流式；放完之后才退出。
  const turnStreaming = useContext(ReplyStreamingContext);
  const smooth = useSmoothText(content, turnStreaming);
  const streaming = turnStreaming || smooth.backlog;

  const split = useRef<MarkdownBlockSplit | undefined>(undefined);
  const merged = useRef<readonly MarkdownBlock[]>(NO_BLOCKS);
  split.current = splitMarkdownBlocks(smooth.text, split.current);
  merged.current = mergeHtmlBlocks(split.current.blocks, merged.current);
  const blocks = merged.current;
  const definitions = collectDefinitions(blocks);

  // 脚注编号表：只有编号变了才换新对象，否则脚注引用以外的东西不会被通知。
  const numbersKey = Array.from(definitions.footnoteNumbers.keys()).join("\u0000");
  const footnoteNumbers = useMemo(() => (numbersKey ? definitions.footnoteNumbers : EMPTY_NUMBERS), [numbersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 末尾效果落在最后一个会显示的块上；最后一块是脚注定义时落在脚注区上。
  let liveIndex = -1;
  if (streaming) {
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i].definition?.kind === "link") continue;
      liveIndex = i;
      break;
    }
  }
  const footnotesLive = liveIndex >= 0 && blocks[liveIndex].definition?.kind === "footnote";

  return (
    <div className="markdown-prose act-code-hl" data-streaming={streaming ? "true" : undefined}>
      <MarkdownHostContext.Provider value={host}>
        <IdPrefixContext.Provider value={prefix}>
          <ProseStreamingContext.Provider value={streaming}>
            <FootnoteNumbersContext.Provider value={footnoteNumbers}>
              <PipelineContext.Provider value={pipelines}>
                {blocks.map((block, index) => (block.definition ? null : <MarkdownBlockView key={block.start} block={block} defs={definitions.blockDefs[index] ?? ""} live={index === liveIndex} />))}
                {definitions.footnotes ? <FootnoteSection source={definitions.footnotes.source} live={footnotesLive} /> : null}
              </PipelineContext.Provider>
            </FootnoteNumbersContext.Provider>
          </ProseStreamingContext.Provider>
        </IdPrefixContext.Provider>
      </MarkdownHostContext.Provider>
    </div>
  );
});
