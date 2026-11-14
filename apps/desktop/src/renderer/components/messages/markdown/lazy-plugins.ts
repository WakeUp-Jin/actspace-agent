import { useEffect, useSyncExternalStore } from "react";

/**
 * 按需加载数学和原始 HTML 两个 chunk（规范 §9.2）：
 * - 数学：某个块的源码里第一次出现 `$`；
 * - 原始 HTML：某个块的源码里第一次出现像 HTML 标签的文本。
 * 加载完成前，这一块按现状显示（公式和 HTML 都是原文）；加载完成后，只有需要它们的块会重渲染——
 * 不需要的块订阅到的快照始终是 null，不会被通知。
 */

type MathChunk = typeof import("./math-chunk");
type HtmlChunk = typeof import("./html-chunk");

/** 某个块当前可用的插件：需要但还没加载完的是 null。 */
export type MarkdownBlockPlugins = { math: MathChunk | null; html: HtmlChunk | null };

export const HTML_TAG_PATTERN = /<\/?[a-z][\w-]*[\s>/]/i;

export function needsMath(source: string): boolean {
  return source.includes("$");
}

export function needsHtml(source: string): boolean {
  return HTML_TAG_PATTERN.test(source);
}

/** 一个懒加载 chunk 的全局状态：只加载一次，失败后不重试（避免每帧重复请求），块继续按原文显示。 */
function createChunk<T>(load: () => Promise<T>) {
  let module: T | null = null;
  let started = false;
  const listeners = new Set<() => void>();
  return {
    get: () => module,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ensure() {
      if (started) return;
      started = true;
      load().then(
        (loaded) => {
          module = loaded;
          listeners.forEach((listener) => {
            listener();
          });
        },
        (error: unknown) => {
          console.warn("Markdown 插件加载失败，按原文显示", error);
        },
      );
    },
    /** 只给测试：回到未加载状态。 */
    reset() {
      module = null;
      started = false;
    },
  };
}

const mathChunk = createChunk<MathChunk>(async () => {
  const mod = await import("./math-chunk");
  await mod.prepareMath();
  return mod;
});
const htmlChunk = createChunk<HtmlChunk>(() => import("./html-chunk"));

export function resetLazyPluginsForTests() {
  mathChunk.reset();
  htmlChunk.reset();
}

/** 块需要哪些 chunk，就返回哪些（已加载的返回模块，没加载完的返回 null）。 */
export function useLazyChunks(source: string): MarkdownBlockPlugins {
  const wantsMath = needsMath(source);
  const wantsHtml = needsHtml(source);
  const math = useSyncExternalStore(mathChunk.subscribe, () => (wantsMath ? mathChunk.get() : null));
  const html = useSyncExternalStore(htmlChunk.subscribe, () => (wantsHtml ? htmlChunk.get() : null));
  useEffect(() => {
    if (wantsMath) mathChunk.ensure();
    if (wantsHtml) htmlChunk.ensure();
  }, [wantsMath, wantsHtml]);
  return { math, html };
}
