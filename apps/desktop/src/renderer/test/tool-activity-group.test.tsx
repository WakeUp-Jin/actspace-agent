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
  it("collapses thinking/tools/preamble under a Worked for toggle, keeps final reply outside", async () => {
    const user = userEvent.setup();
    renderConversation(toolTurn);

    const toggle = screen.getByRole("button", { name: /Worked for/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    // 最终回复始终在折叠组外，默认可见。
    expect(screen.getByText("项目是 monorepo 结构，这是最终结论。")).toBeInTheDocument();

    // 旁白和工具默认折叠，不可见。
    expect(screen.queryByText("我要调用读取工具看看。")).not.toBeInTheDocument();
    expect(screen.queryByText("Read package.json")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("我要调用读取工具看看。")).toBeInTheDocument();
    expect(screen.getByText("Read package.json")).toBeInTheDocument();
    expect(screen.getByText("Grep ToolActivityGroup")).toBeInTheDocument();
  });

  it("renders the process flat (no toggle, no scroll viewport) while streaming", () => {
    renderConversation(toolTurn, true);

    // 执行中不折叠、不出滚动视口：过程行和最终回复都直接可见。
    expect(screen.queryByRole("button", { name: /Worked for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tool activity" })).not.toBeInTheDocument();
    expect(screen.getByText("我要调用读取工具看看。")).toBeInTheDocument();
    expect(screen.getByText("Read package.json")).toBeInTheDocument();
    expect(screen.getByText("Grep ToolActivityGroup")).toBeInTheDocument();
    expect(screen.getByText("项目是 monorepo 结构，这是最终结论。")).toBeInTheDocument();
  });

  it("does not render a Worked for group for a plain Q&A turn", () => {
    renderConversation(plainTurn);

    expect(screen.queryByRole("button", { name: /Worked for/ })).not.toBeInTheDocument();
    expect(screen.getByText("你好，我是 actspace。")).toBeInTheDocument();
  });
});
