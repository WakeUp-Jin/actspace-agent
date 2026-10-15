import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { encodeSessionLocator } from "@actspace/shared/session-locator";
import { TestConversationView } from "./helpers/workbench";
import { TurnReviewView } from "../components/turn-tail/TurnReviewView";
import { collectTurnChanges } from "../components/turn-tail/turn-tail-data";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";
import { setupBridge, type BridgeOverrides } from "./helpers/bridge";

/** 轮尾：改动卡 → 交付卡 → 图片，接在最终回复之后（13 turn-deliverables-cards）。 */

const editMessage: Extract<MessageBlock, { kind: "edit_diff" }> = {
  kind: "edit_diff",
  id: "edit-1",
  filePath: "app.ts",
  outputPath: "/workspace/src/app.ts",
  outputRelativePath: "src/app.ts",
  additions: 1,
  deletions: 1,
  diff: "--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,2 +1,2 @@\n const a = 1;\n-const b = 2;\n+const b = 3;",
  collapsedLines: 0,
  status: "completed",
  createdAt: "2026-10-13T00:00:01.000Z",
};

const presentMessage: Extract<MessageBlock, { kind: "present" }> = {
  kind: "present",
  id: "present-1",
  files: [{ path: "docs/report.md", outputPath: "/workspace/docs/report.md", outputRelativePath: "docs/report.md", description: "季度报告（终稿）" }],
  displayText: "Presented 1 file",
  status: "completed",
  createdAt: "2026-10-13T00:00:02.000Z",
};

function turn(...work: MessageBlock[]): MessageBlock[] {
  return [
    { kind: "user", id: "user-1", content: "Do it", createdAt: "2026-10-13T00:00:00.000Z" },
    ...work,
    { kind: "assistant", id: "assistant-1", content: "已完成。", createdAt: "2026-10-13T00:00:03.000Z" },
  ];
}

function ActiveTabProbe() {
  const { activeTab } = useRightPanel();
  return <div data-testid="active-tab">{activeTab ? `${activeTab.kind}:${activeTab.title}` : ""}</div>;
}

function bridge(overrides: BridgeOverrides = {}, showTurnCodeChanges = true) {
  return setupBridge({
    "settings.getV4": vi.fn(async () => ({ version: 4, revision: "r", settings: { general: { showTurnCodeChanges } } })),
    ...overrides,
  });
}

async function renderTurn(messages: MessageBlock[], props: Record<string, unknown> = {}) {
  await act(async () => {
    render(
      <RightPanelProvider>
        <TestConversationView messages={messages} contextSnapshot={null} sessionId="session-1" selectedWorkspaceRoot="/workspace" isSessionReady={false} {...props} />
        <ActiveTabProbe />
      </RightPanelProvider>,
    );
  });
}

