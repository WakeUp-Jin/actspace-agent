import { createContext, memo, useContext, useMemo } from "react";
import Markdown from "react-markdown";
import { isFenceClosed } from "../mermaid-renderer";
import type { MarkdownBlock } from "../markdown-blocks";
import { BLOCK_COMPONENTS, FOOTNOTE_COMPONENTS } from "./components-map";
import { BlockStateContext } from "./contexts";
import { useLazyChunks } from "./lazy-plugins";
import type { createPipelineCache } from "./pipeline";

/** 每条回复一个管线缓存（插件数组按组合只建一次，见 pipeline.ts），由 MarkdownProse 提供。 */
export const PipelineContext = createContext<ReturnType<typeof createPipelineCache> | null>(null);

function usePipeline() {
  const pipelines = useContext(PipelineContext);
  if (!pipelines) throw new Error("MarkdownBlockView 必须放在 MarkdownProse 里");
  return pipelines;
}

function isOpenFence(source: string): boolean {
  const block = source.trimStart();
  return /^(`{3,}|~{3,})/.test(block) && !isFenceClosed(block);
}

/**
 * 一个顶层块单独解析渲染。props 都是块对象、字符串、布尔值：没变化时整块跳过。
 * defs 是引用到的定义（追加到源码末尾，不显示）；live 只有流式中最后一块为真，带末尾渐显和光标。
 */
type BlockViewProps = { block: MarkdownBlock; defs: string; live: boolean };

/** 末尾两块没冻结，每次分块都是新对象；渲染只取决于起点和源码，所以按内容比较，源码没变就跳过。 */
function sameBlockView(a: BlockViewProps, b: BlockViewProps): boolean {
  return a.live === b.live && a.defs === b.defs && a.block.start === b.block.start && a.block.source === b.block.source;
}

export const MarkdownBlockView = memo(function MarkdownBlockView({ block, defs, live }: BlockViewProps) {
  const pipeline = usePipeline().get(useLazyChunks(block.source), live, "block");
  const fenceOpen = live && isOpenFence(block.source);
  const state = useMemo(() => ({ source: block.source, fenceOpen }), [block.source, fenceOpen]);
  return (
    <BlockStateContext.Provider value={state}>
      <Markdown remarkPlugins={pipeline.remarkPlugins} rehypePlugins={pipeline.rehypePlugins} remarkRehypeOptions={pipeline.remarkRehypeOptions} components={BLOCK_COMPONENTS}>
        {defs ? `${block.source}\n\n${defs}` : block.source}
      </Markdown>
    </BlockStateContext.Provider>
  );
}, sameBlockView);

/** 整条回复只有一个脚注区，放在最后；编号按全文首次引用的顺序（definitions.ts 排好了 source）。 */
export const FootnoteSection = memo(function FootnoteSection({ source, live }: { source: string; live: boolean }) {
  const pipeline = usePipeline().get(useLazyChunks(source), live, "footnotes");
  const state = useMemo(() => ({ source, fenceOpen: false }), [source]);
  return (
    <BlockStateContext.Provider value={state}>
      <Markdown remarkPlugins={pipeline.remarkPlugins} rehypePlugins={pipeline.rehypePlugins} remarkRehypeOptions={pipeline.remarkRehypeOptions} components={FOOTNOTE_COMPONENTS}>
        {source}
      </Markdown>
    </BlockStateContext.Provider>
  );
});
