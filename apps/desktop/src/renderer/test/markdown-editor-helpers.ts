/** Markdown 编辑器测试的公共工具：造状态、造真实 view（jsdom）、读装饰。 */
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, type Decoration, type DecorationSet } from "@codemirror/view";
import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { MarkdownEditorHost, MermaidRenderResult } from "../components/markdown-editor/host";
import { hostFacet } from "../components/markdown-editor/core/context";
import { blockField } from "../components/markdown-editor/core/blocks";
import { focusExtension, setFocusEffect } from "../components/markdown-editor/core/focus";
import { buildInlineDecorations } from "../components/markdown-editor/core/inline";
import { markdownSyntax } from "../components/markdown-editor/core/syntax";
import { createEditorView, type EditorOptions } from "../components/markdown-editor/core";

export function mermaidResult(source: string): MermaidRenderResult {
  return {
    svg: `<svg id="mm-1" data-len="${source.length}"><g id="mm-1-g"></g></svg>`,
    renderId: "mm-1",
    diagramType: "flowchart",
    width: 100,
    height: 50,
  };
}

export function makeHost(overrides: Partial<MarkdownEditorHost> = {}): MarkdownEditorHost {
  return {
    docPath: "docs/note.md",
    workspaceRoot: "/work/space",
    openPath: vi.fn(),
    openUrl: vi.fn(),
    loadImage: vi.fn(async () => null),
    renderMermaid: vi.fn(async (source: string) => mermaidResult(source)),
    ...overrides,
  };
}

export interface StateOptions {
  /** 光标位置：数字（光标）、[from, to]（选区）、或 `|` 在文档里的标记位置（见 `at`） */
  cursor?: number | [number, number];
  focused?: boolean;
  host?: MarkdownEditorHost | null;
}

/**
 * 用 `⌶` 标出光标位置，如 `at("a **b⌶** c")`；返回去掉标记的文档和光标位置。没有标记时光标在 0。
 */
export function at(source: string): { doc: string; cursor: number } {
  const index = source.indexOf("⌶");
  return index < 0 ? { doc: source, cursor: 0 } : { doc: source.replace("⌶", ""), cursor: index };
}

/** 带完整语法树、焦点状态和块级字段的状态；默认有焦点、光标在 0。 */
export function makeState(doc: string, options: StateOptions = {}): EditorState {
  const { focused = true } = options;
  const clamp = (n: number): number => Math.max(0, Math.min(n, doc.length));
  const cursor = options.cursor ?? 0;
  const host = options.host === undefined ? makeHost() : options.host;
  let state = EditorState.create({
    doc,
    selection: Array.isArray(cursor)
      ? EditorSelection.single(clamp(cursor[0]), clamp(cursor[1]))
      : EditorSelection.cursor(clamp(cursor)),
    extensions: [markdownSyntax(), focusExtension, blockField, host ? hostFacet.of(host) : []],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  if (focused) state = state.update({ effects: setFocusEffect.of(true) }).state;
  return state;
}

export interface Deco {
  from: number;
  to: number;
  /** 行装饰的类名 / 标记装饰的类名 */
  cls: string;
  kind: "line" | "mark" | "hide" | "widget" | "block";
  /** widget 的构造函数名 */
  widget?: string;
  attrs?: Record<string, string>;
}

function describe(from: number, to: number, value: Decoration): Deco {
  const spec = value.spec as {
    class?: string;
    widget?: { constructor: { name: string } };
    attributes?: Record<string, string>;
  };
  const widget = spec.widget?.constructor.name;
  let kind: Deco["kind"];
  if (from === to && !widget && spec.class !== undefined) kind = "line";
  else if (widget) kind = (value as unknown as { block: boolean }).block ? "block" : "widget";
  else if (spec.class !== undefined) kind = "mark";
  else kind = "hide";
  return { from, to, cls: spec.class ?? "", kind, widget, attrs: spec.attributes };
}

export function decos(set: DecorationSet, from = 0, to = 1e9): Deco[] {
  const out: Deco[] = [];
  set.between(from, to, (f, t, value) => {
    out.push(describe(f, t, value));
  });
  return out;
}

/** 行内装饰（整份文档）。 */
export function inlineDecos(state: EditorState): Deco[] {
  return decos(buildInlineDecorations(state).decorations);
}

export const hasClass = (list: Deco[], cls: string, kind?: Deco["kind"]): boolean =>
  list.some((d) => d.cls.split(/\s+/).includes(cls) && (!kind || d.kind === kind));

export const lineHas = (list: Deco[], lineStart: number, cls: string): boolean =>
  list.some((d) => d.kind === "line" && d.from === lineStart && d.cls.split(/\s+/).includes(cls));

/** `[from, to]` 被完整隐藏（replace 且没有 widget）。 */
export const isHidden = (list: Deco[], from: number, to: number): boolean =>
  list.some((d) => d.kind === "hide" && d.from === from && d.to === to);

export const widgetsIn = (list: Deco[]): string[] => list.filter((d) => d.widget).map((d) => d.widget as string);

/** jsdom 里 CM 测量布局要用的几个 API。 */
export function polyfillLayout(): void {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
  const rects = Object.assign([] as unknown as DOMRectList, { item: () => null });
  if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => rects;
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => rect;
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
}

const mounted: EditorView[] = [];

/** 挂到 document 的真实 EditorView；用例结束后用 `cleanupViews` 销毁。 */
export function mountEditor(options: Partial<EditorOptions> & { doc: string }): {
  view: EditorView;
  host: MarkdownEditorHost;
  parent: HTMLElement;
} {
  polyfillLayout();
  const parent = document.createElement("div");
  document.body.append(parent);
  const host = options.host === undefined || options.host === null ? makeHost() : options.host;
  const view = createEditorView(parent, { ...options, host });
  mounted.push(view);
  return { view, host, parent };
}

export function cleanupViews(): void {
  while (mounted.length) mounted.pop()?.destroy();
  document.body.innerHTML = "";
}

export function focusView(view: EditorView): void {
  view.dispatch({ effects: setFocusEffect.of(true) });
}

/** 页面里（组件测试）挂着的那个编辑器。 */
export function findEditorView(root: ParentNode = document): EditorView {
  const dom = root.querySelector(".cm-editor");
  const view = dom ? EditorView.findFromDOM(dom as HTMLElement) : null;
  if (!view) throw new Error("页面里没有 CodeMirror 编辑器");
  return view;
}

/** 在文档末尾（或指定位置）输入文字，走和键盘输入一样的 userEvent，会进撤销历史、触发 onChange。 */
export function typeInto(view: EditorView, text: string, at: number = view.state.doc.length): void {
  view.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
    userEvent: "input.type",
    scrollIntoView: true,
  });
}

/** 在编辑器内容区按键（⌘S 在非 Mac 的 jsdom 里是 Ctrl+S）。 */
export function pressKey(view: EditorView, init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  view.contentDOM.dispatchEvent(event);
  return event;
}

/** 输入并等一帧：onChange 每帧同步一次，等它发出去、React 渲染完，避免“未包在 act 里”的警告。 */
export async function typeSynced(view: EditorView, text: string, at?: number): Promise<void> {
  await act(async () => {
    typeInto(view, text, at);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}
