import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MessageBlock, SubagentListItem, WorkspaceReadFileResult, WorkspaceStatFileResult } from "@actspace/shared";
import { ChatMarkdownHostProvider } from "../components/conversation/ChatMarkdownHostProvider";
import { AssistantReply } from "../components/messages/AssistantReply";
import { MarkdownProse } from "../components/messages/MarkdownProse";
import { MarkdownHostContext } from "../components/messages/markdown/host";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";
import { SubagentsPanel } from "../components/right-panel/SubagentsPanel";
import { TooltipProvider } from "../components/ui/Tooltip";
import { ActiveSessionContext, type ActiveSessionValue } from "../session/active-session-context";
import type { RunTarget } from "../target/run-target";
import { RunTargetContext } from "../target/run-target-context";
import { overrideBridge, setupBridge } from "./helpers/bridge";
import { legacyRunTarget } from "./helpers/workbench";

/** 聊天区宿主接线（T23）：打开路径带行号、工作区内绝对路径、本地图片、三处使用方。 */

vi.mock("../components/TrajectoryView", () => ({ TrajectoryView: () => null }));
vi.mock("@actspace/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@actspace/shared")>()),
  createMessageBlocks: (events: unknown[]) => events as MessageBlock[],
}));

const ROOT = "/work/repo";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

const activeSession: ActiveSessionValue = {
  sessionId: "s1", title: "t", contextSnapshot: null, isStreaming: false, isAborting: false, isCompacting: false,
  isSessionReady: true, sendScrollRequestId: 0, composerFocusRequestId: 0,
};

function install() {
  const stat = vi.fn(async ({ relativePath }: { relativePath: string }): Promise<WorkspaceStatFileResult> => ({ relativePath, size: 1, mtimeMs: 1 }));
  const open = vi.fn(async () => ({ ok: true as const }));
  const read = vi.fn(async ({ relativePath }: { relativePath: string }): Promise<WorkspaceReadFileResult> => (
    relativePath.endsWith(".png")
      ? { relativePath, renderKind: "image", size: 1, mtimeMs: 1, dataUrl: PNG }
      : { relativePath, renderKind: "markdown", size: 1, mtimeMs: 1, content: "# x" }
  ));
  setupBridge({ "workspaces.statFile": stat, "workspaces.openFile": open, "workspaces.readFile": read });
  return { stat, open, read };
}

let pendingLine: ReturnType<typeof useRightPanel>["docsPendingLine"] = null;
let selectedPath: string | null = null;
function DocsProbe() {
  const panel = useRightPanel();
  pendingLine = panel.docsPendingLine;
  selectedPath = panel.docsSelectedPath;
  return null;
}

function Workbench({ target = { kind: "local", workspaceRoot: ROOT }, children }: { target?: RunTarget; children: ReactNode }) {
  return (
    <ActiveSessionContext.Provider value={activeSession}>
      <RunTargetContext.Provider value={legacyRunTarget({ runTarget: target, selectedWorkspaceRoot: target.kind === "local" ? ROOT : null })}>
        <RightPanelProvider>
          <TooltipProvider>
            <ChatMarkdownHostProvider>
              <DocsProbe />
              {children}
            </ChatMarkdownHostProvider>
          </TooltipProvider>
        </RightPanelProvider>
      </RunTargetContext.Provider>
    </ActiveSessionContext.Provider>
  );
}

/**
 * 按可访问名称找路径按钮。图标和第一个字符包在 `.md-path-lead` 里，jsdom 没有样式、把 span 当块级，
 * 算名称时会在中间插空格（「d ocs/…」）；真实浏览器不会，所以比较时忽略空白。
 */
const squash = (text: string) => text.replace(/\s+/g, "");
const byName = (name: string) => (accessibleName: string) => squash(accessibleName).includes(squash(name));
const pathButton = (name: string) => screen.getByRole("button", { name: byName(name) });

