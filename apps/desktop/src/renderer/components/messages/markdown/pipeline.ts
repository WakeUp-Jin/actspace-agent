import type { Options } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { LANGUAGE_MODULES } from "../../right-panel/highlight";
import type { MarkdownBlockPlugins } from "./lazy-plugins";
import { rehypeKeepFootnoteSection } from "./rehype-footnote-section";
import { rehypeInlinePaths } from "./rehype-inline-paths";
import { rehypeStreamTail } from "./rehype-stream-tail";
import { remarkCallouts } from "./remark-callouts";
import { remarkCodeMeta } from "./remark-code-meta";

type PluginList = NonNullable<Options["remarkPlugins"]>;

/**
 * 只按标注的语言高亮，不再自动识别（规范 §5.2）：识别经常猜错（报错日志被认成 dart），
 * 没标语言的按纯文本显示。`text` / `txt` 明确不高亮。
 */
const highlightTransform = rehypeHighlight({ detect: false, languages: LANGUAGE_MODULES, plainText: ["text", "txt", "plain", "plaintext"] });
/**
 * react-markdown 每次渲染都重建处理器、重新初始化全部插件；rehype-highlight 每次初始化都会新建 lowlight
 * 并把全部语言注册一遍（run6 合计 1.8 GB 分配）。所以只初始化一次，插件直接交出这个转换函数，所有回复共用。
 */
function rehypeSharedHighlight() { return highlightTransform; }

export type BlockPipeline = {
  remarkPlugins: PluginList;
  rehypePlugins: PluginList;
  remarkRehypeOptions: Options["remarkRehypeOptions"];
};

/**
 * 管线（规范 §4）：
 *   remark：gfm → math* → callouts → codeMeta → breaks
 *   rehype：raw* → sanitize* → inlinePaths → katex* → highlight → streamTail（只在流式的最后一块，放尾巴和渐显的占位，见 StreamTail.tsx）
 * 带 `*` 的来自按需加载的 chunk。每种组合的管线对象只建一次，之后都是同一个引用：
 * processor.ts 按这个对象缓存已冻结的 unified 处理器，换了引用就会重建。
 */
export function createPipelineCache(prefix: string) {
  const cache = new Map<string, BlockPipeline>();
  const remarkRehypeOptions = {
    clobberPrefix: prefix,
    footnoteLabel: "脚注",
    footnoteBackLabel: (index: number) => `回到引用 ${index + 1}`,
  };
  return {
    get(plugins: MarkdownBlockPlugins, tail: boolean, kind: "block" | "footnotes"): BlockPipeline {
      const key = `${kind[0]}${plugins.math ? "m" : "-"}${plugins.html ? "h" : "-"}${tail ? "t" : "-"}`;
      let pipeline = cache.get(key);
      if (!pipeline) {
        const { math, html } = plugins;
        pipeline = {
          remarkPlugins: [remarkGfm, ...(math?.MATH_REMARK_PLUGINS ?? []), remarkCallouts, remarkCodeMeta, remarkBreaks] as PluginList,
          rehypePlugins: [
            ...(kind === "footnotes" ? [rehypeKeepFootnoteSection] : []),
            ...(html?.htmlRehypePlugins(prefix) ?? []),
            rehypeInlinePaths,
            ...(math?.MATH_REHYPE_PLUGINS ?? []),
            rehypeSharedHighlight,
            ...(tail ? [[rehypeStreamTail, { skipFootnoteSection: kind === "block" }]] : []),
          ] as PluginList,
          remarkRehypeOptions,
        };
        cache.set(key, pipeline);
      }
      return pipeline;
    },
  };
}
