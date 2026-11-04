import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { undoDepth } from "@codemirror/commands";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RightPanel } from "../components/RightPanel";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";
import { resetMockDocs } from "../mock/docs-fixture";
import { resetDocsDraftStoreForTests } from "../components/right-panel/docs/docs-draft-store";
import { getDocument } from "../components/markdown-editor/core";
import { overrideBridge, setupBridge } from "./helpers/bridge";
import { findEditorView, polyfillLayout, pressKey, typeInto, typeSynced } from "./markdown-editor-helpers";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg></svg>", diagramType: "flowchart-v2" })) } }));

const README = "docs/design-docs/自进化的方案设计/README.md";

function OpenDocs({ select }: { select?: string }) {
  const { openTab } = useRightPanel();
  return (
    <button type="button" onClick={() => openTab({ id: "docs", kind: "docs", title: "文档", select })}>
      probe-open-docs
    </button>
  );
}

async function renderDocs({ workspaceRoot = "/ws", edited, select }: { workspaceRoot?: string | null; edited?: string[]; select?: string } = {}) {
  const view = render(
    <TooltipProvider delayDuration={0}>
      <RightPanelProvider initialOpen initialTabs={[{ id: "docs", kind: "docs", title: "文档" }]}>
        <OpenDocs select={select} />
        <RightPanel workspaceRoot={workspaceRoot ?? undefined} agentEditedPaths={edited} />
      </RightPanelProvider>
    </TooltipProvider>,
  );
  // 「选中某篇」是一次性请求，经 openTab 带进来（和交付卡打开 Markdown 走同一条路）。
  if (select) await userEvent.click(screen.getByRole("button", { name: "probe-open-docs" }));
  return view;
}

const tree = () => screen.getByRole("tree", { name: "Markdown 文档" });
const file = (name: string) => within(tree()).getByRole("treeitem", { name: new RegExp(name) });

/** 等编辑器（懒加载的 chunk）挂上并带着这份内容。 */
async function editorWith(text: string) {
  await waitFor(() => expect(getDocument(findEditorView())).toContain(text));
  return findEditorView();
}

const dirtyDot = () => screen.queryByRole("img", { name: "有未保存的改动" });

beforeEach(() => {
  polyfillLayout();
  resetMockDocs();
  resetDocsDraftStoreForTests();
  setupBridge();
});

