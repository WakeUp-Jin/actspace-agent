/**
 * 浏览器 mock「Markdown 全元素」：聊天区 Markdown 渲染规范 §5 的全部元素，内容取自 chat-md-demo 的 sample-chat.txt，
 * 另补了脚注、引用式链接定义和 Mermaid。用于 `?mock=markdown` 截图和逐帧稳定性测量（执行计划 T27）。
 */

export const MARKDOWN_SHOWCASE_REPLY =
  '我看了一下，问题出在 `apps/desktop/src/renderer/components/messages/MarkdownProse.tsx:118`，流式期间每帧都会重新解析最后一块。改动如下：\n\n根因是 `splitMarkdownBlocks()` 在 streaming 时没有复用上一次的切块结果，所以每来一个 token，React 都要重新 reconcile 整条回复。回复越长越明显：一条 30KB 的回答，每次更新要花 34ms，已经超过一帧的预算（16.7ms）[^frame]，滚动和输入都会跟着发涩。细节见 [CodeMirror 的分块思路][cm-split]。\n\n## 改了什么\n\n1. 在 `markdown-blocks.ts` 里缓存上一次的切块结果；\n2. 调整 `rehypeHighlight` 的 `detect` 参数，只在围栏闭合后识别语言；\n3. 新增测试 `apps/desktop/src/renderer/test/markdown-blocks.test.tsx`。\n\n详见 [文档面板规范](docs/design-docs/frontend/front-文档面板规范.md)、[规范第 80 行](docs/design-docs/frontend/front-文档面板规范.md:80) 和 [CodeMirror 官网](https://codemirror.net/)。\n\n### 涉及的文件\n\n- **renderer**\n  - `components/messages/MarkdownProse.tsx` —— 主要改动\n  - `components/messages/markdown-blocks.ts`\n    - 新增 `splitMarkdownBlocks()` 的增量模式\n- **main**：没有改动\n- ~~原来的 `PreviewPane`~~ 已删除\n\n### 验证\n\n- [x] `pnpm --filter @actspace/desktop typecheck`\n- [x] `pnpm --filter @actspace/desktop test`（2106 项通过）\n- [ ] Electron 实机验收\n\n> [!WARNING]\n> 这次改动会影响所有聊天回复的渲染，合并前请在深色主题下也看一遍。\n\n> [!TIP]\n> 可以用 `?mock=streaming` 在浏览器里回放一次流式输出。\n\n> 普通引用：Agent 经常用引用来复述你的原话。\n> 这是引用里的第二行。\n\n下一步建议：\n先合并这个 PR\n再跑一次 Electron 验收\n最后更新执行摘要\n\n| 指标 | 改动前 | 改动后 | 变化 | 说明 |\n| --- | ---: | ---: | ---: | --- |\n| 首屏渲染（1MB 文档） | 1,840 ms | 210 ms | −88.6% | 只渲染可见区域，`IntersectionObserver` 触发后续块 |\n| 每次按键 | 46 ms | 4 ms | −91.3% | 增量解析<br>不再整篇 diff |\n| 内存（JS heap） | 182 MB | 64 MB | −64.8% | DOM 节点从 38 万降到 2,100 |\n\n```ts title="apps/desktop/src/renderer/components/messages/markdown-blocks.ts"\nexport function splitMarkdownBlocks(content: string, previous?: MarkdownBlockSplit): MarkdownBlockSplit {\n  if (previous && previous.content === content) return previous;\n  const blocks: MarkdownBlock[] = [];\n  // 只重新切最后一块：前面的块在流式期间不会变\n  return { content, blocks };\n}\n```\n\n运行：\n\n```bash\npnpm --filter @actspace/desktop test -- markdown-blocks\n```\n\n没有标语言的代码块（常见于报错日志）：\n\n```\nError: Cannot find module \'@codemirror/view\'\n    at Object.<anonymous> (/Users/me/project/index.js:3:15)\n    at Module._compile (node:internal/modules/cjs/loader:1554:14)\n```\n\n一段很长的代码：\n\n```ts title="components/markdown-editor/core/config.ts"\nimport { EditorState, Compartment } from "@codemirror/state";\nimport { EditorView, keymap, lineNumbers } from "@codemirror/view";\nimport { markdown, markdownKeymap } from "@codemirror/lang-markdown";\nimport { history, historyKeymap, defaultKeymap } from "@codemirror/commands";\nimport { search, searchKeymap } from "@codemirror/search";\n\nexport function createEditor(parent: HTMLElement, doc: string) {\n  const mode = new Compartment();\n  const readOnly = new Compartment();\n  const state = EditorState.create({\n    doc,\n    extensions: [\n      history(),\n      search({ top: true }),\n      markdown(),\n      mode.of([]),\n      readOnly.of(EditorState.readOnly.of(false)),\n      keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),\n      EditorView.lineWrapping,\n    ],\n  });\n  const view = new EditorView({ state, parent });\n  return {\n    view,\n    setSource(source: boolean) {\n      view.dispatch({ effects: mode.reconfigure(source ? lineNumbers() : []) });\n    },\n    setReadOnly(value: boolean) {\n      view.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(value)) });\n    },\n    destroy() {\n      view.destroy();\n    },\n  };\n}\n```\n\n数学公式：复杂度是 $O(n \\log n)$，总耗时为\n\n$$\nT = \\sum_{i=1}^{n} t_i\n$$\n\n<details>\n<summary>展开看完整日志</summary>\n\n这里是折叠起来的内容，Agent 常用它收起很长的日志。\n</details>\n\n#### 四级标题\n\n---\n\n参考链接：https://github.com/codemirror/dev/issues/1234 ，按 <kbd>⌘</kbd> + <kbd>S</kbd> 保存。\n\n本地图片：\n\n![架构图](docs/assets/arch.svg)\n\n远程图片：\n\n![徽章](https://img.shields.io/badge/build-passing-green)\n\n流程：\n\n```mermaid\nflowchart LR\n  A[token 到达] --> B[平滑输出]\n  B --> C[只解析最后一块]\n  C --> D[渲染]\n```\n\n[^frame]: 60Hz 屏幕每帧约 16.7ms，减去浏览器自己的工作，留给脚本的不到 10ms。\n\n[cm-split]: https://codemirror.net/docs/guide/\n';

