import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { encodeSessionLocator } from "@actspace/shared/session-locator";
import { legacyRunTarget, TestConversationView } from "./helpers/workbench";
import { RunTargetContext } from "../target/run-target-context";
import { ToolLogLine } from "../components/messages/ToolLogLine";
import { collectTurnOutputArtifacts, TurnOutputArtifacts } from "../components/messages/TurnOutputArtifacts";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";
import { setupBridge } from "./helpers/bridge";

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

describe("image generation presentation", () => {
  it("previews a Browser screenshot stored as a generic tool artifact", async () => {
    const readSessionArtifact = vi.fn(async () => ({ name: "screenshot.jpeg", relativePath: "browser-shot", mimeType: "image/jpeg" as const, size: 68, dataUrl: "data:image/jpeg;base64,AAAA" }));
    setupBridge({ "sessions.readArtifact": readSessionArtifact });
    const screenshot: MessageBlock = { kind: "tool", id: "browser-shot", createdAt: "now", toolName: "browser_cua", title: "Screenshot", content: "Captured", artifacts: [{ type: "image", name: "Chrome 截图", path: "browser-artifact-id", mimeType: "image/jpeg" }] };
    render(<RightPanelProvider><TurnOutputArtifacts messages={[screenshot]} sessionId="session-1" /><ActiveTabProbe /></RightPanelProvider>);
    expect(screen.getByText("1 image")).toBeInTheDocument();
    expect(screen.getByText("Chrome 截图")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open Chrome 截图" }));
    expect(readSessionArtifact).toHaveBeenCalledWith({ sessionId: "session-1", artifactPath: "browser-artifact-id" });
    expect(screen.getByTestId("active-tab-src")).toHaveTextContent("data:image/jpeg;base64,AAAA");
  });

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

  it("collects generated images only; written files belong to the turn changes card", () => {
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
    ]);

    expect(outputs.map((output) => output.name)).toEqual(["generated-01.png"]);
    expect(outputs[0].displayPath).toBe("generated-images/batch/generated-01.png");
  });

  it("loads a session image through preload and opens a data URL in the right panel", async () => {
    const readSessionArtifact = vi.fn(async () => ({
      name: "generated-01.png",
      relativePath: "generated-images/batch/generated-01.png",
      mimeType: "image/png" as const,
      size: 68,
      dataUrl: "data:image/png;base64,AAAA",
    }));
    setupBridge({ "sessions.readArtifact": readSessionArtifact });

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
    setupBridge({ "dialogs.showArtifactContextMenu": showArtifactContextMenu });

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

  it("places the artifact shelf after the final assistant reply", () => {
    const messages: MessageBlock[] = [
      { kind: "user", id: "user-1", content: "Generate it", createdAt: "2026-07-28T00:00:00.000Z" },
      imageMessage,
      { kind: "assistant", id: "assistant-1", content: "图片已经生成。", createdAt: "2026-07-28T00:00:03.000Z" },
    ];

    render(
      <RightPanelProvider>
        <TestConversationView messages={messages} contextSnapshot={null} sessionId="session-1" isSessionReady={false} />
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
        <TestConversationView
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
        <TestConversationView messages={messages} contextSnapshot={null} sessionId="session-1" isSessionReady={false} />
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
        <TestConversationView
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
    setupBridge({ "workspaces.readFile": readWorkspaceFile });
    render(
      <RightPanelProvider>
        <TestConversationView
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

  // 15 T6：是否经 Host 读取由 RunTargetContext 的 target 决定，不再各自解析会话 key。
  const remoteKey = encodeSessionLocator({ hostId: "server", sessionId: "remote-1" });
  const remoteTarget = { kind: "remote", hostId: "server", hostName: "Cloud" } as const;

  it("reads a file through the Host when the run target is remote", async () => {
    const call = vi.fn(async () => ({ id: "artifact-1" }));
    const preview = vi.fn(async () => ({ name: "ARCHITECTURE.md", size: 14, text: "# Remote" }));
    const readWorkspaceFile = vi.fn();
    setupBridge({ "hosts.call": call, "hosts.preview": preview, "workspaces.readFile": readWorkspaceFile });
    render(
      <RightPanelProvider>
        <TestConversationView
          messages={[
            { kind: "user", id: "user-read", content: "Read it", createdAt: "2026-07-28T00:00:00.000Z" },
            { kind: "read", id: "read-1", filePath: "docs/ARCHITECTURE.md", displayText: "Read docs/ARCHITECTURE.md", resultPreview: ["# Architecture"], status: "completed", createdAt: "2026-07-28T00:00:01.000Z" },
          ]}
          contextSnapshot={null}
          sessionId={remoteKey}
          selectedWorkspaceRoot="/workspace"
          runTarget={remoteTarget}
          isSessionReady={false}
        />
        <ActiveTabTitleProbe />
      </RightPanelProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /^Worked/ }));
    await userEvent.click(screen.getByRole("button", { name: "Read docs/ARCHITECTURE.md" }));
    expect(call).toHaveBeenCalledWith({ hostId: "server", method: "files.reference", params: { sessionId: "remote-1", path: "docs/ARCHITECTURE.md" } });
    expect(readWorkspaceFile).not.toHaveBeenCalled();
    expect(await screen.findByTestId("active-tab-title")).toHaveTextContent("text:ARCHITECTURE.md");
  });
});
