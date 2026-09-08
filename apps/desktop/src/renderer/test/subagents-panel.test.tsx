import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { SubagentsPanel } from "../components/right-panel/SubagentsPanel";
import { TooltipProvider } from "../components/ui/Tooltip";

type Agent = Extract<MessageBlock, { kind: "agent" }>;
const agent = (id: string, status: Agent["status"]): Agent => ({ kind: "agent", id, description: id, displayText: id, subagentType: "explore", status, createdAt: "now", display: "panel", transcriptRef: { kind: "subagent_transcript", sessionId: "parent", agentRunId: "run", runId: id } });
const original = window.actspace;
afterEach(() => { window.actspace = original; });
it("groups agents and navigates within the panel while rejecting stale transcript responses", async () => {
  let finishOld!: (value: never[]) => void;
  const transcript = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValue([]);
  window.actspace = { ...original, getSubagents: vi.fn().mockResolvedValue([agent("first", "running"), agent("second", "completed")]), getSubAgentTranscript: transcript };
  const { unmount } = render(<TooltipProvider><SubagentsPanel sessionId="parent" /></TooltipProvider>);
  await screen.findByText("运行中 · 1");
  expect(screen.getByText("已结束 · 1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /first/ }));
  await waitFor(() => expect(transcript).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "返回子 Agent 列表" }));
  fireEvent.click(screen.getByRole("button", { name: /second/ }));
  await waitFor(() => expect(transcript).toHaveBeenCalledTimes(2));
  await act(async () => finishOld([]));
  expect(screen.getByRole("heading", { name: "second" })).toBeInTheDocument();
  unmount();
});
