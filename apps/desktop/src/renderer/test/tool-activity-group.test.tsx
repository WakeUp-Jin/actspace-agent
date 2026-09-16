import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MessageBlock } from "@actspace/shared";
import { ConversationView } from "../components/ConversationView";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";

// 一个含「旁白 content + 多个工具 + 最终回复」的 turn，用来覆盖工具活动组的折叠/展开与最终回复留外行为。
const toolTurn: MessageBlock[] = [
  { kind: "user", id: "user-1", content: "看看项目结构", createdAt: "2026-06-02T00:00:00.000Z" },
  {
    kind: "assistant",
    id: "preamble-1",
    content: "我要调用读取工具看看。",
    createdAt: "2026-06-02T00:00:01.000Z",
  },
  {
    kind: "read",
    id: "read-1",
    filePath: "package.json",
    displayText: "Read package.json",
    status: "completed",
    createdAt: "2026-06-02T00:00:02.000Z",
  },
  {
    kind: "thinking",
    id: "thinking-1",
    title: "Thought 2s",
    content: "需要继续搜索组件引用。",
    collapsedByDefault: true,
    status: "completed",
    createdAt: "2026-06-02T00:00:03.000Z",
  },
  {
    kind: "grep",
    id: "grep-1",
    pattern: "ToolActivityGroup",
    displayText: "Grep ToolActivityGroup",
    status: "completed",
    createdAt: "2026-06-02T00:00:05.000Z",
  },
  {
    kind: "assistant",
    id: "final-1",
    content: "项目是 monorepo 结构，这是最终结论。",
    createdAt: "2026-06-02T00:00:08.000Z",
  },
];

// 纯问答 turn：没有任何工具，不应出现 Worked for 折叠。
const plainTurn: MessageBlock[] = [
  { kind: "user", id: "user-2", content: "你好", createdAt: "2026-06-02T00:00:00.000Z" },
  { kind: "assistant", id: "plain-1", content: "你好，我是 actspace。", createdAt: "2026-06-02T00:00:01.000Z" },
];

const standaloneThinkingTurn: MessageBlock[] = [
  { kind: "user", id: "user-3", content: "先想一下", createdAt: "2026-06-02T00:00:00.000Z" },
  {
    kind: "thinking",
    id: "thinking-standalone",
    title: "Thinking...",
    content: "先整理一下回答思路。",
    collapsedByDefault: false,
    status: "completed",
    createdAt: "2026-06-02T00:00:01.000Z",
  },
  { kind: "assistant", id: "final-3", content: "整理完成。", createdAt: "2026-06-02T00:00:02.000Z" },
];

const thinkingBeforeBashTurn: MessageBlock[] = [
  { kind: "user", id: "user-4", content: "运行命令前先思考", createdAt: "2026-06-02T00:00:00.000Z" },
  {
    kind: "thinking",
    id: "thinking-before-bash",
    title: "Thinking...",
    content: "命令需要先确认上下文。",
    collapsedByDefault: false,
    status: "completed",
    createdAt: "2026-06-02T00:00:01.000Z",
  },
  {
    kind: "bash",
    id: "bash-1",
    command: "pwd",
    title: "Run pwd",
    status: "success",
    createdAt: "2026-06-02T00:00:02.000Z",
  },
  { kind: "assistant", id: "final-4", content: "命令已完成。", createdAt: "2026-06-02T00:00:03.000Z" },
];

function renderConversation(messages: MessageBlock[], isStreaming = false) {
  return render(
    <TooltipProvider delayDuration={0}>
      <RightPanelProvider>
        <ConversationView messages={messages} contextSnapshot={null} sessionId="session-1" isStreaming={isStreaming} />
      </RightPanelProvider>
    </TooltipProvider>,
  );
}