/** 回复里引用的工作区本地图片（`docs/assets/arch.svg`）。 */
export const MARKDOWN_SHOWCASE_IMAGE_PATH = "docs/assets/arch.svg";

const ARCH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="200" viewBox="0 0 480 200">\n  <rect width="480" height="200" rx="12" fill="#e8f1f9"/>\n  <g fill="none" stroke="#3978b8" stroke-width="3" stroke-linejoin="round">\n    <path d="M60 150 L150 70 L210 120 L270 80 L420 150 Z" fill="#cfe1f2"/>\n    <circle cx="370" cy="60" r="18" fill="#f7eedb" stroke="#91600e"/>\n  </g>\n  <text x="240" y="186" text-anchor="middle" font-family="-apple-system, PingFang SC, sans-serif" font-size="13" fill="#3978b8">工作区本地图片 docs/assets/arch.svg</text>\n</svg>\n';

export const MARKDOWN_SHOWCASE_IMAGE_DATA_URL = `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(ARCH_SVG)))}`;

/**
 * 模拟真实网络：一批 12–82 个字符、间隔 60–280ms。用固定种子，保证每次回放切分一致，测量可复现。
 */
export function networkBatches(text: string, seed = 7): { chunks: string[]; delays: number[] } {
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const chunks: string[] = [];
  const delays: number[] = [];
  for (let pos = 0; pos < text.length; ) {
    const size = 12 + Math.floor(random() * 70);
    chunks.push(text.slice(pos, pos + size));
    delays.push(60 + Math.floor(random() * 220));
    pos += size;
  }
  return { chunks, delays };
}
