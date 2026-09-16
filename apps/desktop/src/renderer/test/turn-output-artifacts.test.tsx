import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { ConversationView } from "../components/ConversationView";
import { ToolLogLine } from "../components/messages/ToolLogLine";
import { collectTurnOutputArtifacts, TurnOutputArtifacts } from "../components/messages/TurnOutputArtifacts";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";

const imageMessage: Extract<MessageBlock, { kind: "image_generation" }> = {
  kind: "image_generation",
  id: "evt-image",
  status: "completed",
  promptPreview: "A breathtaking deep-space scene with a luminous spiral galaxy",
  requestedCount: 1,
  generatedCount: 1,
  model: "gpt-image-2",
  size: "1536x1024",
  displayText: "Generated 1 image",
  images: [
    {
      type: "image",
      name: "generated-01.png",
      path: "/data/sessions/session-1/artifacts/generated-images/batch/generated-01.png",
      mimeType: "image/png",
    },
  ],
  createdAt: "2026-07-28T00:00:00.000Z",
};

function ActiveTabProbe() {
  const { activeTab } = useRightPanel();
  return <div data-testid="active-tab-src">{activeTab?.kind === "image" ? activeTab.src : ""}</div>;
}

function ActiveTabTitleProbe() {
  const { activeTab } = useRightPanel();
  return <div data-testid="active-tab-title">{activeTab ? `${activeTab.kind}:${activeTab.title}` : ""}</div>;
}

function ActiveFileProbe() {
  const { activeTab } = useRightPanel();
  return <div data-testid="active-file-tab">{activeTab?.kind === "markdown" ? `${activeTab.relativePath}:${activeTab.source}` : ""}</div>;
}

afterEach(() => {
  Reflect.deleteProperty(window, "actspace");
});

