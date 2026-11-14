/**
 * Markdown 编辑器核心的公开入口（纯 TS，不 import React）。`MarkdownEditor.tsx`（T9）只从这里取东西。
 *
 * 用法（外壳）：
 *
 *   const host: MarkdownEditorHost = { docPath, workspaceRoot, openPath, openUrl, loadImage, renderMermaid, previewMermaid };
 *   const view = createEditorView(container, {
 *     doc: draft, mode, readOnly: truncated, host,
 *     onChange: (doc) => setDraft(doc),   // 用户输入，每帧最多一次，内容是全文
 *     onSave: () => save(),               // ⌘S；只读时不响应；调用前已经补发过 onChange
 *   });
 *
 *   setMode(view, "source");              // 预览 / 源码，同一个 view，文档、历史、选区、滚动都保留；不抢焦点，之后自己 view.focus()
 *   setReadOnly(view, true);              // 只读：拒绝所有改文档的 transaction，仍可选择、复制、查找
 *   setHost(view, nextHost);              // 换文档 / 宿主：装饰重算，换了 docPath 会清图片缓存
 *   setCallbacks(view, { onChange, onSave }); // React 重新渲染换了闭包时调用，不用重建 view
 *   clearImageCache();                    // 建 view 之前清一次：图片缓存不跨文档沿用
 *   refreshImages(view);                  // 重新加载：清图片缓存并重新读取图片（内容没变也会刷新）
 *   replaceDocument(view, text);          // 外部替换（换文档、重新加载、恢复草稿、首次读取）：整份写入、清空撤销历史、不触发 onChange
 *   getOutline(view.state);               // 取 h2/h3，两种模式都能用；`sameOutline` 比较前后是否变了
 *   scrollToLine(view, line);             // 带行号的路径打开后：滚到该行并选中整行
 *   scrollToPos(view, heading.from, { smooth: true }); // 大纲点击：标题留 12px 顶距
 *   flushPendingChange(view);             // 卸载前要同步最新内容时调用（view.destroy() 也会自动补发）
 *   view.destroy();
 *
 * 测试里断言装饰时，直接从各模块 import：`inline.ts` 的 `buildInlineDecorations` / `currentInlineDecorations`，`blocks.ts` 的 `blockDecorations`。
 */
export type { MarkdownEditorHost, MermaidRenderResult } from "../host";
export {
  createEditorState,
  createEditorView,
  createExtensions,
  getDocument,
  refreshImages,
  replaceDocument,
  setCallbacks,
  setHost,
  setLineNumbers,
  setMode,
  setReadOnly,
  type EditorMode,
  type EditorOptions,
} from "./config";
export { clearImageCache } from "./widgets/image-cache";
export { flushPendingChange, type EditorCallbacks } from "./callbacks";
export {
  getOutline,
  sameOutline,
  collectHeadings,
  findHeadingBySlug,
  type OutlineItem,
  type HeadingInfo,
} from "./outline";
export { scrollToLine, scrollToPos } from "./scroll";
export { githubSlug } from "./slug";
