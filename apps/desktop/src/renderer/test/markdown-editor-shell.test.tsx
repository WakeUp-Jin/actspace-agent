import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { undoDepth } from "@codemirror/commands";
import readerSource from "../components/right-panel/docs/DocsReader.tsx?raw";
import outlineSource from "../components/right-panel/docs/DocsOutline.tsx?raw";
import entrySource from "../components/markdown-editor/index.ts?raw";
import { createRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocument } from "../components/markdown-editor/core";
import { MarkdownEditor as LazyMarkdownEditor } from "../components/markdown-editor";
import { MarkdownEditor, type MarkdownEditorHandle, type MarkdownEditorProps } from "../components/markdown-editor/MarkdownEditor";
import { useMarkdownEditorHost } from "../components/markdown-editor/use-markdown-editor-host";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";
import { overrideBridge, setupBridge } from "./helpers/bridge";
import { findEditorView, polyfillLayout, typeInto, typeSynced } from "./markdown-editor-helpers";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn(async (id: string) => ({ svg: `<svg id="${id}" viewBox="0 0 10 10" width="10" height="10"></svg>`, diagramType: "flowchart-v2" })) } }));

const PNG = "data:image/png;base64,AA==";

const wrapper = ({ children }: { children: ReactNode }) => <RightPanelProvider>{children}</RightPanelProvider>;

type Props = Partial<MarkdownEditorProps>;

function mount(props: Props = {}) {
  const onChange = vi.fn();
  const onSave = vi.fn();
  const handle = createRef<MarkdownEditorHandle>();
  const base: MarkdownEditorProps = { value: "# 标题\n\n正文", docPath: "docs/note.md", workspaceRoot: "/ws", mode: "preview", onChange, onSave, ...props };
  const view = render(<MarkdownEditor ref={handle} {...base} />, { wrapper });
  const rerender = (next: Props) => view.rerender(<MarkdownEditor ref={handle} {...base} {...next} />);
  return { ...view, rerender, onChange, onSave, handle, editor: () => findEditorView() };
}

/** 父组件像 DocsPanel 一样把 onChange 的内容存成草稿，再作为 value 传回来。 */
function Controlled({ initial, onDraft }: { initial: string; onDraft: (draft: string) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <MarkdownEditor
      value={draft}
      docPath="docs/note.md"
      mode="preview"
      replaceKey="a"
      onChange={(doc) => { setDraft(doc); onDraft(doc); }}
      onSave={() => undefined}
    />
  );
}

beforeEach(() => {
  polyfillLayout();
  setupBridge();
});
afterEach(() => vi.useRealTimers());

describe("MarkdownEditor 外壳：同步", () => {
  it("连续输入不丢字：每帧最多通知一次，内容是全文，草稿回传 value 也不会回写编辑器", async () => {
    const drafts: string[] = [];
    render(<Controlled initial="开头" onDraft={(draft) => drafts.push(draft)} />, { wrapper });
    const view = findEditorView();
    for (const char of "连续输入一段话") await typeSynced(view, char);
    expect(getDocument(view)).toBe("开头连续输入一段话");
    expect(drafts.at(-1)).toBe("开头连续输入一段话");
    expect(drafts.length).toBeLessThanOrEqual("连续输入一段话".length);
    // 回传的 value 没有触发外部替换：撤销历史还在，光标还在末尾
    expect(undoDepth(view.state)).toBeGreaterThan(0);
    expect(view.state.selection.main.head).toBe(getDocument(view).length);
  });

  it("同一帧里的多次输入合并成一次 onChange", async () => {
    const { editor, onChange } = mount();
    const view = editor();
    await act(async () => {
      typeInto(view, "a");
      typeInto(view, "b");
      typeInto(view, "c");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("# 标题\n\n正文abc");
  });

  it("外部替换（replaceKey 变化）：整份写入、清空撤销历史、不触发 onChange", async () => {
    const { editor, rerender, onChange } = mount({ replaceKey: "a" });
    const view = editor();
    await typeSynced(view, "旧输入");
    onChange.mockClear();
    expect(undoDepth(view.state)).toBeGreaterThan(0);

    rerender({ value: "# 另一篇\n", replaceKey: "b" });
    expect(editor()).toBe(view);
    expect(getDocument(view)).toBe("# 另一篇\n");
    expect(undoDepth(view.state)).toBe(0);
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("value 变了但 replaceKey 没变：是用户输入的回声，不回写", async () => {
    const { editor, rerender } = mount({ replaceKey: "a" });
    const view = editor();
    rerender({ value: "完全不同的内容", replaceKey: "a" });
    expect(getDocument(view)).toBe("# 标题\n\n正文");
  });

  it("重新加载读到同一份内容：不改文档，但图片重新读取（用户可能改过图）", async () => {
    const reads = vi.fn(async ({ relativePath }: { relativePath: string }) => ({ relativePath, renderKind: "image" as const, size: 1, mtimeMs: 1, dataUrl: PNG }));
    overrideBridge({ "workspaces.readFile": reads });
    const doc = "![图](a.png)\n\n末尾";
    const { editor, rerender, container } = mount({ value: doc, replaceKey: "a" });
    const view = editor();
    view.dispatch({ selection: { anchor: doc.length } });
    await waitFor(() => expect(container.querySelector(".md-img img")).not.toBeNull());
    expect(reads).toHaveBeenCalledTimes(1);

    rerender({ value: doc, replaceKey: "b" });
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.querySelector(".md-img img")).not.toBeNull());
  });

  it("保存前先补发还没通知的输入", async () => {
    const { editor, onChange, onSave } = mount();
    const view = editor();
    await act(async () => {
      typeInto(view, "x");
      view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "s", keyCode: 83, ctrlKey: true, bubbles: true, cancelable: true }));
    });
    expect(onChange).toHaveBeenCalledWith("# 标题\n\n正文x");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onChange.mock.invocationCallOrder[0]).toBeLessThan(onSave.mock.invocationCallOrder[0]);
  });
});

