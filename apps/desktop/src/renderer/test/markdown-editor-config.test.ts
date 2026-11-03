/** 配置与公开 API：模式切换、只读、外部替换、变化回调、键位、输入法、查找。 */
import { openSearchPanel } from "@codemirror/search";
import { isolateHistory, redo, undo, undoDepth } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEditorState,
  flushPendingChange,
  getDocument,
  getOutline,
  replaceDocument,
  scrollToLine,
  setCallbacks,
  setHost,
  setLineNumbers,
  setMode,
  setReadOnly,
} from "../components/markdown-editor/core";
import { setFocusEffect } from "../components/markdown-editor/core/focus";
import { currentInlineDecorations } from "../components/markdown-editor/core/inline";
import { indentCommand, listIndentWidth, outdentCommand, saveCommand } from "../components/markdown-editor/core/keymap";
import { clearImageCache, peekImage } from "../components/markdown-editor/core/widgets/image-cache";
import { cleanupViews, decos, focusView, hasClass, makeHost, mountEditor } from "./markdown-editor-helpers";

afterEach(() => {
  cleanupViews();
  vi.useRealTimers();
  clearImageCache();
});

describe("模式：预览 / 源码", () => {
  const doc = "# 标题\n\n- [ ] 待办\n\n**粗** `src/a.ts`\n\n末尾";

  it("预览：有装饰、没有行号；源码：没有任何装饰和 widget，有行号", () => {
    const { view, parent } = mountEditor({ doc });
    focusView(view);
    view.dispatch({ selection: { anchor: doc.length } });
    expect(parent.querySelector(".cm-md-preview")).not.toBeNull();
    expect(parent.querySelector(".md-h1")).not.toBeNull();
    expect(parent.querySelector(".md-checkbox")).not.toBeNull();
    expect(parent.querySelector(".cm-lineNumbers")).toBeNull();
    setMode(view, "source");
    expect(parent.querySelector(".cm-md-source")).not.toBeNull();
    expect(parent.querySelector(".cm-md-preview")).toBeNull();
    expect(parent.querySelector(".cm-lineNumbers")).not.toBeNull();
    for (const selector of [".md-h", ".md-checkbox", ".md-path", ".md-bullet", ".md-code-head", ".md-fm-card"]) expect(parent.querySelector(selector)).toBeNull();
    expect(parent.querySelector(".cm-content")?.textContent).toContain("# 标题");
    expect(parent.querySelector(".cm-content")?.textContent).toContain("**粗**");
    setMode(view, "preview");
    expect(parent.querySelector(".md-h1")).not.toBeNull();
    expect(parent.querySelector(".cm-lineNumbers")).toBeNull();
  });

  it("切换保留同一个 view、文档、选区和撤销历史", () => {
    const { view } = mountEditor({ doc });
    const before = view;
    view.dispatch({ changes: { from: 0, insert: "甲" }, selection: { anchor: 3, head: 5 } });
    const text = getDocument(view);
    setMode(view, "source");
    expect(view).toBe(before);
    expect(getDocument(view)).toBe(text);
    expect(view.state.selection.main.anchor).toBe(3);
    expect(view.state.selection.main.head).toBe(5);
    expect(undoDepth(view.state)).toBe(1);
    // 在源码里再改一笔，切回预览后一并撤销
    view.dispatch({ changes: { from: 1, insert: "乙" }, userEvent: "input.type", annotations: isolateHistory.of("full") });
    setMode(view, "preview");
    expect(undoDepth(view.state)).toBe(2);
    expect(undo(view)).toBe(true);
    expect(getDocument(view)).toBe(text);
    expect(undo(view)).toBe(true);
    expect(getDocument(view)).toBe(doc);
    expect(redo(view)).toBe(true);
  });

  it("两种模式都能编辑", () => {
    const { view } = mountEditor({ doc: "a" });
    view.dispatch({ changes: { from: 1, insert: "b" } });
    setMode(view, "source");
    view.dispatch({ changes: { from: 2, insert: "c" } });
    expect(getDocument(view)).toBe("abc");
  });

  it("以源码模式创建；setLineNumbers 可单独覆盖", () => {
    const { view, parent } = mountEditor({ doc, mode: "source" });
    expect(parent.querySelector(".cm-lineNumbers")).not.toBeNull();
    setLineNumbers(view, false);
    expect(parent.querySelector(".cm-lineNumbers")).toBeNull();
  });

  it("源码模式仍有语法着色（标题、代码块）", () => {
    const { parent } = mountEditor({ doc: "# 标题\n\n```js\nlet a = 1;\n```\n", mode: "source" });
    expect(parent.querySelector(".tok-heading")).not.toBeNull();
  });

  it("预览根节点带 act-code-hl，代码高亮用 --md-hl-* 变量", () => {
    const { parent } = mountEditor({ doc: "x" });
    expect(parent.querySelector(".cm-editor")?.classList.contains("act-code-hl")).toBe(true);
    expect(parent.querySelector(".cm-editor")?.classList.contains("md-editor")).toBe(true);
  });

  it("挂载了 layer 桥接主题：CM 自带主题的字体、内边距等回退到 markdown-editor.css", () => {
    mountEditor({ doc: "x" });
    const css = [
      ...Array.from(document.querySelectorAll("style"), (el) => el.textContent ?? ""),
      ...(document.adoptedStyleSheets ?? []).flatMap((sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText)),
    ].join("\n");
    for (const rule of [/\.cm-scroller\s*\{[^}]*font-family:\s*revert-layer/, /\.cm-line\s*\{[^}]*padding:\s*revert-layer/, /\.cm-content\s*\{[^}]*margin:\s*revert-layer/]) {
      expect(css).toMatch(rule);
    }
  });
});