describe("文档面板", () => {
  it("没选文档时给出提示，树里只有 Markdown，文件夹显示篇数", async () => {
    await renderDocs();
    expect(await screen.findByText("从右侧选择一篇文档")).toBeInTheDocument();
    expect(await within(tree()).findByRole("treeitem", { name: /AGENTS\.md/ })).toBeInTheDocument();
    const docsDir = within(tree()).getByRole("treeitem", { name: /^docs/ });
    expect(docsDir).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("绿点 = 本会话 Agent 写过或改过")).toBeInTheDocument();
  });

  it("没有工作区、没有 Markdown 时各有空状态", async () => {
    const { unmount } = await renderDocs({ workspaceRoot: null });
    expect(screen.getByText("请先在顶部选择工作区。")).toBeInTheDocument();
    expect(screen.queryByRole("tree")).toBeNull();
    unmount();

    setupBridge({ "workspaces.listMarkdownFiles": async () => ({ ok: true, files: [], truncated: false, source: "git" }) });
    await renderDocs();
    expect(await screen.findByText("这个工作区还没有 Markdown 文档")).toBeInTheDocument();
  });

  it("点文件默认预览；切源码仍是同一个编辑器，未保存圆点出现，改动保留在预览里", async () => {
    const user = userEvent.setup();
    await renderDocs();
    await user.click(await within(tree()).findByRole("treeitem", { name: /AGENTS\.md/ }));
    const view = await editorWith("AGENTS");
    expect(view.dom).toHaveClass("cm-md-preview");
    // 预览里标题的 `#` 被隐藏，只剩文字，并按标题排版
    expect(view.dom.querySelector(".md-h1")).toHaveTextContent("AGENTS");
    expect(view.dom.textContent).not.toContain("# AGENTS");
    expect(dirtyDot()).toBeNull();

    await user.click(screen.getByRole("tab", { name: "源码" }));
    expect(findEditorView()).toBe(view);
    expect(view.dom).toHaveClass("cm-md-source");
    expect(view.dom.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(view.dom.textContent).toContain("# AGENTS");
    await typeSynced(view, "新增的一行");
    await waitFor(() => expect(dirtyDot()).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "预览" }));
    expect(findEditorView()).toBe(view);
    expect(view.dom).toHaveClass("cm-md-preview");
    expect(view.dom.querySelector(".cm-lineNumbers")).toBeNull();
    expect(view.dom).toHaveTextContent("新增的一行");
  });

  it("切换预览 / 源码保留光标和撤销历史，焦点留在编辑器里", async () => {
    const user = userEvent.setup();
    await renderDocs({ select: "AGENTS.md" });
    const view = await editorWith("AGENTS");
    await typeSynced(view, "甲");
    await typeSynced(view, "乙");
    view.dispatch({ selection: { anchor: 3 } });
    const depth = undoDepth(view.state);
    expect(depth).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: "源码" }));
    expect(findEditorView()).toBe(view);
    expect(view.state.selection.main.head).toBe(3);
    expect(undoDepth(view.state)).toBe(depth);
    expect(document.activeElement).toBe(view.contentDOM);

    await user.click(screen.getByRole("tab", { name: "预览" }));
    expect(view.state.selection.main.head).toBe(3);
    expect(undoDepth(view.state)).toBe(depth);
    expect(document.activeElement).toBe(view.contentDOM);
  });

  it("编辑后切换工作区再切回：草稿和未保存圆点恢复，不写盘", async () => {
    const user = userEvent.setup();
    const write = vi.fn(async (input: { content: string }) => ({ ok: true as const, mtimeMs: 2000, size: input.content.length }));
    overrideBridge({ "workspaces.writeMarkdownFile": write });
    const view = await renderDocs();
    await user.click(await within(tree()).findByRole("treeitem", { name: /AGENTS\.md/ }));
    await typeSynced(await editorWith("AGENTS"), "草稿内容");
    await waitFor(() => expect(dirtyDot()).toBeInTheDocument());

    // 同一个 Provider 下换根：用同一棵树的 props 变化，而不是重新挂载。
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <RightPanelProvider initialOpen initialTabs={[{ id: "docs", kind: "docs", title: "文档" }]}>
          <OpenDocs />
          <RightPanel workspaceRoot="/other" />
        </RightPanelProvider>
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.queryByRole("img", { name: "有未保存的改动" })).toBeNull());

    view.rerender(
      <TooltipProvider delayDuration={0}>
        <RightPanelProvider initialOpen initialTabs={[{ id: "docs", kind: "docs", title: "文档" }]}>
          <OpenDocs />
          <RightPanel workspaceRoot="/ws" />
        </RightPanelProvider>
      </TooltipProvider>,
    );
    expect(await screen.findByRole("img", { name: "有未保存的改动" })).toBeInTheDocument();
    await editorWith("草稿内容");
    expect(write).not.toHaveBeenCalled();
  });

  it("⌘S 保存调用 writeMarkdownFile，保存后圆点消失", async () => {
    const user = userEvent.setup();
    const write = vi.fn(async (input: { content: string }) => ({ ok: true as const, mtimeMs: 2000, size: input.content.length }));
    overrideBridge({ "workspaces.writeMarkdownFile": write });
    await renderDocs();
    await user.click(await within(tree()).findByRole("treeitem", { name: /AGENTS\.md/ }));
    const view = await editorWith("AGENTS");
    await user.click(screen.getByRole("tab", { name: "源码" }));
    await typeSynced(view, "X");
    await waitFor(() => expect(dirtyDot()).toBeInTheDocument());
    let event!: KeyboardEvent;
    await act(async () => { event = pressKey(view, { key: "s", keyCode: 83, ctrlKey: true }); });
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "/ws", relativePath: "AGENTS.md", content: expect.stringContaining("X") }));
    await waitFor(() => expect(dirtyDot()).toBeNull());
  });

  it("输入后立刻 ⌘S（草稿还没渲染出来）也保存最新内容", async () => {
    const write = vi.fn(async (input: { content: string }) => ({ ok: true as const, mtimeMs: 2000, size: input.content.length }));
    overrideBridge({ "workspaces.writeMarkdownFile": write });
    await renderDocs({ select: "AGENTS.md" });
    const view = await editorWith("AGENTS");
    // 输入和 ⌘S 在同一个任务里：这时 onChange 的帧还没到，保存前要先把它补发出去。
    await act(async () => {
      typeInto(view, "紧跟的输入");
      pressKey(view, { key: "s", keyCode: 83, ctrlKey: true });
    });
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0][0].content).toContain("紧跟的输入");
  });

  it("有未保存内容时切换文档会先询问：取消留在原地，不保存则切走", async () => {
    const user = userEvent.setup();
    await renderDocs();
    await user.click(await within(tree()).findByRole("treeitem", { name: /AGENTS\.md/ }));
    await typeSynced(await editorWith("AGENTS"), "Y");
    await waitFor(() => expect(dirtyDot()).toBeInTheDocument());

    await user.click(file("CLAUDE\\.md"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("AGENTS.md");
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(file("AGENTS\\.md")).toHaveAttribute("aria-selected", "true");

    await user.click(file("CLAUDE\\.md"));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "不保存" }));
    await waitFor(() => expect(file("CLAUDE\\.md")).toHaveAttribute("aria-selected", "true"));
  });

  it("保存并离开：先写盘再切换", async () => {
    const user = userEvent.setup();
    const write = vi.fn(async (input: { content: string }) => ({ ok: true as const, mtimeMs: 2000, size: input.content.length }));
    overrideBridge({ "workspaces.writeMarkdownFile": write });
    await renderDocs();
    await user.click(await within(tree()).findByRole("treeitem", { name: /AGENTS\.md/ }));
    await typeSynced(await editorWith("AGENTS"), "Z");
    await waitFor(() => expect(dirtyDot()).toBeInTheDocument());
    await user.click(file("CLAUDE\\.md"));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(file("CLAUDE\\.md")).toHaveAttribute("aria-selected", "true"));
  });

  it("读取被截断的文件在预览和源码两种模式下都只读，并提示用默认应用编辑", async () => {
    const user = userEvent.setup();
    overrideBridge({
      "workspaces.readFile": async ({ relativePath }: { relativePath: string }) => ({
        relativePath, renderKind: "markdown" as const, size: 9_000_000, mtimeMs: 1, content: "# 很大\n", truncated: true,
      }),
    });
    await renderDocs();
    await user.click(await within(tree()).findByRole("treeitem", { name: /AGENTS\.md/ }));
    expect(await screen.findByText(/文件过大，请用默认应用编辑/)).toBeInTheDocument();
    const view = await editorWith("很大");
    for (const tab of [null, "源码", "预览"]) {
      if (tab) await user.click(screen.getByRole("tab", { name: tab }));
      expect(view.state.readOnly).toBe(true);
      await typeSynced(view, "abc");
      expect(getDocument(view)).toBe("# 很大\n");
    }
    expect(dirtyDot()).toBeNull();
  });

  it("绿点只出现在本会话改过的文件上，「本会话改过」筛选展开祖先文件夹", async () => {
    const user = userEvent.setup();
    await renderDocs({ edited: ["/ws/README.md", `/ws/${README}`, "/ws/src/app.ts", "/elsewhere/x.md"] });
    await within(tree()).findByRole("treeitem", { name: /AGENTS\.md/ });
    expect(within(file("README\\.md")).getByRole("img", { name: "本会话改过" })).toBeInTheDocument();
    expect(within(file("AGENTS\\.md")).queryByRole("img", { name: "本会话改过" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "本会话改过" }));
    const items = within(tree()).getAllByRole("treeitem");
    // 只剩根 README、以及两层文件夹里的 README，其他文件被筛掉。
    expect(within(tree()).queryByRole("treeitem", { name: /AGENTS\.md/ })).toBeNull();
    expect(items.filter((item) => item.textContent?.includes("README.md"))).toHaveLength(2);
  });

  it("搜索只匹配文件名，命中项的祖先文件夹自动展开", async () => {
    const user = userEvent.setup();
    await renderDocs();
    await within(tree()).findByRole("treeitem", { name: /AGENTS\.md/ });
    await user.type(screen.getByRole("textbox", { name: "搜索文档文件名" }), "Harness统计");
    const hit = within(tree()).getByRole("treeitem", { name: /11-\s*Harness统计\s*设计\.md/ });
    expect(hit.querySelector("mark")).not.toBeNull();
    expect(within(tree()).queryByRole("treeitem", { name: /AGENTS\.md/ })).toBeNull();
    await user.clear(screen.getByRole("textbox", { name: "搜索文档文件名" }));
    await user.type(screen.getByRole("textbox", { name: "搜索文档文件名" }), "不存在的名字");
    expect(await screen.findByText("没有匹配的文档")).toBeInTheDocument();
  });

  it("从交付卡打开 Markdown：选中并展开到该文件", async () => {
    await renderDocs({ select: README });
    const item = await within(tree()).findByRole("treeitem", { name: /^README\.md/ , selected: true });
    expect(item).toBeInTheDocument();
    await editorWith("Harness 自进化方案设计");
    expect(findEditorView().dom.querySelector(".md-h1")).toHaveTextContent("Harness 自进化方案设计");
  });

  it("已经打开的文档再从链接打开一次：重新读出正文，不停在加载中", async () => {
    await renderDocs({ select: README });
    await editorWith("Harness 自进化方案设计");
    await userEvent.click(screen.getByRole("button", { name: "probe-open-docs" }));
    await editorWith("Harness 自进化方案设计");
    expect(screen.queryByLabelText("正在读取文档")).toBeNull();
  });

  it("大纲列出 h2/h3（代码块里的 # 不算），点击后平滑滚动到对应标题；预览和源码两种模式都可用", async () => {
    const user = userEvent.setup();
    await renderDocs({ select: README });
    const view = await editorWith("Harness 自进化方案设计");
    const scrollTo = vi.fn();
    view.scrollDOM.scrollTo = scrollTo as unknown as typeof view.scrollDOM.scrollTo;

    await user.click(screen.getByRole("button", { name: "大纲" }));
    const popover = await screen.findByLabelText("本页大纲");
    expect(within(popover).getAllByRole("button").map((button) => button.textContent)).toEqual(["当前状态", "进化流程", "触发条件", "插件声明示例", "待办"]);
    await user.click(within(popover).getByRole("button", { name: "触发条件" }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    await waitFor(() => expect(screen.queryByLabelText("本页大纲")).toBeNull());

    await user.click(screen.getByRole("tab", { name: "源码" }));
    expect(screen.getByRole("button", { name: "大纲" })).toBeEnabled();
    scrollTo.mockClear();
    await user.click(screen.getByRole("button", { name: "大纲" }));
    await user.click(await screen.findByRole("button", { name: "当前状态" }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("大纲打开期间随输入更新", async () => {
    const user = userEvent.setup();
    await renderDocs({ select: README });
    const view = await editorWith("Harness 自进化方案设计");
    await user.click(screen.getByRole("button", { name: "大纲" }));
    const popover = await screen.findByLabelText("本页大纲");
    expect(within(popover).queryByRole("button", { name: "新加的章节" })).toBeNull();
    await typeSynced(view, "\n\n## 新加的章节\n");
    expect(await within(popover).findByRole("button", { name: "新加的章节" })).toBeInTheDocument();
  });

  it("没有标题的文档，大纲显示「没有标题」", async () => {
    const user = userEvent.setup();
    overrideBridge({
      "workspaces.readFile": async ({ relativePath }: { relativePath: string }) => ({
        relativePath, renderKind: "markdown" as const, size: 5, mtimeMs: 1, content: "只有正文。",
      }),
    });
    await renderDocs({ select: "AGENTS.md" });
    await editorWith("只有正文。");
    await user.click(screen.getByRole("button", { name: "大纲" }));
    expect(await screen.findByText("没有标题")).toBeInTheDocument();
  });

  it("磁盘上的文件变了：窗口聚焦后出现「重新加载」，点击后整份换成新内容并清空撤销历史", async () => {
    const user = userEvent.setup();
    await renderDocs({ select: "AGENTS.md" });
    const before = await editorWith("AGENTS");
    await typeSynced(before, "改动");
    expect(undoDepth(before.state)).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "重新加载" })).toBeNull();

    overrideBridge({
      "workspaces.statFile": async ({ relativePath }: { relativePath: string }) => ({ relativePath, size: 12, mtimeMs: 9_999_999_999_999 }),
      "workspaces.readFile": async ({ relativePath }: { relativePath: string }) => ({
        relativePath, renderKind: "markdown" as const, size: 12, mtimeMs: 9_999_999_999_999, content: "# 磁盘新内容",
      }),
    });
    act(() => { window.dispatchEvent(new Event("focus")); });
    await user.click(await screen.findByRole("button", { name: "重新加载" }));
    const after = await editorWith("磁盘新内容");
    expect(getDocument(after)).toBe("# 磁盘新内容");
    expect(undoDepth(after.state)).toBe(0);
    expect(dirtyDot()).toBeNull();
    expect(screen.queryByRole("button", { name: "重新加载" })).toBeNull();
  });

  it("换一篇文档：内容整份换掉，上一篇的撤销历史不带过来", async () => {
    const user = userEvent.setup();
    await renderDocs({ select: "AGENTS.md" });
    const first = await editorWith("AGENTS");
    await typeSynced(first, "第一篇的输入");
    await waitFor(() => expect(dirtyDot()).toBeInTheDocument());
    await user.click(file("CLAUDE\\.md"));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "不保存" }));
    const second = await editorWith("CLAUDE");
    expect(getDocument(second)).not.toContain("第一篇的输入");
    expect(undoDepth(second.state)).toBe(0);
    expect(dirtyDot()).toBeNull();
  });

  it("收起文件树后正文占满，展开按钮可以恢复", async () => {
    const user = userEvent.setup();
    await renderDocs();
    await within(tree()).findByRole("treeitem", { name: /AGENTS\.md/ });
    await user.click(screen.getByRole("button", { name: "收起文件树" }));
    expect(screen.queryByRole("tree")).toBeNull();
    await user.click(screen.getByRole("button", { name: "展开文件树" }));
    expect(screen.getByRole("tree", { name: "Markdown 文档" })).toBeInTheDocument();
  });
});
