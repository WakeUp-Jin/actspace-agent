import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { EventRow } from "../blocks/EventRow";
import { genericLine } from "../blocks/GenericToolRow";
import { SubagentLetter, SubagentStatusContext } from "../blocks/SubagentLetter";
import { TurnView } from "../TurnView";
import { buildTurns } from "../../../sessions/turn-model";
import type { TranscriptItem } from "../../../sessions/transcript-model";

const notice = (taskKind: "bash" | "agent" | "subagent" | "agent_message", status: string) =>
  ({ kind: "background_notice", id: "n", content: "", createdAt: "t", taskId: "x", taskKind, title: "整理文档", status }) as unknown as Extract<MessageBlock, { kind: "background_notice" }>;

it("words subagent notices the same way as the desktop", () => {
  const { rerender } = render(<EventRow block={notice("subagent", "completed")} />);
  expect(screen.getByText("子智能体 整理文档 已完成")).toBeInTheDocument();
  rerender(<EventRow block={notice("agent_message", "completed")} />);
  expect(screen.getByText("整理文档 发来消息")).toBeInTheDocument();
  rerender(<EventRow block={notice("bash", "completed")} />);
  expect(screen.getByText("后台任务 · Bash: 整理文档 · 已完成")).toBeInTheDocument();
});

it("labels subagent cards by kind, preset and legacy agentKind", () => {
  const card = (extra: Record<string, unknown>) => ({ kind: "agent", description: "d", ...extra }) as unknown as MessageBlock;
  expect(genericLine(card({ subagentKind: "local", preset: "general" })).verb).toBe("通用");
  expect(genericLine(card({ subagentKind: "local", preset: "explore" })).verb).toBe("探索");
  expect(genericLine(card({ subagentKind: "claude-code" })).verb).toBe("Claude Code");
  expect(genericLine(card({ agentKind: "agent" })).verb).toBe("Agent");
});

const letterBlock = (partial: Record<string, unknown> = {}) => ({
  kind: "background_notice", id: "l", createdAt: "2026-11-08T10:00:05.000Z", taskId: "sa-1", taskKind: "agent_message", title: "复核提交顺序", status: "message", opensTurn: false,
  content: '<agent_message from="sa-1" relation="child">\n只需要改 **transaction.ts** 一处。\n</agent_message>', ...partial,
}) as unknown as Extract<MessageBlock, { kind: "background_notice" }>;

it("shows an agent message as a card with the sender's status, not a divider", () => {
  const { rerender } = render(<SubagentStatusContext.Provider value={new Map([["sa-1", "running"]])}><SubagentLetter block={letterBlock()} /></SubagentStatusContext.Provider>);
  expect(screen.getByText("来信")).toHaveClass("text-info");
  expect(screen.getByText("运行中")).toBeInTheDocument();
  expect(screen.getByText("transaction.ts").tagName).toBe("STRONG");
  expect(document.body.textContent).not.toContain("agent_message");
  rerender(<SubagentStatusContext.Provider value={new Map([["sa-1", "completed"]])}><SubagentLetter block={letterBlock()} /></SubagentStatusContext.Provider>);
  expect(screen.getByText("已完成")).toBeInTheDocument();
  rerender(<SubagentLetter block={letterBlock()} />);
  expect(screen.queryByText(/运行中|已完成/)).toBeNull();
});

it("keeps a letter outside the folded Worked group, before the reply", () => {
  const item = (block: MessageBlock): TranscriptItem => ({ type: "block", key: block.id, block });
  const user = { kind: "user", id: "u", content: "看看", createdAt: "2026-11-08T10:00:00.000Z" } as MessageBlock;
  const bash = { kind: "bash", id: "b", command: "ls", status: "completed", createdAt: "2026-11-08T10:00:01.000Z" } as unknown as MessageBlock;
  const reply = { kind: "assistant", id: "a", content: "改好了。", createdAt: "2026-11-08T10:00:09.000Z" } as MessageBlock;
  const [turn] = buildTurns([item(user), item(bash), item(letterBlock()), item(reply)]);
  render(<TurnView turn={turn!} sessionId="s" active={false} approvalsAfter={new Map()} renderApproval={() => null} />);
  const worked = screen.getByRole("button", { name: /Worked/ });
  expect(worked).toHaveAttribute("aria-expanded", "false");
  const card = screen.getByText("来信");
  expect(worked.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(card.compareDocumentPosition(screen.getByText("改好了。")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