describe("焦点：失焦即纯阅读状态", () => {
  it("没有焦点时光标进标题也不露出 #；聚焦后露出；失焦后收起", () => {
    const { view, parent } = mountEditor({ doc: "# 标题\n\n末尾" });
    view.dispatch({ selection: { anchor: 3 } });
    expect(parent.querySelector(".md-h1")?.textContent).toBe("标题");
    focusView(view);
    expect(parent.querySelector(".md-h1")?.textContent).toBe("# 标题");
    view.dispatch({ effects: setFocusEffect.of(false) });
    expect(parent.querySelector(".md-h1")?.textContent).toBe("标题");
  });
});

describe("只读", () => {
  it("拒绝所有改文档的 transaction（程序化 dispatch 也拦），选择不受限", () => {
    const { view } = mountEditor({ doc: "abc", readOnly: true });
    view.dispatch({ changes: { from: 0, insert: "x" } });
    expect(getDocument(view)).toBe("abc");
    view.dispatch({ selection: { anchor: 2 } });
    expect(view.state.selection.main.head).toBe(2);
    expect(view.state.readOnly).toBe(true);
  });

  it("setReadOnly 开关；关闭后可编辑", () => {
    const { view } = mountEditor({ doc: "abc" });
    setReadOnly(view, true);
    view.dispatch({ changes: { from: 0, insert: "x" } });
    expect(getDocument(view)).toBe("abc");
    setReadOnly(view, false);
    view.dispatch({ changes: { from: 0, insert: "x" } });
    expect(getDocument(view)).toBe("xabc");
  });

  it("只读时外部替换仍然有效", () => {
    const { view } = mountEditor({ doc: "abc", readOnly: true });
    expect(replaceDocument(view, "新内容")).toBe(true);
    expect(getDocument(view)).toBe("新内容");
  });

  it("只读时键位命令（Tab、保存）不响应", () => {
    const onSave = vi.fn();
    const { view } = mountEditor({ doc: "- a", readOnly: true, onSave });
    view.dispatch({ selection: { anchor: 3 } });
    expect(indentCommand(view)).toBe(false);
    expect(outdentCommand(view)).toBe(false);
    expect(saveCommand(view)).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    expect(getDocument(view)).toBe("- a");
  });
});

describe("外部替换（规范 §4）", () => {
  it("整份写入、清空撤销历史、不触发 onChange", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const onChange = vi.fn();
    const { view } = mountEditor({ doc: "旧", onChange });
    view.dispatch({ changes: { from: 1, insert: "稿" }, userEvent: "input.type" });
    expect(undoDepth(view.state)).toBe(1);
    expect(replaceDocument(view, "全新的文档")).toBe(true);
    expect(getDocument(view)).toBe("全新的文档");
    expect(undoDepth(view.state)).toBe(0);
    expect(undo(view)).toBe(false);
    vi.advanceTimersByTime(100);
    expect(onChange).not.toHaveBeenCalled(); // 替换前没发出去的用户改动也作废
    // 之后的输入仍然正常记录历史、正常通知
    view.dispatch({ changes: { from: 0, insert: "!" }, userEvent: "input.type" });
    expect(undoDepth(view.state)).toBe(1);
    vi.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledWith("!全新的文档");
  });

  it("内容相同：什么都不做，历史保留", () => {
    const { view } = mountEditor({ doc: "a" });
    view.dispatch({ changes: { from: 1, insert: "b" }, userEvent: "input.type" });
    expect(replaceDocument(view, "ab")).toBe(false);
    expect(undoDepth(view.state)).toBe(1);
  });

  it("选区收进新文档的范围内", () => {
    const { view } = mountEditor({ doc: "0123456789" });
    view.dispatch({ selection: EditorSelection.single(8, 10) });
    replaceDocument(view, "abc");
    expect(view.state.selection.main.anchor).toBe(3);
    expect(view.state.selection.main.head).toBe(3);
  });

  it("替换后模式、只读、宿主设置不丢", () => {
    const { view, parent } = mountEditor({ doc: "a", mode: "source", readOnly: true });
    replaceDocument(view, "b");
    expect(parent.querySelector(".cm-md-source")).not.toBeNull();
    expect(view.state.readOnly).toBe(true);
  });
});