describe("ChatMarkdownHostProvider", () => {
  it("回复里的 Markdown 路径带行号打开：「文档」面板选中该篇并收到行号", async () => {
    const { stat } = install();
    render(<Workbench><MarkdownProse content={"见 `docs/guide.md:12`。"} /></Workbench>);
    fireEvent.click(pathButton("docs/guide.md:12"));
    await waitFor(() => expect(stat).toHaveBeenCalledWith({ workspaceRoot: ROOT, relativePath: "docs/guide.md" }));
    await waitFor(() => expect(selectedPath).toBe("docs/guide.md"));
    expect(pendingLine).toMatchObject({ path: "docs/guide.md", line: 12 });
  });

  it("非 Markdown 文件交给系统应用，行号忽略", async () => {
    const { open } = install();
    render(<Workbench><MarkdownProse content={"见 `src/app.ts:5`。"} /></Workbench>);
    fireEvent.click(pathButton("src/app.ts:5"));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ workspaceRoot: ROOT, relativePath: "src/app.ts", action: "open" }));
    expect(pendingLine).toBeNull();
  });

  it("本地链接带行号 `[文字](a.md:3)` 同样带行号打开", async () => {
    install();
    render(<Workbench><MarkdownProse content={"[规范第 3 行](docs/spec.md:3)"} /></Workbench>);
    fireEvent.click(screen.getByRole("link", { name: byName("规范第 3 行") }));
    await waitFor(() => expect(pendingLine).toMatchObject({ path: "docs/spec.md", line: 3 }));
  });

  it("工作区内的绝对路径去掉根目录后可点；工作区外的绝对路径不可点", async () => {
    const { stat } = install();
    render(<Workbench><MarkdownProse content={`内：\`${ROOT}/docs/b.md\`，外：\`/etc/hosts.conf\`，[外链](/other/c.md)`} /></Workbench>);
    fireEvent.click(pathButton(`${ROOT}/docs/b.md`));
    await waitFor(() => expect(stat).toHaveBeenCalledWith({ workspaceRoot: ROOT, relativePath: "docs/b.md" }));
    expect(screen.getByText("/etc/hosts.conf").closest("[role=button]")).toBeNull();
    expect(screen.queryByRole("link", { name: /外链/ })).toBeNull();
  });

  it("本机会话：本地图片经 readFile 读成 data URL 显示", async () => {
    const { read } = install();
    render(<Workbench><MarkdownProse content={"![架构](docs/arch.png)"} /></Workbench>);
    const image = await screen.findByRole("img", { name: "架构" });
    expect(image).toHaveAttribute("src", PNG);
    expect(read).toHaveBeenCalledWith({ workspaceRoot: ROOT, relativePath: "docs/arch.png" });
  });

  it("远端会话：不读本地图片，显示占位；绝对路径不可点", async () => {
    const { read } = install();
    render(
      <Workbench target={{ kind: "remote", hostId: "h1", hostName: "Cloud", workspaceId: "w" }}>
        <MarkdownProse content={`![架构](docs/arch.png)\n\n\`${ROOT}/docs/b.md\``} />
      </Workbench>,
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("button", { name: /图片：架构/ })).toBeInTheDocument();
    expect(screen.getByText(`${ROOT}/docs/b.md`).closest("[role=button]")).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});

describe("三处使用方", () => {
  it("对话区：AssistantReply 把行号传给 onOpenWorkspaceFile", () => {
    const onOpen = vi.fn();
    render(<AssistantReply message={{ kind: "assistant", id: "a", content: "改了 `docs/a.md:7`", createdAt: "now" } as Extract<MessageBlock, { kind: "assistant" }>} onOpenWorkspaceFile={onOpen} />);
    fireEvent.click(pathButton("docs/a.md:7"));
    expect(onOpen).toHaveBeenCalledWith("docs/a.md", 7);
  });

  it("右栏子 Agent 面板：执行记录里的回复从宿主拿到 openPath", async () => {
    install();
    const openPath = vi.fn();
    const agent: SubagentListItem = { agentId: "first", kind: "local", preset: "explore", description: "first", status: "ended", activationCount: 1, background: false, createdAt: "now", activeSince: "now", transcriptPath: "/data/first.md" };
    overrideBridge({
      "sessions.getSubagents": vi.fn().mockResolvedValue([agent]),
      "sessions.getSubAgentTranscript": vi.fn().mockResolvedValue([{ kind: "assistant", id: "a1", content: "结论在 `docs/report.md:9`。", createdAt: "now" }]),
    });
    render(
      <TooltipProvider>
        <MarkdownHostContext.Provider value={{ openPath }}>
          <RightPanelProvider initialOpen><SubagentsPanel sessionId="parent" /></RightPanelProvider>
        </MarkdownHostContext.Provider>
      </TooltipProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^first/ }));
    fireEvent.click(await screen.findByRole("button", { name: byName("docs/report.md:9") }));
    expect(openPath).toHaveBeenCalledWith("docs/report.md", 9);
  });
});
