import { toJsxRuntime, type Components as JsxComponents } from "hast-util-to-jsx-runtime";
import { urlAttributes } from "html-url-attributes";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { ReactElement } from "react";
import { defaultUrlTransform, type Components } from "react-markdown";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type PluggableList, type Processor } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";
import type { HastNode } from "./hast-types";
import type { BlockPipeline } from "./pipeline";

/**
 * 常驻的 Markdown 处理器（front-流式Markdown解析降频规范.md §3.3）。
 *
 * react-markdown 的 `<Markdown>` 每次渲染都执行 `unified().use(...)`：重新组装并冻结处理器，
 * gfm 等扩展每次重新合并（run7 约 70 MB）。这里按管线对象缓存一个已 `freeze()` 的处理器，
 * 渲染只做 parse → runSync → post。post 对照 react-markdown 10.1.0 `lib/index.js`，
 * 只保留我们用到的选项：components、remarkRehypeOptions、默认 urlTransform；
 * raw 节点按 react-markdown 默认（不 skipHtml）转成文本。
 */
// unified 的 Processor 泛型描述的是管线各阶段的树类型，这里只缓存已冻结的实例，不关心具体阶段。
// biome-ignore lint/suspicious/noExplicitAny: 任意管线形状都要能存进同一个 WeakMap
type FrozenProcessor = Processor<any, any, any, any, any>;

const processors = new WeakMap<BlockPipeline, FrozenProcessor>();
let created = 0;

/** 测试用：一共建过几个处理器。 */
export function processorCreations(): number { return created; }

function processorFor(pipeline: BlockPipeline): FrozenProcessor {
  let processor = processors.get(pipeline);
  if (!processor) {
    // react-markdown 同样强制 allowDangerousHtml: true（raw 节点之后要么交给 rehype-raw，要么在 post 里转成文本）。
    const remarkRehypeOptions = { ...pipeline.remarkRehypeOptions, allowDangerousHtml: true };
    processor = unified()
      .use(remarkParse)
      .use(pipeline.remarkPlugins as PluggableList)
      .use(remarkRehype, remarkRehypeOptions)
      .use(pipeline.rehypePlugins as PluggableList)
      .freeze() as FrozenProcessor;
    processors.set(pipeline, processor);
    created += 1;
  }
  return processor;
}

/** 与 `<Markdown remarkPlugins rehypePlugins remarkRehypeOptions components>{source}</Markdown>` 的输出相同。 */
export function renderMarkdown(source: string, pipeline: BlockPipeline, components: Components): ReactElement {
  const processor = processorFor(pipeline);
  const file = new VFile();
  file.value = source;
  const tree = processor.runSync(processor.parse(file), file);
  visit(tree, transform as never);
  // react-markdown 的 Components 与 hast-util-to-jsx-runtime 的同形，只是写法不同（它内部也这样直接传过去）。
  return toJsxRuntime(tree, { Fragment, components: components as Partial<JsxComponents>, ignoreInvalidStyle: true, jsx, jsxs, passKeys: true, passNode: true }) as ReactElement;
}

function transform(node: HastNode, index: number | undefined, parent: HastNode | undefined): number | undefined {
  if (node.type === "raw" && parent?.children && typeof index === "number") {
    parent.children[index] = { type: "text", value: node.value };
    return index;
  }
  if (node.type === "element" && node.properties) {
    const properties = node.properties;
    for (const key in urlAttributes) {
      if (Object.hasOwn(urlAttributes, key) && Object.hasOwn(properties, key)) {
        const test = urlAttributes[key];
        if (test === null || test.includes(node.tagName!)) properties[key] = defaultUrlTransform(String(properties[key] || ""));
      }
    }
  }
  return undefined;
}