describe("onChange：每帧最多一次", () => {
  it("一帧里多次输入只通知一次，内容是最新全文", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const onChange = vi.fn();
    const { view } = mountEditor({ doc: "", onChange });
    for (const ch of "abc") view.dispatch({ changes: { from: view.state.doc.length, insert: ch }, userEvent: "input.type" });
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("abc");
    view.dispatch({ changes: { from: 3, insert: "d" }, userEvent: "input.type" });
    vi.advanceTimersByTime(20);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith("abcd");
  });

  it("只改选区、只切模式：不通知", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const onChange = vi.fn();
    const { view } = mountEditor({ doc: "abc", onChange });
    view.dispatch({ selection: { anchor: 1 } });
    setMode(view, "source");
    vi.advanceTimersByTime(50);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("复选框改写也算用户编辑，会通知", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const onChange = vi.fn();
    const { view, parent } = mountEditor({ doc: "- [ ] a\n\n末尾", onChange });
    focusView(view);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    parent.querySelector(".md-checkbox")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(20);
    expect(onChange).toHaveBeenCalledWith("- [x] a\n\n末尾");
  });

  it("flushPendingChange 立刻补发；之后这一帧不再重复", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const onChange = vi.fn();
    const { view } = mountEditor({ doc: "", onChange });
    view.dispatch({ changes: { from: 0, insert: "x" }, userEvent: "input.type" });
    flushPendingChange(view);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(onChange).toHaveBeenCalledTimes(1);
    flushPendingChange(view);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("销毁时补发最后一帧的变化，不丢字", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const onChange = vi.fn();
    const { view } = mountEditor({ doc: "", onChange });
    view.dispatch({ changes: { from: 0, insert: "最后一笔" }, userEvent: "input.type" });
    view.destroy();
    expect(onChange).toHaveBeenCalledWith("最后一笔");
  });

  it("setCallbacks 换回调：不重建 view", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const first = vi.fn();
    const second = vi.fn();
    const { view } = mountEditor({ doc: "", onChange: first });
    setCallbacks(view, { onChange: second });
    view.dispatch({ changes: { from: 0, insert: "x" }, userEvent: "input.type" });
    vi.advanceTimersByTime(20);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("x");
  });
});

describe("宿主", () => {
  it("换宿主（换文档）：路径按新文档所在目录重新解析，装饰重算", () => {
    const { view, parent } = mountEditor({ doc: "[x](a.md)\n\n末尾", host: makeHost({ docPath: "docs/note.md" }) });
    focusView(view);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(parent.querySelector(".md-link")?.getAttribute("title")).toBe("a.md");
    const openPath = vi.fn();
    setHost(view, makeHost({ docPath: "other/deep/note.md", openPath }));
    expect(parent.querySelector(".md-link-file")).not.toBeNull();
    // 点击时用新宿主打开
    parent.querySelector(".md-link")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(openPath).toHaveBeenCalledWith("other/deep/a.md", undefined);
  });

  it("路径和本地链接：文件图标和第一个字符在同一个不换行的 .md-path-lead 里", () => {
    const { view, parent } = mountEditor({ doc: "改了 `src/app.ts` 和 [入口](a.md)\n\n末尾", host: makeHost({ docPath: "docs/note.md" }) });
    focusView(view);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const pathLead = parent.querySelector(".md-path .md-path-lead");
    expect(pathLead?.querySelector(".md-path-icon")).not.toBeNull();
    expect(pathLead?.textContent).toBe("s");
    const linkLead = parent.querySelector(".md-link-file .md-path-lead");
    expect(linkLead?.querySelector(".md-path-icon")).not.toBeNull();
    expect(linkLead?.textContent).toBe("入");
  });

  it("换了文档（docPath 变了）清空图片缓存；同一文档不清", async () => {
    const host = makeHost({ loadImage: vi.fn(async () => "data:image/png;base64,AA==") });
    const { view, parent } = mountEditor({ doc: "![x](a.png)\n\n末尾", host });
    focusView(view);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    await vi.waitFor(() => expect(parent.querySelector(".md-img img")).not.toBeNull());
    expect(peekImage(host, "docs/a.png")).toBe("data:image/png;base64,AA==");
    setHost(view, { ...host });
    expect(peekImage(host, "docs/a.png")).not.toBeUndefined();
    setHost(view, { ...host, docPath: "elsewhere/x.md" });
    expect(peekImage(host, "docs/a.png")).toBeUndefined();
  });

  it("没有宿主也不崩：路径、图片按普通文字", () => {
    const state = createEditorState({ doc: "`src/a.ts` ![x](a.png)", host: null });
    expect(state.doc.length).toBeGreaterThan(0);
    const { parent } = mountEditor({ doc: "`src/a.ts`\n\n末尾" });
    expect(parent.querySelector(".cm-line")).not.toBeNull();
  });
});

