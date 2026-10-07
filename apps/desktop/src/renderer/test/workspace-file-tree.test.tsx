import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceListDirInput, WorkspaceListDirResult, WorkspaceReadFileResult } from "@actspace/shared";
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
}) {
  setupBridge({
    "workspaces.listDir": overrides.listWorkspaceDir ?? (async () => ({ root: "/ws", relativePath: "", entries: [] })),
    "workspaces.readFile":
      overrides.readWorkspaceFile ?? (async () => ({ relativePath: "", renderKind: "text", size: 0, mtimeMs: 0, content: "" })),
  });
}

describe("WorkspaceFileTree", () => {
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

  it("shows a read failure when listing the directory rejects", async () => {
    installBridge({ listWorkspaceDir: async () => { throw new Error("ipc failed"); } });
    renderTree("/ws");
    expect(await screen.findByText("无法读取目录")).toBeInTheDocument();
  });
});