describe("MarkdownEditor 外壳：生命周期", () => {
  it("卸载时补发最后一帧的输入（不丢字），之后不再回调", async () => {
    const { editor, unmount, onChange, onSave } = mount();
    const view = editor();
    await act(async () => { typeInto(view, "最后一笔"); });
    expect(onChange).not.toHaveBeenCalled();
    unmount();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("# 标题\n\n正文最后一笔");
    await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 50)); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector(".cm-editor")).toBeNull();
  });

  it("模式、只读变化只重新配置：同一个 view，光标和撤销历史保留；切换模式后焦点在编辑器里", async () => {
    const { editor, rerender } = mount();
    const view = editor();
    await typeSynced(view, "改动");
    view.dispatch({ selection: { anchor: 4 } });
    const depth = undoDepth(view.state);

    rerender({ mode: "source" });
    expect(editor()).toBe(view);
    expect(view.dom).toHaveClass("cm-md-source");
    expect(view.state.selection.main.head).toBe(4);
    expect(undoDepth(view.state)).toBe(depth);
    expect(document.activeElement).toBe(view.contentDOM);

    rerender({ mode: "source", readOnly: true });
    expect(view.state.readOnly).toBe(true);
    typeInto(view, "不该进来");
    expect(getDocument(view)).not.toContain("不该进来");
    rerender({ mode: "preview", readOnly: false });
    expect(view.state.readOnly).toBe(false);
    expect(view.dom).toHaveClass("cm-md-preview");
  });

  it("换 docPath：宿主随之更新，相对路径按新文档所在目录解析", async () => {
    const { editor, rerender, container } = mount({ value: "[x](a.md)\n\n末尾", docPath: "docs/note.md" });
    const view = editor();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(container.querySelector(".md-link")?.getAttribute("title")).toBe("a.md");
    rerender({ value: "[x](a.md)\n\n末尾", docPath: "other/deep/note.md" });
    expect(container.querySelector(".md-link-file")).not.toBeNull();
  });

  it("不静态引用编辑器：DocsReader 只经懒加载入口使用它", () => {
    const staticImports = (source: string) => source.split("\n").filter((line) => /^import (?!type)/.test(line) && line.includes("markdown-editor"));
    expect(staticImports(readerSource)).toEqual(['import { MarkdownEditor, type MarkdownEditorHandle } from "../../markdown-editor";']);
    expect(staticImports(outlineSource)).toEqual([]);
    expect(entrySource).toMatch(/lazy\(\(\) => import\("\.\/MarkdownEditor"\)/);
    expect(entrySource).not.toMatch(/^export \{[^}]*\} from "\.\/(MarkdownEditor|core)/m);
    expect(LazyMarkdownEditor).toBeDefined();
  });
});

describe("MarkdownEditor 外壳：大纲句柄", () => {
  const DOC = "# 题\n\n## 甲\n\n```\n## 代码里\n```\n\n### 乙\n";

  it("getOutline 取 h2/h3；scrollToHeading / scrollToLine 可用", () => {
    const { handle, editor } = mount({ value: DOC });
    expect(handle.current?.getOutline().map((item) => `${item.level}:${item.text}`)).toEqual(["2:甲", "3:乙"]);
    const view = editor();
    const scrollTo = vi.fn();
    view.scrollDOM.scrollTo = scrollTo as unknown as typeof view.scrollDOM.scrollTo;
    handle.current?.scrollToHeading(handle.current.getOutline()[1]);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    handle.current?.scrollToLine(3);
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("## 甲");
  });

  it("订阅：输入引起大纲变化才通知；取消后不再通知", async () => {
    const { handle, editor } = mount({ value: DOC });
    const view = editor();
    const listener = vi.fn();
    const unsubscribe = handle.current!.subscribeOutline(listener);
    await typeSynced(view, "\n\n普通段落");
    expect(listener).not.toHaveBeenCalled();
    await typeSynced(view, "\n\n## 新章节\n");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].map((item: { text: string }) => item.text)).toEqual(["甲", "乙", "新章节"]);
    unsubscribe();
    await typeSynced(view, "\n\n## 又一个\n");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("外部替换后也通知订阅者", async () => {
    const { handle, rerender } = mount({ value: DOC, replaceKey: "a" });
    const listener = vi.fn();
    handle.current!.subscribeOutline(listener);
    rerender({ value: "## 全新\n", replaceKey: "b" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].map((item: { text: string }) => item.text)).toEqual(["全新"]);
  });
});

