import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { SubagentMessageCard } from "../components/messages/SubagentMessageCard";
import { SubagentStatusContext } from "../components/messages/subagent-status-context";
import { TurnView } from "../components/conversation/TurnView";
import { renderMessage } from "../components/conversation/render-message";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";

type Notice = Extract<MessageBlock, { kind: "background_notice" }>;
const letter = (partial: Partial<Notice> = {}): Notice => ({
  kind: "background_notice",
  id: "letter-1",
  createdAt: "2026-11-08T10:00:05.000Z",
  taskId: "child-1",
  taskKind: "agent_message",
  title: "复核提交顺序",
  status: "message",
  content: '<agent_message from="child-1" relation="child">\n只需要改 **transaction.ts** 一处。\n</agent_message>',
  ...partial,
});
const statuses = (status: "running" | "completed") => new Map([["child-1", status] as const]);

it("shows the sender, a blue 来信 tag, the sender's status and the Markdown body without the envelope", () => {
  const open = vi.fn();
  const { rerender } = render(
    <SubagentStatusContext.Provider value={statuses("running")}>
      <SubagentMessageCard message={letter()} onOpenSubagent={open} />
    </SubagentStatusContext.Provider>,
  );
  const header = screen.getByRole("button", { name: "打开子智能体 复核提交顺序" });
  expect(within(header).getByText("来信")).toHaveClass("text-info");
  expect(header).toHaveTextContent("运行中");
  expect(header.querySelector("img")).toHaveAttribute("width", "20");
  expect(screen.getByText("transaction.ts").tagName).toBe("STRONG");
  expect(document.body.textContent).not.toContain("agent_message");
  fireEvent.click(header);
  expect(open).toHaveBeenCalledWith("child-1");
  // 发送方跑完：卡片跟着变。
  rerender(
    <SubagentStatusContext.Provider value={statuses("completed")}>
      <SubagentMessageCard message={letter()} onOpenSubagent={open} />
    </SubagentStatusContext.Provider>,
  );
  expect(header).toHaveTextContent("已完成");
});

it("shows no status when the sender's dispatch card is not loaded", () => {
  render(<SubagentMessageCard message={letter()} />);
  const header = screen.getByRole("button", { name: "打开子智能体 复核提交顺序" });
  expect(header).not.toHaveTextContent(/运行中|已完成/);
});

it("renders agent messages as cards and Bash notices as divider rows", () => {
  render(
    <>
      {renderMessage(letter())}
      {renderMessage(
        letter({
          id: "bash",
          taskKind: "bash",
          taskId: "bash_1",
          title: "pnpm test",
          status: "completed",
          content: "",
        }),
      )}
    </>,
  );
  expect(screen.getByRole("button", { name: "打开子智能体 复核提交顺序" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /后台任务 · Bash: pnpm test/ })).toBeInTheDocument();
});

it("opens a woken turn with the letter card in place of the prompt", () => {
  render(
    <TurnView
      turn={{ id: "n", user: null, notice: letter(), messages: [] }}
      isActive={false}
      sessionId="parent"
      setTurnElement={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: "打开子智能体 复核提交顺序" })).toBeInTheDocument();
  expect(screen.queryByText("复核提交顺序 发来消息")).toBeNull();
});

const user: Extract<MessageBlock, { kind: "user" }> = {
  kind: "user",
  id: "u",
  content: "看看提交顺序",
  createdAt: "2026-11-08T10:00:00.000Z",
};
const read: MessageBlock = {
  kind: "read",
  id: "r",
  displayText: "Read a.ts",
  status: "completed",
  filePath: "a.ts",
  createdAt: "2026-11-08T10:00:01.000Z",
};
const reply: MessageBlock = { kind: "assistant", id: "a", content: "改好了。", createdAt: "2026-11-08T10:00:09.000Z" };

it("keeps a mid-turn letter in place while running and lifts it out of Worked once the turn ends", () => {
  const turn = { id: "u", user, messages: [read, letter({ opensTurn: false }), reply] };
  const view = (isActive: boolean, messages: MessageBlock[]) => (
    <TooltipProvider>
      <RightPanelProvider>
        <TurnView turn={{ ...turn, messages }} isActive={isActive} sessionId="parent" setTurnElement={() => {}} />
      </RightPanelProvider>
    </TooltipProvider>
  );
  const { rerender, container } = render(view(true, turn.messages));
  expect(screen.getByRole("button", { name: "打开子智能体 复核提交顺序" })).toBeInTheDocument();
  rerender(view(false, [...turn.messages]));
  const worked = screen.getByRole("button", { name: /Worked/ });
  expect(worked).toHaveAttribute("aria-expanded", "false");
  // 折叠的过程组外面仍能看到来信，且在最终回复之前。
  const card = screen.getByRole("button", { name: "打开子智能体 复核提交顺序" });
  const answer = screen.getByText("改好了。");
  expect(card.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(worked.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelectorAll(".subagent-message")).toHaveLength(1);
});