describe("image generation presentation", () => {
  it("renders image generation as a single Read-style tool line", () => {
    render(<ToolLogLine message={imageMessage} />);

    expect(screen.getByText(/Generated image · 1536x1024 · 1 · A breathtaking/)).toBeInTheDocument();
    expect(document.querySelector(".tool-log-line")).toBeTruthy();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("keeps image failures compact until the error disclosure is opened", async () => {
    render(<ToolLogLine message={{
      ...imageMessage,
      id: "evt-image-failed",
      status: "failed",
      generatedCount: 0,
      displayText: "Generate image failed",
      errorMessage: "Image generation provider returned HTML instead of JSON.",
      images: undefined,
    }} />);

    expect(screen.getByRole("button", { name: /Generate image failed/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Image generation provider returned HTML instead of JSON.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Generate image failed/ }));
    expect(screen.getByText("Image generation provider returned HTML instead of JSON.")).toBeInTheDocument();
  });

  it("collects generated images and completed write/edit outputs only", () => {
    const outputs = collectTurnOutputArtifacts([
      imageMessage,
      {
        kind: "write_diff",
        id: "write-1",
        filePath: "result.md",
        outputPath: "/workspace/docs/result.md",
        outputRelativePath: "docs/result.md",
        additions: 2,
        deletions: 0,
        diff: "",
        collapsedLines: 0,
        status: "completed",
        createdAt: "2026-07-28T00:00:01.000Z",
      },
      {
        kind: "edit_diff",
        id: "edit-running",
        filePath: "draft.md",
        outputPath: "/workspace/draft.md",
        outputRelativePath: "draft.md",
        additions: 0,
        deletions: 0,
        diff: "",
        collapsedLines: 0,
        status: "running",
        createdAt: "2026-07-28T00:00:02.000Z",
      },
    ]);

    expect(outputs.map((output) => output.name)).toEqual(["generated-01.png", "result.md"]);
    expect(outputs[0].displayPath).toBe("generated-images/batch/generated-01.png");
    expect(outputs[1]).toMatchObject({ additions: 2, deletions: 0 });
  });

  it("merges repeated file changes and removes files deleted later in the turn", () => {
    const outputs = collectTurnOutputArtifacts([
      {
        kind: "write_diff",
        id: "write-report",
        filePath: "report.md",
        outputPath: "/workspace/docs/report.md",
        outputRelativePath: "docs/report.md",
        additions: 4,
        deletions: 0,
        diff: "",
        collapsedLines: 0,
        status: "completed",
        createdAt: "2026-07-28T00:00:01.000Z",
      },
      {
        kind: "edit_diff",
        id: "edit-report",
        filePath: "report.md",
        outputPath: "/workspace/docs/report.md",
        outputRelativePath: "docs/report.md",
        additions: 2,
        deletions: 1,
        diff: "",
        collapsedLines: 0,
        status: "completed",
        createdAt: "2026-07-28T00:00:02.000Z",
      },
      {
        kind: "write_diff",
        id: "write-temp",
        filePath: "tmp-test.mjs",
        outputPath: "/workspace/tmp-test.mjs",
        outputRelativePath: "tmp-test.mjs",
        additions: 10,
        deletions: 0,
        diff: "",
        collapsedLines: 0,
        status: "completed",
        createdAt: "2026-07-28T00:00:03.000Z",
      },
      {
        kind: "delete",
        id: "delete-temp",
        filePath: "tmp-test.mjs",
        outputPath: "/workspace/tmp-test.mjs",
        outputRelativePath: "tmp-test.mjs",
        displayText: "Deleted tmp-test.mjs",
        status: "completed",
        createdAt: "2026-07-28T00:00:04.000Z",
      },
    ]);

    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      displayPath: "docs/report.md",
      additions: 6,
      deletions: 1,
    });
  });

  it("removes a uniquely named file for legacy delete previews without output paths", () => {
    const outputs = collectTurnOutputArtifacts([
      {
        kind: "write_diff",
        id: "write-temp",
        filePath: "tmp-test-orders.mjs",
        outputPath: "/workspace/tmp-test-orders.mjs",
        outputRelativePath: "tmp-test-orders.mjs",
        additions: 46,
        deletions: 0,
        diff: "",
        collapsedLines: 0,
        status: "completed",
        createdAt: "2026-07-28T00:00:01.000Z",
      },
      {
        kind: "delete",
        id: "delete-temp",
        filePath: "tmp-test-orders.mjs",
        displayText: "Deleted tmp-test-orders.mjs",
        status: "completed",
        createdAt: "2026-07-28T00:00:02.000Z",
      },
    ]);

    expect(outputs).toEqual([]);
  });

  it("loads a session image through preload and opens a data URL in the right panel", async () => {
    const readSessionArtifact = vi.fn(async () => ({
      name: "generated-01.png",
      relativePath: "generated-images/batch/generated-01.png",
      mimeType: "image/png" as const,
      size: 68,
      dataUrl: "data:image/png;base64,AAAA",
    }));
    Object.defineProperty(window, "actspace", {
      configurable: true,
      value: { readSessionArtifact },
    });

    render(
      <RightPanelProvider>
        <TurnOutputArtifacts messages={[imageMessage]} sessionId="session-1" />
        <ActiveTabProbe />
      </RightPanelProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open generated-01.png" }));

    expect(readSessionArtifact).toHaveBeenCalledWith({
      sessionId: "session-1",
      artifactPath: imageMessage.images?.[0].path,
    });
    expect(screen.getByTestId("active-tab-src")).toHaveTextContent("data:image/png;base64,AAAA");
  });

  it("shows the full source path on hover", async () => {
    render(
      <RightPanelProvider>
        <TurnOutputArtifacts messages={[imageMessage]} sessionId="session-1" />
      </RightPanelProvider>,
    );

    await userEvent.hover(screen.getByRole("button", { name: "Open generated-01.png" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(imageMessage.images?.[0].path ?? "");
  });

  it("asks main to open the generated image context menu", async () => {
    const showArtifactContextMenu = vi.fn(async () => ({ shown: true }));
    Object.defineProperty(window, "actspace", {
      configurable: true,
      value: { showArtifactContextMenu },
    });

    render(
      <RightPanelProvider>
        <TurnOutputArtifacts messages={[imageMessage]} sessionId="session-1" />
      </RightPanelProvider>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Open generated-01.png" }));

    expect(showArtifactContextMenu).toHaveBeenCalledWith({
      kind: "session_image",
      sessionId: "session-1",
      artifactPath: imageMessage.images?.[0].path,
    });
  });

  it("opens a completed workspace output file with the existing file renderer", async () => {
    const writeMessage: Extract<MessageBlock, { kind: "write_diff" }> = {
      kind: "write_diff",
      id: "write-output",
      filePath: "report.md",
      outputPath: "/workspace/docs/report.md",
      outputRelativePath: "docs/report.md",
      additions: 3,
      deletions: 0,
      diff: "",
      collapsedLines: 0,
      status: "completed",
      createdAt: "2026-07-28T00:00:01.000Z",
    };
    const readWorkspaceFile = vi.fn(async () => ({
      relativePath: "docs/report.md",
      renderKind: "markdown" as const,
      content: "# Report",
      size: 8,
    }));
    Object.defineProperty(window, "actspace", {
      configurable: true,
      value: { readWorkspaceFile },
    });

    render(
      <RightPanelProvider>
        <TurnOutputArtifacts messages={[writeMessage]} sessionId="session-1" workspaceRoot="/workspace" />
        <ActiveTabTitleProbe />
      </RightPanelProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open report.md" }));

    expect(readWorkspaceFile).toHaveBeenCalledWith({ workspaceRoot: "/workspace", relativePath: "docs/report.md" });
    expect(screen.getByTestId("active-tab-title")).toHaveTextContent("markdown:report.md");
  });

  it("shows a specific error when a workspace artifact no longer exists", async () => {
    const readWorkspaceFile = vi.fn(async () => ({
      relativePath: "tmp-test.mjs",
      renderKind: "text" as const,
      size: 0,
      mtimeMs: 0,
      error: "not_found" as const,
    }));
    Object.defineProperty(window, "actspace", {
      configurable: true,
      value: { readWorkspaceFile },
    });
    const writeMessage: Extract<MessageBlock, { kind: "write_diff" }> = {
      kind: "write_diff",
      id: "write-missing",
      filePath: "tmp-test.mjs",
      outputPath: "/workspace/tmp-test.mjs",
      outputRelativePath: "tmp-test.mjs",
      additions: 4,
      deletions: 0,
      diff: "",
      collapsedLines: 0,
      status: "completed",
      createdAt: "2026-07-28T00:00:01.000Z",
    };

    render(
      <RightPanelProvider>
        <TurnOutputArtifacts messages={[writeMessage]} sessionId="session-1" workspaceRoot="/workspace" />
      </RightPanelProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open tmp-test.mjs" }));

    expect(await screen.findByText("文件已不存在。")).toBeInTheDocument();
  });

  it("renders workspace outputs as a compact file list with per-file and total diff stats", () => {
    const writeMessage: Extract<MessageBlock, { kind: "write_diff" }> = {
      kind: "write_diff",
      id: "write-output-list",
      filePath: "report.md",
      outputPath: "/workspace/docs/report.md",
      outputRelativePath: "docs/report.md",
      additions: 3,
      deletions: 1,
      diff: "",
      collapsedLines: 0,
      status: "completed",
      createdAt: "2026-07-28T00:00:01.000Z",
    };

    render(
      <RightPanelProvider>
        <TurnOutputArtifacts messages={[writeMessage]} sessionId="session-1" workspaceRoot="/workspace" />
      </RightPanelProvider>,
    );

    expect(screen.getByText("Edited 1 file")).toBeInTheDocument();
    expect(screen.getByText("docs/report.md")).toBeInTheDocument();
    expect(screen.getAllByText("+3")).toHaveLength(2);
    expect(screen.getAllByText("-1")).toHaveLength(2);
  });

  it("asks main to open a workspace output context menu by relative path", () => {
    const showArtifactContextMenu = vi.fn(async () => ({ shown: true }));
    Object.defineProperty(window, "actspace", {
      configurable: true,
      value: { showArtifactContextMenu },
    });
    const writeMessage: Extract<MessageBlock, { kind: "write_diff" }> = {
      kind: "write_diff",
      id: "write-output-menu",
      filePath: "report.md",
      outputPath: "/workspace/docs/report.md",
      outputRelativePath: "docs/report.md",
      additions: 1,
      deletions: 0,
      diff: "",
      collapsedLines: 0,
      status: "completed",
      createdAt: "2026-07-28T00:00:01.000Z",
    };

    render(
      <RightPanelProvider>
        <TurnOutputArtifacts messages={[writeMessage]} sessionId="session-1" workspaceRoot="/workspace" />
      </RightPanelProvider>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Open report.md" }));

    expect(showArtifactContextMenu).toHaveBeenCalledWith({
      kind: "workspace_file",
      workspaceRoot: "/workspace",
      relativePath: "docs/report.md",
    });
  });

  it("places the artifact shelf after the final assistant reply", () => {
    const messages: MessageBlock[] = [
      { kind: "user", id: "user-1", content: "Generate it", createdAt: "2026-07-28T00:00:00.000Z" },
      imageMessage,
      { kind: "assistant", id: "assistant-1", content: "图片已经生成。", createdAt: "2026-07-28T00:00:03.000Z" },
    ];

    render(
      <RightPanelProvider>
        <ConversationView messages={messages} contextSnapshot={null} sessionId="session-1" isSessionReady={false} />
      </RightPanelProvider>,
    );

    const reply = screen.getByText("图片已经生成。");
    const shelf = screen.getByRole("region", { name: "Turn output artifacts" });
    expect(reply.compareDocumentPosition(shelf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the completed conversation and follow-up composer visible when projection phase lags", () => {
    const messages: MessageBlock[] = [
      { kind: "user", id: "user-1", content: "Hello", createdAt: "2026-07-28T00:00:00.000Z" },
      { kind: "assistant", id: "assistant-1", content: "你好，我已经完成回复。", createdAt: "2026-07-28T00:00:03.000Z" },
    ];

    render(
      <RightPanelProvider>
        <ConversationView
          messages={messages}
          contextSnapshot={null}
          sessionId="session-1"
          isSessionReady
          composerPhase="blank"
        />
      </RightPanelProvider>,
    );

    expect(screen.getByText("你好，我已经完成回复。")).toBeInTheDocument();
    expect(screen.getByLabelText("消息输入框")).toBeInTheDocument();
  });

  it("does not publish the artifact shelf before the final reply exists", () => {
    const messages: MessageBlock[] = [
      { kind: "user", id: "user-1", content: "Generate it", createdAt: "2026-07-28T00:00:00.000Z" },
      imageMessage,
    ];

    render(
      <RightPanelProvider>
        <ConversationView messages={messages} contextSnapshot={null} sessionId="session-1" isSessionReady={false} />
      </RightPanelProvider>,
    );

    expect(screen.queryByRole("region", { name: "Turn output artifacts" })).not.toBeInTheDocument();
  });

  it("keeps the artifact shelf hidden while the final reply is still streaming", () => {
    const messages: MessageBlock[] = [
      { kind: "user", id: "user-1", content: "Generate it", createdAt: "2026-07-28T00:00:00.000Z" },
      imageMessage,
      { kind: "assistant", id: "assistant-streaming", content: "正在整理结果。", createdAt: "2026-07-28T00:00:03.000Z" },
    ];

    render(
      <RightPanelProvider>
        <ConversationView
          messages={messages}
          contextSnapshot={null}
          sessionId="session-1"
          isSessionReady={false}
          isStreaming
        />
      </RightPanelProvider>,
    );

    expect(screen.getByText("正在整理结果。")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Turn output artifacts" })).not.toBeInTheDocument();
  });
});

describe("generic tool result presentation", () => {
  it("reveals list and glob previews from one consistent disclosure control", async () => {
    render(
      <div>
        <ToolLogLine
          message={{
            kind: "glob",
            id: "evt-glob",
            pattern: "**/*.md",
            scope: ".",
            displayText: "Glob **/*.md",
            resultPreview: ["README.md", "docs/ARCHITECTURE.md"],
            status: "completed",
            createdAt: "2026-07-28T00:00:00.000Z",
          }}
        />
        <ToolLogLine
          message={{
            kind: "directory_list",
            id: "evt-list",
            path: ".",
            entryCount: 2,
            displayText: "Listed . (2 entries)",
            resultPreview: ["README.md", "src"],
            status: "completed",
            createdAt: "2026-07-28T00:00:00.000Z",
          }}
        />
      </div>,
    );

    const toggles = screen.getAllByRole("button", { name: /Glob|Listed/ });
    expect(toggles).toHaveLength(2);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggles[0]);
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("docs/ARCHITECTURE.md")).toBeInTheDocument();
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".tool-result-disclosure")).toBeTruthy();
    expect(document.querySelector(".web-tool-block")).toBeNull();
  });

  it("exposes a read-file action separately from the result disclosure", async () => {
    const onOpenFile = vi.fn();
    const message = {
      kind: "read" as const,
      id: "evt-read",
      filePath: "docs/ARCHITECTURE.md",
      displayText: "Read docs/ARCHITECTURE.md",
      resultPreview: ["     1|# Architecture"],
      status: "completed" as const,
      createdAt: "2026-07-28T00:00:00.000Z",
    };

    render(<ToolLogLine message={message} onOpenFile={onOpenFile} />);

    await userEvent.click(screen.getByRole("button", { name: "Read docs/ARCHITECTURE.md" }));
    expect(onOpenFile).toHaveBeenCalledWith(message);
    expect(screen.getByRole("button", { name: "Show result for Read docs/ARCHITECTURE.md" })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a safe workspace read in the existing right-panel file tab", async () => {
    const readWorkspaceFile = vi.fn(async () => ({
      relativePath: "docs/ARCHITECTURE.md",
      renderKind: "markdown" as const,
      size: 20,
      mtimeMs: 1,
      content: "# Architecture",
    }));
    Object.defineProperty(window, "actspace", { configurable: true, value: { readWorkspaceFile } });
    render(
      <RightPanelProvider>
        <ConversationView
          messages={[
            { kind: "user", id: "user-read", content: "Read it", createdAt: "2026-07-28T00:00:00.000Z" },
            { kind: "read", id: "read-1", filePath: "docs/ARCHITECTURE.md", displayText: "Read docs/ARCHITECTURE.md", resultPreview: ["# Architecture"], status: "completed", createdAt: "2026-07-28T00:00:01.000Z" },
          ]}
          contextSnapshot={null}
          sessionId="session-1"
          selectedWorkspaceRoot="/workspace"
          isSessionReady={false}
        />
        <ActiveFileProbe />
      </RightPanelProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /^Worked/ }));
    await userEvent.click(screen.getByRole("button", { name: "Read docs/ARCHITECTURE.md" }));
    expect(readWorkspaceFile).toHaveBeenCalledWith({ workspaceRoot: "/workspace", relativePath: "docs/ARCHITECTURE.md" });
    expect(screen.getByTestId("active-file-tab")).toHaveTextContent("docs/ARCHITECTURE.md:# Architecture");
  });
});