describe("useMarkdownEditorHost（宿主实现）", () => {
  function Probe() {
    const { docsSelectedPath, docsPendingLine, activeTab } = useRightPanel();
    return <output data-testid="probe">{JSON.stringify({ path: docsSelectedPath, line: docsPendingLine?.line ?? null, tab: activeTab?.kind ?? null })}</output>;
  }

  function mountHost(props: { docPath?: string; workspaceRoot?: string } = {}) {
    return renderHook(
      () => useMarkdownEditorHost({ docPath: "docs/note.md", workspaceRoot: "/ws", ...props }),
      { wrapper: ({ children }) => <RightPanelProvider>{children}<Probe /></RightPanelProvider> },
    );
  }

  it("openPath：Markdown 在文档面板里打开并带行号；越界 / 不存在时开一个说明失败的标签", async () => {
    const { result } = mountHost();
    overrideBridge({ "workspaces.statFile": async ({ relativePath }: { relativePath: string }) => ({ relativePath, size: 1, mtimeMs: 1 }) });
    act(() => result.current.host.openPath("docs/b.md", 5));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("probe").textContent!)).toMatchObject({ path: "docs/b.md", line: 5, tab: "docs" }));

    overrideBridge({ "workspaces.statFile": async ({ relativePath }: { relativePath: string }) => ({ relativePath, size: 0, mtimeMs: 0, error: "not_found" as const }) });
    act(() => result.current.host.openPath("docs/gone.md"));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("probe").textContent!).tab).toBe("text"));
  });

  it("没有本地工作区（远端会话）：openPath 什么都不做，loadImage 返回 null 且不读盘", async () => {
    const read = vi.fn();
    overrideBridge({ "workspaces.readFile": read, "workspaces.statFile": read });
    const { result } = mountHost({ workspaceRoot: undefined });
    act(() => result.current.host.openPath("docs/b.md", 5));
    expect(await result.current.host.loadImage("a.png")).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(JSON.parse(screen.getByTestId("probe").textContent!).path).toBeNull();
  });

  it("openUrl：window.open 新标签并带 noopener", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { result } = mountHost();
    result.current.host.openUrl("https://example.com/a");
    expect(open).toHaveBeenCalledWith("https://example.com/a", "_blank", "noopener");
    open.mockRestore();
  });

  it("loadImage：取 readFile 的 dataUrl；不是图片、读取失败都返回 null", async () => {
    const { result } = mountHost();
    overrideBridge({ "workspaces.readFile": async ({ relativePath }: { relativePath: string }) => ({ relativePath, renderKind: "image" as const, size: 1, mtimeMs: 1, dataUrl: PNG }) });
    expect(await result.current.host.loadImage("docs/a.png")).toBe(PNG);
    overrideBridge({ "workspaces.readFile": async ({ relativePath }: { relativePath: string }) => ({ relativePath, renderKind: "markdown" as const, size: 1, mtimeMs: 1, content: "x" }) });
    expect(await result.current.host.loadImage("docs/a.md")).toBeNull();
    overrideBridge({ "workspaces.readFile": async ({ relativePath }: { relativePath: string }) => ({ relativePath, renderKind: "image" as const, size: 0, mtimeMs: 0, error: "not_found" as const }) });
    expect(await result.current.host.loadImage("docs/none.png")).toBeNull();
    overrideBridge({ "workspaces.readFile": async () => { throw new Error("ipc"); } });
    expect(await result.current.host.loadImage("docs/boom.png")).toBeNull();
  });

  it("renderMermaid 复用聊天区的渲染器；previewMermaid 打开大图对话框", async () => {
    let host!: ReturnType<typeof useMarkdownEditorHost>["host"];
    function HostView() {
      const hooked = useMarkdownEditorHost({ docPath: "docs/note.md", workspaceRoot: "/ws" });
      host = hooked.host;
      return <>{hooked.previewDialog}</>;
    }
    render(<HostView />, { wrapper });
    const rendered = await host.renderMermaid("flowchart LR\n  A --> B");
    expect(rendered.svg).toContain("<svg");
    act(() => host.previewMermaid?.(rendered));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("宿主对象只随 docPath / workspaceRoot 变化而换，重新渲染不换", () => {
    const { result, rerender } = mountHost();
    const first = result.current.host;
    rerender();
    expect(result.current.host).toBe(first);
  });
});
