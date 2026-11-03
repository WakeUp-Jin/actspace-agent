/**
 * 扩展组装（规范 §3.1 的 `config.ts`）。
 *
 * 预览和源码是同一个 `EditorView` 上的两套扩展，切换时只重新配置 Compartment，不重建 view，
 * 所以文档、撤销历史、光标、选区、滚动位置都保留。
 *
 * Compartment 分工：mode（预览装饰 / 源码样式）、lineNumbers、readOnly、host、callbacks、history。
 */
import { history } from "@codemirror/commands";
import { Compartment, EditorState, Transaction, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, lineNumbers } from "@codemirror/view";
import { search } from "@codemirror/search";
import { callbacksFacet, changeNotifier, externalReplace, type EditorCallbacks } from "./callbacks";
import { hostFacet, hostOf } from "./context";
import { focusExtension } from "./focus";
import { markdownHighlighting } from "./highlight";
import { blockField } from "./blocks";
import { inlineDecorations } from "./inline";
import { editorKeymap } from "./keymap";
import { cssLayerBridge } from "./layer-bridge";
import { linkClicks } from "./links";
import { searchPhrases } from "./phrases";
import { markdownSyntax } from "./syntax";
import { clearImageCache } from "./widgets/image-cache";
import type { MarkdownEditorHost } from "../host";

export type EditorMode = "preview" | "source";

export interface EditorOptions extends EditorCallbacks {
  doc: string;
  mode?: EditorMode;
  readOnly?: boolean;
  host?: MarkdownEditorHost | null;
  /** 行号；不传就跟随模式（源码显示，预览不显示，D11）。 */
  lineNumbers?: boolean;
}

const modeCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const hostCompartment = new Compartment();
const callbacksCompartment = new Compartment();
export const historyCompartment = new Compartment();

function modeExtensions(mode: EditorMode): Extension {
  return mode === "preview"
    ? [inlineDecorations, blockField, linkClicks, EditorView.editorAttributes.of({ class: "cm-md-preview" })]
    : EditorView.editorAttributes.of({ class: "cm-md-source" });
}

function lineNumberExtensions(on: boolean): Extension {
  return on ? lineNumbers() : [];
}

function readOnlyExtensions(readOnly: boolean): Extension {
  return readOnly ? EditorState.readOnly.of(true) : [];
}

function hostExtensions(host: MarkdownEditorHost | null | undefined): Extension {
  return host ? hostFacet.of(host) : [];
}

/** 只读时拒绝改文档的 transaction（程序化 dispatch 也拦），外部替换不受限。 */
const readOnlyGuard = EditorState.transactionFilter.of((tr) =>
  tr.docChanged && tr.startState.readOnly && !tr.annotation(externalReplace) ? [] : tr,
);

/** 编辑器的全部扩展。 */
export function createExtensions(options: EditorOptions): Extension {
  const mode = options.mode ?? "preview";
  return [
    markdownSyntax(),
    markdownHighlighting,
    focusExtension,
    historyCompartment.of(history()),
    drawSelection(),
    EditorView.lineWrapping,
    EditorState.phrases.of(searchPhrases),
    search({ top: true }),
    EditorView.editorAttributes.of({ class: "md-editor act-code-hl" }),
    cssLayerBridge,
    EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
    editorKeymap,
    readOnlyGuard,
    changeNotifier,
    modeCompartment.of(modeExtensions(mode)),
    lineNumbersCompartment.of(lineNumberExtensions(options.lineNumbers ?? mode === "source")),
    readOnlyCompartment.of(readOnlyExtensions(options.readOnly ?? false)),
    hostCompartment.of(hostExtensions(options.host)),
    callbacksCompartment.of(callbacksFacet.of({ onChange: options.onChange, onSave: options.onSave })),
  ];
}

export function createEditorState(options: EditorOptions): EditorState {
  return EditorState.create({ doc: options.doc, extensions: createExtensions(options) });
}

export function createEditorView(parent: HTMLElement, options: EditorOptions): EditorView {
  return new EditorView({ state: createEditorState(options), parent });
}

/** 切换预览 / 源码；行号跟着变（预览关、源码开）。文档、历史、选区、滚动位置不变，也不抢焦点。 */
export function setMode(view: EditorView, mode: EditorMode): void {
  view.dispatch({
    effects: [modeCompartment.reconfigure(modeExtensions(mode)), lineNumbersCompartment.reconfigure(lineNumberExtensions(mode === "source"))],
  });
}

/** 单独开关行号（在 `setMode` 之后调用可以覆盖默认）。 */
export function setLineNumbers(view: EditorView, on: boolean): void {
  view.dispatch({ effects: lineNumbersCompartment.reconfigure(lineNumberExtensions(on)) });
}

export function setReadOnly(view: EditorView, readOnly: boolean): void {
  view.dispatch({ effects: readOnlyCompartment.reconfigure(readOnlyExtensions(readOnly)) });
}

/** 换宿主（换文档时 `docPath` 变了）：装饰随之重算；换了文档就清空图片缓存（规范 §11）。 */
export function setHost(view: EditorView, host: MarkdownEditorHost | null): void {
  if (hostOf(view.state)?.docPath !== host?.docPath) clearImageCache();
  view.dispatch({ effects: hostCompartment.reconfigure(hostExtensions(host)) });
}

/**
 * 重新读取图片：清空缓存并让装饰重算（文档“重新加载”时调用，用户改了图片后能看到新图）。
 * 清空会让新建的 `ImageWidget` 与旧的不相等，所以即使文档内容没变，图片也会重新读取。
 */
export function refreshImages(view: EditorView): void {
  clearImageCache();
  const host = hostOf(view.state);
  // 浅拷贝一份：装饰是否重算比较的是宿主对象本身，同一个对象不会触发。
  view.dispatch({ effects: hostCompartment.reconfigure(hostExtensions(host ? { ...host } : null)) });
}

export function setCallbacks(view: EditorView, callbacks: EditorCallbacks): void {
  view.dispatch({ effects: callbacksCompartment.reconfigure(callbacksFacet.of(callbacks)) });
}

/**
 * 外部替换：整份写入新文档并清空撤销历史（规范 §4：换文档、重新加载、恢复暂存草稿、首次读取）。
 * 不触发 `onChange`；选区收到新文档的范围内，滚动位置不动。内容相同返回 false，什么都不做。
 */
export function replaceDocument(view: EditorView, text: string): boolean {
  const { state } = view;
  if (state.doc.toString() === text) return false;
  const clamp = (n: number): number => Math.min(n, text.length);
  const { anchor, head } = state.selection.main;
  view.dispatch({
    changes: { from: 0, to: state.doc.length, insert: text },
    selection: { anchor: clamp(anchor), head: clamp(head) },
    annotations: [externalReplace.of(true), Transaction.addToHistory.of(false)],
    // 移除再装回 history 扩展，撤销历史就是全新的
    effects: historyCompartment.reconfigure([]),
  });
  view.dispatch({ effects: historyCompartment.reconfigure(history()) });
  return true;
}

export function getDocument(view: EditorView): string {
  return view.state.doc.toString();
}
