import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceListDirInput, WorkspaceListDirResult, WorkspaceOpenFileInput, WorkspaceOpenFileResult, WorkspaceReadFileResult } from "@actspace/shared";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";
import { WorkspaceFileTree } from "../components/right-panel/WorkspaceFileTree";
import { setupBridge } from "./helpers/bridge";

afterEach(() => {
  vi.restoreAllMocks();
});

/** 暴露当前激活 Tab 给断言：`kind|language|title`。 */
function ActiveTabProbe() {
  const { activeTab } = useRightPanel();
  const language = activeTab && "language" in activeTab ? (activeTab.language ?? "") : "";
  return <div data-testid="active-tab">{activeTab ? `${activeTab.kind}|${language}|${activeTab.title}` : "none"}</div>;
}

function renderTree(workspaceRoot?: string) {
  return render(
    <RightPanelProvider>
      <WorkspaceFileTree workspaceRoot={workspaceRoot} />
      <ActiveTabProbe />
    </RightPanelProvider>,
  );
}

function installBridge(overrides: {
  listWorkspaceDir?: (input: WorkspaceListDirInput) => Promise<WorkspaceListDirResult>;
  readWorkspaceFile?: () => Promise<WorkspaceReadFileResult>;
  openWorkspaceFile?: (input: WorkspaceOpenFileInput) => Promise<WorkspaceOpenFileResult>;
}) {
  setupBridge({
    "workspaces.listDir": overrides.listWorkspaceDir ?? (async () => ({ root: "/ws", relativePath: "", entries: [] })),
    "workspaces.readFile":
      overrides.readWorkspaceFile ?? (async () => ({ relativePath: "", renderKind: "text", size: 0, mtimeMs: 0, content: "" })),
    "workspaces.openFile": overrides.openWorkspaceFile ?? (async () => ({ ok: true })),
  });
}

describe("WorkspaceFileTree", () => {
  it("discards an old root's pending file read and loads the new root's own directory", async () => {
    let finishRead!: (result: WorkspaceReadFileResult) => void;
    const pending = new Promise<WorkspaceReadFileResult>((resolve) => { finishRead = resolve; });
    const listWorkspaceDir = vi.fn(async (input: WorkspaceListDirInput): Promise<WorkspaceListDirResult> => ({
      root: input.workspaceRoot!, relativePath: "",
      entries: [{ name: input.workspaceRoot === "/a" ? "old.txt" : "new.txt", relativePath: "same.txt", kind: "file" }],
    }));
    installBridge({ listWorkspaceDir, readWorkspaceFile: () => pending });
    const view = (root: string) => <RightPanelProvider><WorkspaceFileTree workspaceRoot={root} /><ActiveTabProbe /></RightPanelProvider>;
    const rendered = render(view("/a"));
    await userEvent.click(await screen.findByText("old.txt"));
    rendered.rerender(view("/b"));
    expect(await screen.findByText("new.txt")).toBeInTheDocument();
    expect(screen.queryByText("old.txt")).not.toBeInTheDocument();
    await act(async () => { finishRead({ relativePath: "same.txt", renderKind: "text", size: 1, mtimeMs: 1, content: "old" }); });
    expect(screen.getByTestId("active-tab")).toHaveTextContent("none");
    expect(listWorkspaceDir).toHaveBeenCalledWith({ workspaceRoot: "/b", relativePath: "" });
  });

  it("lists root entries and lazily loads a directory's children on expand", async () => {
    const listWorkspaceDir = vi.fn(async (input: WorkspaceListDirInput): Promise<WorkspaceListDirResult> => {
      if (!input.relativePath) {
        return {
          root: "/ws",
          relativePath: "",
          entries: [
            { name: "src", relativePath: "src", kind: "dir" },
            { name: "readme.md", relativePath: "readme.md", kind: "file", size: 12 },
          ],
        };
      }
      return {
        root: "/ws",
        relativePath: input.relativePath,
        entries: [{ name: "index.ts", relativePath: "src/index.ts", kind: "file", size: 20 }],
      };
    });
    installBridge({ listWorkspaceDir });

    renderTree("/ws");

    expect(await screen.findByText("src")).toBeInTheDocument();
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    // 初次只加载根目录。
    expect(listWorkspaceDir).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByText("src"));

    // 展开目录懒加载其子项。
    expect(await screen.findByText("index.ts")).toBeInTheDocument();
    expect(listWorkspaceDir).toHaveBeenCalledTimes(2);
    expect(listWorkspaceDir).toHaveBeenLastCalledWith({ workspaceRoot: "/ws", relativePath: "src" });
  });

  it("opens a code file as a text tab carrying the inferred language", async () => {
    const readWorkspaceFile = vi.fn(
      async (): Promise<WorkspaceReadFileResult> => ({
        relativePath: "main.ts",
        renderKind: "text",
        size: 18,
        mtimeMs: 1_700_000_000_000,
        content: "export const x = 1;",
        language: "typescript",
      }),
    );
    installBridge({
      listWorkspaceDir: async () => ({
        root: "/ws",
        relativePath: "",
        entries: [{ name: "main.ts", relativePath: "main.ts", kind: "file", size: 18 }],
      }),
      readWorkspaceFile,
    });

    renderTree("/ws-selected");

    await userEvent.click(await screen.findByText("main.ts"));

    await waitFor(() => {
      expect(screen.getByTestId("active-tab")).toHaveTextContent("text|typescript|main.ts");
    });
    expect(readWorkspaceFile).toHaveBeenCalledWith({ workspaceRoot: "/ws-selected", relativePath: "main.ts" });
  });

  it("opens an HTML file in the system browser instead of rendering it in the panel", async () => {
    const readWorkspaceFile = vi.fn(async (): Promise<WorkspaceReadFileResult> => ({ relativePath: "report.html", renderKind: "html", size: 10, mtimeMs: 0, content: "<p>x</p>" }));
    const openWorkspaceFile = vi.fn(async (): Promise<WorkspaceOpenFileResult> => ({ ok: true }));
    installBridge({
      listWorkspaceDir: async () => ({ root: "/ws", relativePath: "", entries: [{ name: "report.html", relativePath: "report.html", kind: "file", size: 10 }] }),
      readWorkspaceFile,
      openWorkspaceFile,
    });

    renderTree("/ws");
    await userEvent.click(await screen.findByText("report.html"));

    await waitFor(() => expect(openWorkspaceFile).toHaveBeenCalledWith({ workspaceRoot: "/ws", relativePath: "report.html", action: "open" }));
    expect(readWorkspaceFile).not.toHaveBeenCalled();
    expect(screen.getByTestId("active-tab")).toHaveTextContent("none");
  });

  it("explains in a tab when the browser cannot open the HTML file", async () => {
    installBridge({
      listWorkspaceDir: async () => ({ root: "/ws", relativePath: "", entries: [{ name: "report.htm", relativePath: "report.htm", kind: "file", size: 10 }] }),
      openWorkspaceFile: async () => ({ ok: false, error: "open_failed", message: "no app" }),
    });

    renderTree("/ws");
    await userEvent.click(await screen.findByText("report.htm"));

    await waitFor(() => expect(screen.getByTestId("active-tab")).toHaveTextContent("text||report.htm"));
  });

  it("shows a read failure when listing the directory rejects", async () => {
    installBridge({ listWorkspaceDir: async () => { throw new Error("ipc failed"); } });
    renderTree("/ws");
    expect(await screen.findByText("无法读取目录")).toBeInTheDocument();
  });
});
