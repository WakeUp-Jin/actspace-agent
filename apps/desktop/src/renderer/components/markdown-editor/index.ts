import { lazy } from "react";

/**
 * 「文档」面板 Markdown 编辑器的懒加载入口（规范 §3.3）：CM6、Lezer、core 整体放进独立 chunk，第一次打开文档正文时才下载。
 * 调用方（`DocsReader`）只能经这里引用编辑器，不能静态 import `core/` 或 `MarkdownEditor.tsx`；类型用 `import type` 不受影响。
 */
export const MarkdownEditor = lazy(() => import("./MarkdownEditor").then((module) => ({ default: module.MarkdownEditor })));

export type { MarkdownEditorHandle, MarkdownEditorProps } from "./MarkdownEditor";
export type { OutlineItem } from "./core/outline";