describe("turn tail", () => {
  it("places the changes card and then the deliverables after the final reply", async () => {
    bridge();
    await renderTurn(turn(editMessage, presentMessage));

    const reply = screen.getByText("已完成。");
    const changes = screen.getByRole("button", { name: "查看 src/app.ts 的改动" });
    const deliverable = screen.getByRole("button", { name: "在侧边栏预览 docs/report.md" });
    expect(changes).toHaveTextContent("已编辑 app.ts");
    expect(reply.compareDocumentPosition(changes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(changes.compareDocumentPosition(deliverable) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 描述去掉末尾括注。
    expect(screen.getByText("季度报告")).toBeInTheDocument();
  });

  it("stays hidden while the final reply is still streaming", async () => {
    bridge();
    await renderTurn(turn(editMessage, presentMessage), { isStreaming: true });
    expect(document.querySelector("[data-turn-tail]")).toBeNull();
  });

  it("opens the numbered turn review tab from the changes card", async () => {
    bridge();
    await renderTurn(turn(editMessage));

    await userEvent.click(screen.getByRole("button", { name: "查看 src/app.ts 的改动" }));
    expect(screen.getByTestId("active-tab")).toHaveTextContent("turnReview:第 1 轮改动");
  });

  it("previews a deliverable in the right panel and reports a missing file", async () => {
    const readFile = vi.fn(async () => ({ relativePath: "docs/report.md", renderKind: "markdown" as const, content: "# Report", size: 8 }));
    bridge({ "workspaces.readFile": readFile });
    await renderTurn(turn(presentMessage));

    await userEvent.click(screen.getByRole("button", { name: "在侧边栏预览 docs/report.md" }));
    expect(readFile).toHaveBeenCalledWith({ workspaceRoot: "/workspace", relativePath: "docs/report.md" });
    expect(screen.getByTestId("active-tab")).toHaveTextContent("markdown:report.md");

    readFile.mockResolvedValueOnce({ relativePath: "docs/report.md", renderKind: "text", size: 0, error: "not_found" } as never);
    await userEvent.click(screen.getByRole("button", { name: "在侧边栏预览 docs/report.md" }));
    expect(await screen.findByText("文件不存在或已被移动。")).toBeInTheDocument();
  });

  it("folds more than four deliverables behind a toggle", async () => {
    bridge();
    const files = ["a", "b", "c", "d", "e"].map((name) => ({ path: `out/${name}.md`, outputRelativePath: `out/${name}.md` }));
    await renderTurn(turn({ ...presentMessage, files }));

    expect(document.querySelectorAll("[data-presented-file]")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "展开全部 5 个交付文件" }));
    expect(document.querySelectorAll("[data-presented-file]")).toHaveLength(5);
  });

  it("opens a deliverable with the default app or reveals it, and reports the request", async () => {
    const openFile = vi.fn(async () => ({ ok: true }));
    bridge({ "workspaces.openFile": openFile });
    await renderTurn(turn(presentMessage));

    await userEvent.click(screen.getByRole("button", { name: "用默认应用打开" }));
    expect(openFile).toHaveBeenCalledWith({ workspaceRoot: "/workspace", relativePath: "docs/report.md", action: "open" });
    expect(await screen.findByText("已请求打开")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "更多打开方式" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "显示文件位置" }));
    expect(openFile).toHaveBeenLastCalledWith({ workspaceRoot: "/workspace", relativePath: "docs/report.md", action: "reveal" });
    expect(await screen.findByText("已请求在文件管理器中显示")).toBeInTheDocument();
  });

  it("asks main for the file context menu on right click", async () => {
    const showArtifactContextMenu = vi.fn(async () => ({ shown: true }));
    bridge({ "dialogs.showArtifactContextMenu": showArtifactContextMenu });
    await renderTurn(turn(editMessage, presentMessage));

    fireEvent.contextMenu(screen.getByRole("button", { name: "查看 src/app.ts 的改动" }));
    fireEvent.contextMenu(screen.getByRole("button", { name: "在侧边栏预览 docs/report.md" }));
    await vi.waitFor(() => expect(showArtifactContextMenu).toHaveBeenCalledTimes(2));
    expect(showArtifactContextMenu).toHaveBeenNthCalledWith(1, { kind: "workspace_file", workspaceRoot: "/workspace", relativePath: "src/app.ts" });
    expect(showArtifactContextMenu).toHaveBeenNthCalledWith(2, { kind: "workspace_file", workspaceRoot: "/workspace", relativePath: "docs/report.md" });
  });

  it("previews and downloads through the Host for remote sessions, without native open buttons", async () => {
    const call = vi.fn(async () => ({ id: "artifact-1" }));
    const preview = vi.fn(async () => ({ name: "report.md", size: 8, text: "# Report" }));
    const download = vi.fn(async () => undefined);
    const readFile = vi.fn();
    const showArtifactContextMenu = vi.fn();
    bridge({ "hosts.call": call, "hosts.preview": preview, "hosts.download": download, "workspaces.readFile": readFile, "dialogs.showArtifactContextMenu": showArtifactContextMenu });
    await renderTurn(turn(presentMessage), {
      sessionId: encodeSessionLocator({ hostId: "server", sessionId: "remote-1" }),
      runTarget: { kind: "remote", hostId: "server", hostName: "Cloud" },
    });

    const card = screen.getByRole("button", { name: "在侧边栏预览 docs/report.md" });
    expect(document.querySelector("[data-open-with]")).toBeNull();
    await userEvent.click(card);
    expect(preview).toHaveBeenCalledWith({ hostId: "server", sessionId: "remote-1", artifactId: "artifact-1" });
    expect(screen.getByTestId("active-tab")).toHaveTextContent("text:report.md");
    fireEvent.contextMenu(card);
    await vi.waitFor(() => expect(download).toHaveBeenCalledWith({ hostId: "server", sessionId: "remote-1", artifactId: "artifact-1" }));
    expect(readFile).not.toHaveBeenCalled();
    expect(showArtifactContextMenu).not.toHaveBeenCalled();
  });

  it("hides only the changes card when 显示本轮代码改动 is off, and follows the setting live", async () => {
    let enabled = false;
    let changed = () => {};
    bridge({
      "settings.getV4": vi.fn(async () => ({ version: 4, revision: "r", settings: { general: { showTurnCodeChanges: enabled } } })),
      "events.settingsChanged": vi.fn((callback) => { changed = callback; return () => {}; }),
    });
    await renderTurn(turn(editMessage, presentMessage));

    expect(screen.queryByRole("button", { name: "查看 src/app.ts 的改动" })).toBeNull();
    const tail = document.querySelector<HTMLElement>("[data-turn-tail]")!;
    expect(within(tail).getByRole("button", { name: "在侧边栏预览 docs/report.md" })).toBeInTheDocument();

    enabled = true;
    await act(async () => { changed(); });
    expect(await screen.findByRole("button", { name: "查看 src/app.ts 的改动" })).toBeInTheDocument();
  });
});

