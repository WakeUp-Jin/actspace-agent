import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { EditorView } from "@codemirror/view";
import {
  clearImageCache,
  createEditorView,
  getOutline,
  refreshImages,
  replaceDocument,
  sameOutline,
  scrollToLine,
  scrollToPos,
  setHost,
  setMode,
  setReadOnly,
  type EditorMode,
  type OutlineItem,
} from "./core";
import { useMarkdownEditorHost } from "./use-markdown-editor-host";

/**
 * 「文档」面板的 Markdown 编辑器外壳（规范 §3.1、§4）：只负责挂载 / 卸载 `EditorView`、
 * 把草稿同步给面板、把宿主接进去，编辑和渲染都在 `core/`。
 *
 * 数据流：
 * - 编辑器 → 草稿：`onChange`，core 每帧最多通知一次，参数是全文；
 * - 草稿 → 编辑器：只在 `replaceKey` 变化时整份写入（外部替换：换文档、重新加载、恢复暂存草稿、首次读取），
 *   同时清空撤销历史、重新读取图片。用户自己输入引起的 `value` 变化一律不回写，避免循环；
 * - 模式、只读、宿主变化只重新配置，不重建 view，所以光标、选区、撤销历史、滚动位置都保留。
 */

export interface MarkdownEditorHandle {
  /** 当前文档的 h2 / h3（两种模式都可用）。 */
  getOutline(): OutlineItem[];
  /** 大纲变化的订阅（用户输入或外部替换之后）；返回取消订阅。没有订阅者时不做任何计算。 */
  subscribeOutline(listener: (items: OutlineItem[]) => void): () => void;
  /** 滚到某个标题，标题与顶部留 12px。 */
  scrollToHeading(item: OutlineItem): void;
  /** 滚到第 `line` 行并选中整行。 */
  scrollToLine(line: number): void;
  focus(): void;
}

export interface MarkdownEditorProps {
  /** 草稿全文。只在挂载和 `replaceKey` 变化时读取。 */
  value: string;
  /** 当前文档的工作区相对路径（解析文中的相对路径）。 */
  docPath: string;
  workspaceRoot?: string;
  mode: EditorMode;
  readOnly?: boolean;
  /** 变化即视为外部替换，把 `value` 整份写进编辑器。 */
  replaceKey?: string | number;
  /** 一次性的“滚到某行并选中”请求；`id` 变化才会再次触发。 */
  revealLine?: { line: number; id: number } | null;
  /** `revealLine` 处理完后调用，由调用方清掉请求。 */
  onRevealed?: () => void;
  onChange: (doc: string) => void;
  onSave: () => void;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  { value, docPath, workspaceRoot, mode, readOnly = false, replaceKey, revealLine, onRevealed, onChange, onSave },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { host, previewDialog } = useMarkdownEditorHost({ docPath, workspaceRoot });

  // 回调、初始值只在创建 view 时读一次，之后经 ref 取最新，不需要为了换闭包重建 view。
  const latest = useRef({ value, mode, readOnly, host, onChange, onSave, onRevealed });
  latest.current = { value, mode, readOnly, host, onChange, onSave, onRevealed };

  const outline = useRef<{ listeners: Set<(items: OutlineItem[]) => void>; last: OutlineItem[] }>({ listeners: new Set(), last: [] });
  const notifyOutline = () => {
    const view = viewRef.current;
    const state = outline.current;
    if (!view || state.listeners.size === 0) return;
    const next = getOutline(view.state);
    if (sameOutline(next, state.last)) return;
    state.last = next;
    for (const listener of state.listeners) listener(next);
  };
  const notifyOutlineRef = useRef(notifyOutline);
  notifyOutlineRef.current = notifyOutline;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const initial = latest.current;
    let alive = true;
    // 新建 view 意味着换了文档或重新加载（读盘期间面板显示加载中，编辑器会卸载重建）：图片缓存不跨文档沿用。
    clearImageCache();
    const view = createEditorView(container, {
      doc: initial.value,
      mode: initial.mode,
      readOnly: initial.readOnly,
      host: initial.host,
      onChange: (doc) => {
        if (!alive) return;
        latest.current.onChange(doc);
        notifyOutlineRef.current();
      },
      onSave: () => {
        if (alive) latest.current.onSave();
      },
    });
    viewRef.current = view;
    return () => {
      // destroy 会把最后一帧还没发出去的输入补发给 onChange（不丢字），随后一律不再回调。
      view.destroy();
      alive = false;
      if (viewRef.current === view) viewRef.current = null;
    };
  }, []);

  const mounted = useRef(false);
  const previous = useRef({ mode, readOnly, host, replaceKey });
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const before = previous.current;
    previous.current = { mode, readOnly, host, replaceKey };
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (before.host !== host) setHost(view, host);
    if (before.readOnly !== readOnly) setReadOnly(view, readOnly);
    if (before.mode !== mode) {
      setMode(view, mode);
      // 从操作栏切换后，焦点和光标留在编辑器里，可以直接接着打字（规范 §9.4）。
      view.focus();
    }
    if (before.replaceKey !== replaceKey) {
      replaceDocument(view, latest.current.value);
      // 内容没变（重新加载读到同一份）时 replaceDocument 什么都不做，图片仍要重新读，用户可能改过图。
      refreshImages(view);
      notifyOutlineRef.current();
    }
  }, [mode, readOnly, host, replaceKey]);

  const revealId = revealLine?.id;
  const revealTarget = revealLine?.line;
  useEffect(() => {
    const view = viewRef.current;
    if (!view || revealId === undefined || revealTarget === undefined) return;
    scrollToLine(view, revealTarget);
    latest.current.onRevealed?.();
  }, [revealId, revealTarget]);

  useImperativeHandle(ref, () => ({
    getOutline: () => (viewRef.current ? getOutline(viewRef.current.state) : []),
    subscribeOutline(listener) {
      const state = outline.current;
      if (state.listeners.size === 0 && viewRef.current) state.last = getOutline(viewRef.current.state);
      state.listeners.add(listener);
      return () => { state.listeners.delete(listener); };
    },
    scrollToHeading(item) {
      if (viewRef.current) scrollToPos(viewRef.current, item.from, { smooth: true, margin: 12 });
    },
    scrollToLine(line) {
      if (viewRef.current) scrollToLine(viewRef.current, line);
    },
    focus() {
      viewRef.current?.focus();
    },
  }), []);

  return (
    <>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden" data-testid="docs-editor" />
      {previewDialog}
    </>
  );
});