describe("键位", () => {
  const typeKey = (view: ReturnType<typeof mountEditor>["view"], init: KeyboardEventInit & { key: string }) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    view.contentDOM.dispatchEvent(event);
    return event;
  };

  it("listIndentWidth：无序 2、有序 3、两位序号 4、不在列表里 null", () => {
    const { view } = mountEditor({ doc: "- a\n\n1. b\n\n10. c\n\n文字" });
    const at = (needle: string) => view.state.doc.toString().indexOf(needle);
    expect(listIndentWidth(view.state, at("a"))).toBe(2);
    expect(listIndentWidth(view.state, at("b"))).toBe(3);
    expect(listIndentWidth(view.state, at("c"))).toBe(4);
    expect(listIndentWidth(view.state, at("文字"))).toBeNull();
  });

  it("Tab 在列表里缩进，Shift+Tab 反缩进", () => {
    const { view } = mountEditor({ doc: "- 甲\n- 乙" });
    view.dispatch({ selection: { anchor: 7 } });
    typeKey(view, { key: "Tab", keyCode: 9 });
    expect(getDocument(view)).toBe("- 甲\n  - 乙");
    typeKey(view, { key: "Tab", keyCode: 9, shiftKey: true });
    expect(getDocument(view)).toBe("- 甲\n- 乙");
  });

  it("有序列表按 3 个空格缩进", () => {
    const { view } = mountEditor({ doc: "1. 甲\n2. 乙" });
    view.dispatch({ selection: { anchor: 9 } });
    indentCommand(view);
    expect(getDocument(view)).toBe("1. 甲\n   2. 乙");
    outdentCommand(view);
    expect(getDocument(view)).toBe("1. 甲\n2. 乙");
  });

  it("选中多个列表项：每一项都缩进", () => {
    const { view } = mountEditor({ doc: "- 甲\n- 乙\n- 丙" });
    view.dispatch({ selection: EditorSelection.single(0, view.state.doc.length) });
    indentCommand(view);
    expect(getDocument(view)).toBe("  - 甲\n  - 乙\n  - 丙");
  });

  it("其他位置 Tab 插入两个空格", () => {
    const { view } = mountEditor({ doc: "文字" });
    view.dispatch({ selection: { anchor: 1 } });
    typeKey(view, { key: "Tab", keyCode: 9 });
    expect(getDocument(view)).toBe("文  字");
    expect(view.state.selection.main.head).toBe(3);
  });

  it("代码块里的 Tab 也是两个空格", () => {
    const { view } = mountEditor({ doc: "```js\nlet a\n```" });
    view.dispatch({ selection: { anchor: 6 } });
    indentCommand(view);
    expect(getDocument(view)).toBe("```js\n  let a\n```");
  });

  it("Enter 在列表里续行，空的列表项结束列表", () => {
    const { view } = mountEditor({ doc: "- 甲\n- 乙" });
    view.dispatch({ selection: { anchor: 7 } });
    typeKey(view, { key: "Enter", keyCode: 13 });
    expect(getDocument(view)).toBe("- 甲\n- 乙\n- ");
    typeKey(view, { key: "Enter", keyCode: 13 });
    expect(getDocument(view)).toBe("- 甲\n- 乙\n");
  });

  it("Enter 续任务列表和引用", () => {
    const task = mountEditor({ doc: "- [ ] 甲" });
    task.view.dispatch({ selection: { anchor: 7 } });
    typeKey(task.view, { key: "Enter", keyCode: 13 });
    expect(getDocument(task.view)).toBe("- [ ] 甲\n- [ ] ");
    const quote = mountEditor({ doc: "> 引" });
    quote.view.dispatch({ selection: { anchor: 3 } });
    typeKey(quote.view, { key: "Enter", keyCode: 13 });
    expect(getDocument(quote.view)).toBe("> 引\n> ");
  });

  it("Backspace 在空列表项开头删掉列表标记（换成缩进空格，仍在这一项里）", () => {
    const { view } = mountEditor({ doc: "- 甲\n- " });
    view.dispatch({ selection: { anchor: 6 } });
    typeKey(view, { key: "Backspace", keyCode: 8 });
    expect(getDocument(view)).toBe("- 甲\n  ");
  });

  it("⌘S / Ctrl+S 保存：先补发 onChange，再调用 onSave；没有 onSave 时不拦截", () => {
    const order: string[] = [];
    const { view } = mountEditor({ doc: "", onChange: () => order.push("change"), onSave: () => order.push("save") });
    view.dispatch({ changes: { from: 0, insert: "x" }, userEvent: "input.type" });
    const event = typeKey(view, { key: "s", keyCode: 83, ctrlKey: true });
    expect(order).toEqual(["change", "save"]);
    expect(event.defaultPrevented).toBe(true);
    const none = mountEditor({ doc: "" });
    expect(saveCommand(none.view)).toBe(false);
  });

  it("⌘Z 撤销", () => {
    const { view } = mountEditor({ doc: "a" });
    view.dispatch({ changes: { from: 1, insert: "b" }, userEvent: "input.type" });
    typeKey(view, { key: "z", keyCode: 90, ctrlKey: true });
    expect(getDocument(view)).toBe("a");
  });
});