describe("ToolActivityGroup in ConversationView", () => {
  it("collapses the whole process under one Worked toggle and keeps the final reply outside", async () => {
    const user = userEvent.setup();
    renderConversation(toolTurn);

    const toggle = screen.getByRole("button", { name: /Worked for/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    // 最终回复始终在折叠组外，默认可见。
    expect(screen.getByText("项目是 monorepo 结构，这是最终结论。")).toBeInTheDocument();

    // 过程旁白和工具统一折叠。
    expect(screen.queryByText("我要调用读取工具看看。")).not.toBeInTheDocument();
    expect(screen.queryByText("package.json")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("package.json")).toBeInTheDocument();
    expect(screen.getByText("Thought 2s")).toBeInTheDocument();
    expect(screen.getByText("Grep ToolActivityGroup")).toBeInTheDocument();
  });

  it("resets every open tool when the final reply finishes, including failed Bash", async () => {
    const user = userEvent.setup();
    const messages: MessageBlock[] = [
      toolTurn[0],
      { ...toolTurn[3], collapsedByDefault: false } as MessageBlock,
      { ...toolTurn[2], resultPreview: ["read detail"] } as MessageBlock,
      { ...toolTurn[4], resultPreview: ["grep detail"] } as MessageBlock,
      { kind: "web_search", mode: "query", id: "web", createdAt: toolTurn[0].createdAt, displayText: "Searched web", query: "example", status: "completed", contentPreview: "web detail" },
      { ...thinkingBeforeBashTurn[2], status: "failed", stdout: "bash detail" } as MessageBlock,
      toolTurn[5],
    ];
    const view = (active: boolean) => <TooltipProvider><RightPanelProvider>
      <ConversationView messages={messages} contextSnapshot={null} sessionId="session-1" isStreaming={active} />
    </RightPanelProvider></TooltipProvider>;
    const { rerender } = render(view(true));
    for (const name of ["Show result for Read package.json", "Grep ToolActivityGroup", "Searched web"]) {
      await user.click(screen.getByRole("button", { name }));
    }
    expect(screen.getByText("read detail")).toBeVisible();
    expect(screen.getByText("grep detail")).toBeVisible();
    expect(screen.getByText("web detail")).toBeVisible();
    expect(screen.getByRole("button", { name: "Thought 2s" })).toHaveAttribute("aria-expanded", "true");
    rerender(view(false));
    const worked = screen.getByRole("button", { name: /Worked for/ });
    expect(worked).toHaveAttribute("aria-expanded", "false");
    await user.click(worked);
    for (const button of screen.getAllByRole("button").filter((button) => button !== worked && button.hasAttribute("aria-expanded"))) {
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
    for (const detail of ["read detail", "grep detail", "web detail", "bash detail", "需要继续搜索组件引用。"]) {
      expect(screen.queryByText(detail)).not.toBeInTheDocument();
    }
    await user.click(screen.getByRole("button", { name: "Grep ToolActivityGroup" }));
    rerender(view(false));
    expect(screen.getByText("grep detail")).toBeVisible();
  });

  it("renders the process flat (no toggle, no scroll viewport) while streaming", () => {
    renderConversation(toolTurn, true);

    // 执行中不折叠、不出滚动视口：过程行和最终回复都直接可见。
    expect(screen.queryByRole("button", { name: /Worked for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tool activity" })).not.toBeInTheDocument();
    expect(screen.getByText("我要调用读取工具看看。")).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();
    expect(screen.getByText("Grep ToolActivityGroup")).toBeInTheDocument();
    expect(screen.getByText("项目是 monorepo 结构，这是最终结论。")).toBeInTheDocument();
  });

  it("does not render a Worked for group for a plain Q&A turn", () => {
    renderConversation(plainTurn);

    expect(screen.queryByRole("button", { name: /Worked for/ })).not.toBeInTheDocument();
    expect(screen.getByText("你好，我是 actspace。")).toBeInTheDocument();
  });

  it("includes standalone Thinking in Worked", async () => {
    renderConversation(standaloneThinkingTurn);

    await userEvent.click(screen.getByRole("button", { name: /Worked for/ }));
    const thinkingToggle = screen.getByRole("button", { name: "Thinking..." });
    expect(thinkingToggle).toBeInTheDocument();
    expect(thinkingToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("先整理一下回答思路。")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Explored/ })).not.toBeInTheDocument();
  });

  it("groups Thinking and Bash in one Worked", async () => {
    renderConversation(thinkingBeforeBashTurn);

    await userEvent.click(screen.getByRole("button", { name: /Worked for/ }));
    expect(screen.getByRole("button", { name: "Thinking..." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Worked for/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Explored/ })).not.toBeInTheDocument();
  });
});