describe("turn review tab", () => {
  const second: Extract<MessageBlock, { kind: "edit_diff" }> = {
    ...editMessage, id: "edit-2", filePath: "util.ts", outputPath: "/workspace/src/util.ts", outputRelativePath: "src/util.ts",
    diff: "--- a/src/util.ts\n+++ b/src/util.ts\n@@ -1,1 +1,2 @@\n export {};\n+export const x = 1;", additions: 1, deletions: 0,
  };
  const changes = collectTurnChanges([editMessage, second])!;
  const tab = { id: "turn-review:s:t", kind: "turnReview" as const, title: "第 1 轮改动", changes, index: 1, revision: 1, sessionId: "session-1", workspaceRoot: "/workspace" };

  it("selects the clicked file, toggles split and wrap, and opens the whole file", async () => {
    const readFile = vi.fn(async () => ({ relativePath: "src/util.ts", renderKind: "text" as const, content: "export {};", size: 10 }));
    bridge({ "workspaces.readFile": readFile });
    render(<RightPanelProvider><TurnReviewView tab={tab} /><ActiveTabProbe /></RightPanelProvider>);

    expect(document.querySelector("[data-review-file]")).toHaveAttribute("data-review-file", "src/util.ts");
    // 纯新增的文件即使开着左右对比也只有一栏。
    expect(screen.getByRole("button", { name: "左右对比" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".turn-diff-body")).toHaveAttribute("data-view", "unified");

    await userEvent.click(screen.getByRole("button", { name: "选择要查看的文件" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: /src\/app\.ts/ }));
    expect(document.querySelector("[data-review-file]")).toHaveAttribute("data-review-file", "src/app.ts");
    expect(document.querySelector(".turn-diff-body")).toHaveAttribute("data-view", "split");
    await userEvent.click(screen.getByRole("button", { name: "左右对比" }));
    expect(document.querySelector(".turn-diff-body")).toHaveAttribute("data-view", "unified");
    await userEvent.click(screen.getByRole("button", { name: "自动换行" }));
    expect(document.querySelector(".turn-diff-body")).toHaveAttribute("data-wrap", "true");

    await userEvent.click(screen.getByRole("button", { name: "在侧边栏打开 src/app.ts" }));
    expect(readFile).toHaveBeenCalledWith({ workspaceRoot: "/workspace", relativePath: "src/app.ts" });
  });
});
