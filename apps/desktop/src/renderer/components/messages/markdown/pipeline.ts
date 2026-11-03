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
const HIGHLIGHT_PLUGIN = [rehypeHighlight, { detect: false, ignoreMissing: true, languages: LANGUAGE_MODULES, plainText: ["text", "txt", "plain", "plaintext"] }];

export type BlockPipeline = {
  remarkPlugins: PluginList;
  rehypePlugins: PluginList;
  remarkRehypeOptions: Options["remarkRehypeOptions"];
};

/**
 * 管线（规范 §4）：
 *   remark：gfm → math* → callouts → codeMeta → breaks
 *   rehype：raw* → sanitize* → inlinePaths → katex* → highlight → streamTail（只在流式的最后一块）
 * 带 `*` 的来自按需加载的 chunk。每种组合的插件数组只建一次，之后都是同一个引用，
 * 否则平滑输出的每一帧 react-markdown 都会认为插件变了，所有块跟着重新解析。
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
            HIGHLIGHT_PLUGIN,
            ...(tail ? [rehypeStreamTail] : []),
          ] as PluginList,
          remarkRehypeOptions,
        };
        cache.set(key, pipeline);
      }
      return pipeline;
    },
  };
}
