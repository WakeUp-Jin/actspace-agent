import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { EventRow } from "../blocks/EventRow";
import { genericLine } from "../blocks/GenericToolRow";

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
