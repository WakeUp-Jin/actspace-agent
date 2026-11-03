import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RightPanel } from "../components/RightPanel";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";
import { resetDocsDraftStoreForTests } from "../components/right-panel/docs/docs-draft-store";
import { TooltipProvider } from "../components/ui/Tooltip";
import { resetMockDocs } from "../mock/docs-fixture";
import { overrideBridge, setupBridge } from "./helpers/bridge";
import { findEditorView, polyfillLayout, typeSynced } from "./markdown-editor-helpers";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg></svg>", diagramType: "flowchart-v2" })) } }));

/** 文档第 N 行的内容就是「第 N 行」，一共 30 行。 */
const LINES = Array.from({ length: 30 }, (_, index) => `第 ${index + 1} 行`);
const NOTE = "docs/note.md";

function Probe({ path, line }: { path: string; line?: number }) {
  const { openTab, docsPendingLine } = useRightPanel();
  return (
    <>
      <button type="button" onClick={() => openTab({ id: "docs", kind: "docs", title: "文档", select: path, line })}>probe-open</button>
      <output data-testid="pending-line">{docsPendingLine ? `${docsPendingLine.path}:${docsPendingLine.line}` : "none"}</output>
    </>
  );
}

async function openDocs(path: string, line?: number) {
  const view = render(
    <TooltipProvider delayDuration={0}>
      <RightPanelProvider initialOpen initialTabs={[{ id: "docs", kind: "docs", title: "文档" }]}>
        <Probe path={path} line={line} />
        <RightPanel workspaceRoot="/ws" />
      </RightPanelProvider>
    </TooltipProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "probe-open" }));
  return view;
}

const selectedText = () => {
  const view = findEditorView();
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
};

beforeEach(() => {
  polyfillLayout();
  resetMockDocs();
  resetDocsDraftStoreForTests();
  setupBridge({
    "workspaces.readFile": async ({ relativePath }: { relativePath: string }) => ({
      relativePath, renderKind: "markdown" as const, size: 100, mtimeMs: 1, content: LINES.join("\n"),
    }),
    "workspaces.statFile": async ({ relativePath }: { relativePath: string }) => ({ relativePath, size: 100, mtimeMs: 1 }),
    "workspaces.listMarkdownFiles": async () => ({ ok: true, files: [NOTE], truncated: false, source: "git" }),
  });
});

describe("文档面板：带行号打开", () => {
  it("打开 a.md:12：文档读完后第 12 行被选中，请求随即清掉", async () => {
    await openDocs(NOTE, 12);
    await waitFor(() => expect(selectedText()).toBe("第 12 行"));
    const view = findEditorView();
    expect(view.state.doc.lineAt(view.state.selection.main.from).text).toBe("第 12 行");
    await waitFor(() => expect(screen.getByTestId("pending-line")).toHaveTextContent("none"));
  });

  it("没有 line：行为不变，光标在开头，没有待处理的行号", async () => {
    await openDocs(NOTE);
    const view = await waitFor(() => findEditorView());
    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.selection.main.head).toBe(0);
    expect(screen.getByTestId("pending-line")).toHaveTextContent("none");
  });

  it("行号超出文档：取最后一行；非法行号当没有", async () => {
    await openDocs(NOTE, 9999);
    await waitFor(() => expect(selectedText()).toBe("第 30 行"));
  });

  it("非法行号（0、负数）忽略", async () => {
    await openDocs(NOTE, 0);
    const view = await waitFor(() => findEditorView());
    expect(view.state.selection.main.empty).toBe(true);
    expect(screen.getByTestId("pending-line")).toHaveTextContent("none");
  });

  it("同一篇再次带行号打开：重新读出并再次选中那一行", async () => {
    await openDocs(NOTE, 5);
    await waitFor(() => expect(selectedText()).toBe("第 5 行"));
    findEditorView().dispatch({ selection: { anchor: 0 } });
    await userEvent.click(screen.getByRole("button", { name: "probe-open" }));
    await waitFor(() => expect(selectedText()).toBe("第 5 行"));
  });

  it("有未保存草稿时再带行号打开同一篇：不弹确认、不重读、草稿保留，只滚到那一行", async () => {
    const reads = vi.fn(async ({ relativePath }: { relativePath: string }) => ({
      relativePath, renderKind: "markdown" as const, size: 100, mtimeMs: 1, content: LINES.join("\n"),
    }));
    overrideBridge({ "workspaces.readFile": reads });
    await openDocs(NOTE, 3);
    await waitFor(() => expect(selectedText()).toBe("第 3 行"));
    const view = findEditorView();
    await typeSynced(view, "未保存的尾巴");
    await waitFor(() => expect(screen.getByRole("img", { name: "有未保存的改动" })).toBeInTheDocument());
    const readCount = reads.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "probe-open" }));
    await waitFor(() => expect(selectedText()).toBe("第 3 行"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(reads.mock.calls.length).toBe(readCount);
    expect(findEditorView()).toBe(view);
    expect(view.state.doc.toString()).toContain("未保存的尾巴");
  });

  it("换到别的文档时，上一篇没消费的行号不会带过去", async () => {
    // 读取失败的文档不会挂编辑器，行号请求留在 context 里；从树里选另一篇（不带行号）会把它清掉。
    overrideBridge({
      "workspaces.listMarkdownFiles": async () => ({ ok: true, files: [NOTE, "docs/other.md"], truncated: false, source: "git" }),
      "workspaces.readFile": async ({ relativePath }: { relativePath: string }) =>
        relativePath === NOTE
          ? { relativePath, renderKind: "markdown" as const, size: 1, mtimeMs: 1, error: "not_found" as const }
          : { relativePath, renderKind: "markdown" as const, size: 100, mtimeMs: 1, content: LINES.join("\n") },
    });
    await openDocs(NOTE, 12);
    await screen.findByRole("alert");
    expect(screen.getByTestId("pending-line")).toHaveTextContent(`${NOTE}:12`);

    await userEvent.click(await screen.findByRole("treeitem", { name: /other\.md/ }));
    await waitFor(() => expect(findEditorView().state.doc.toString()).toContain("第 30 行"));
    expect(findEditorView().state.selection.main.empty).toBe(true);
    expect(screen.getByTestId("pending-line")).toHaveTextContent("none");
  });
});