describe("输入法组字：不重算装饰", () => {
  function startComposition(view: ReturnType<typeof mountEditor>["view"]) {
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  }

  it("组字期间文档变化只映射已有装饰，组字结束后补算", () => {
    const { view } = mountEditor({ doc: "文字\n\n末尾" });
    focusView(view);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    startComposition(view);
    expect(view.compositionStarted).toBe(true);
    // 组字中把第一行敲成了标题：不重算，所以还没有标题装饰
    view.dispatch({ changes: { from: 0, insert: "# " }, userEvent: "input.type.compose" });
    expect(decos(currentInlineDecorations(view)).some((d) => d.cls.includes("md-h"))).toBe(false);
    // 组字结束：补算
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    view.dispatch({ selection: { anchor: 0 } });
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(decos(currentInlineDecorations(view)).some((d) => d.cls.includes("md-h"))).toBe(true);
  });

  it("组字期间只移动选区也不重算", () => {
    const { view } = mountEditor({ doc: "# 标题\n\n末尾" });
    focusView(view);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const before = currentInlineDecorations(view);
    startComposition(view);
    view.dispatch({ selection: { anchor: 3 } });
    expect(currentInlineDecorations(view)).toBe(before);
  });
});

describe("大纲与跳转", () => {
  it("getOutline 两种模式下结果一致", () => {
    const { view } = mountEditor({ doc: "# 一\n\n## 甲\n\n### 乙\n" });
    const preview = getOutline(view.state);
    setMode(view, "source");
    expect(getOutline(view.state)).toEqual(preview);
    expect(preview.map((item) => item.text)).toEqual(["甲", "乙"]);
  });

  it("scrollToLine：选中整行；越界取边界", () => {
    const { view } = mountEditor({ doc: "第一行\n第二行\n第三行" });
    scrollToLine(view, 2);
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe("第二行");
    scrollToLine(view, 99);
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe("第三行");
    scrollToLine(view, 0);
    expect(view.state.selection.main.from).toBe(0);
    scrollToLine(view, 2, { select: false });
    expect(view.state.selection.main.empty).toBe(true);
  });
});

describe("查找", () => {
  it("⌘F 打开顶部查找面板，文案是中文", () => {
    const { view, parent } = mountEditor({ doc: "abc abc" });
    openSearchPanel(view);
    const panel = parent.querySelector(".cm-search");
    expect(panel).not.toBeNull();
    expect(parent.querySelector(".cm-panels-top")).not.toBeNull();
    expect(panel?.querySelector("input[name=search]")?.getAttribute("placeholder")).toBe("查找");
    expect(panel?.textContent).toContain("下一个");
    expect(panel?.textContent).toContain("上一个");
  });
});
