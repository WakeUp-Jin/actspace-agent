import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { SubagentsPanel } from "../components/right-panel/SubagentsPanel";
import { TooltipProvider } from "../components/ui/Tooltip";
import { overrideBridge } from "./helpers/bridge";

// 子轨迹本身由 TrajectoryView 渲染（另有测试），这里只看面板把哪个会话交给它。
vi.mock("../components/TrajectoryView", () => ({
  TrajectoryView: ({ sessionId, variant }: { sessionId?: string; variant?: string }) => <div data-testid="child-trajectory" data-session={sessionId} data-variant={variant} />,
}));

// 测试直接把消息块当作 transcript 事件传入，跳过事件到消息块的投影。
vi.mock("@actspace/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@actspace/shared")>()),
  createMessageBlocks: (events: unknown[]) => events as MessageBlock[],
}));

type Agent = Extract<MessageBlock, { kind: "agent" }>;
const agent = (id: string, status: Agent["status"]): Agent => ({ kind: "agent", id, description: id, displayText: id, subagentType: "explore", status, createdAt: "now", display: "panel", transcriptRef: { kind: "subagent_transcript", sessionId: "parent", agentRunId: "run", runId: id } });
it("groups agents and navigates within the panel while rejecting stale transcript responses", async () => {
  let finishOld!: (value: never[]) => void;
  const transcript = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValue([]);
  overrideBridge({ "sessions.getSubagents": vi.fn().mockResolvedValue([agent("first", "running"), agent("second", "completed")]), "sessions.getSubAgentTranscript": transcript });
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

it("renders the transcript with the main conversation's message flow and drops empty reply text", async () => {
  const blocks: MessageBlock[] = [
    { kind: "thinking", id: "t1", title: "Thinking", content: "plan", status: "completed", createdAt: "now" },
    { kind: "assistant", id: "a1", content: "  ", createdAt: "now" },
    { kind: "assistant", id: "a2", content: "Done reading.", createdAt: "now" },
  ] as MessageBlock[];
  overrideBridge({
    "sessions.getSubagents": vi.fn().mockResolvedValue([agent("first", "completed")]),
    "sessions.getSubAgentTranscript": vi.fn().mockResolvedValue(blocks),
  });
  render(<TooltipProvider><SubagentsPanel sessionId="parent" /></TooltipProvider>);
  fireEvent.click(await screen.findByRole("button", { name: /first/ }));
  await screen.findByText("Done reading.");
  const flow = screen.getByLabelText("子 Agent 执行内容").querySelector(".message-flow")!;
  expect(Array.from(flow.children).map((child) => child.getAttribute("data-flow-kind"))).toEqual(["process", "prose"]);
});

it("keeps retrying a completed agent's transcript instead of falling back to its raw summary", async () => {
  const blocks = [{ kind: "assistant", id: "a1", content: "Final **answer**.", createdAt: "now" }] as MessageBlock[];
  const transcript = vi.fn().mockRejectedValueOnce(new Error("busy")).mockResolvedValueOnce([]).mockResolvedValue(blocks);
  overrideBridge({
    "sessions.getSubagents": vi.fn().mockResolvedValue([{ ...agent("first", "completed"), summary: "# raw summary" }]),
    "sessions.getSubAgentTranscript": transcript,
  });
  render(<TooltipProvider><SubagentsPanel sessionId="parent" /></TooltipProvider>);
  fireEvent.click(await screen.findByRole("button", { name: /first/ }));
  expect(await screen.findByText("answer", {}, { timeout: 4000 })).toBeInTheDocument();
  expect(transcript).toHaveBeenCalledTimes(3);
  expect(screen.queryByText("# raw summary")).toBeNull();
}, 8000);

it("opens a focused child agent on its trajectory and toggles between trajectory and conversation", async () => {
  const transcript = vi.fn().mockResolvedValue([]);
  overrideBridge({ "sessions.getSubagents": vi.fn().mockResolvedValue([agent("first", "completed"), agent("second", "completed")]), "sessions.getSubAgentTranscript": transcript });
  render(<TooltipProvider><SubagentsPanel sessionId="parent" focus={{ childSessionId: "second", view: "trajectory", revision: 1 }} /></TooltipProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("正在加载子智能体…");
  const trajectory = await screen.findByTestId("child-trajectory");
  expect(trajectory).toHaveAttribute("data-session", "second");
  expect(trajectory).toHaveAttribute("data-variant", "panel");
  expect(screen.getByRole("heading", { name: "second" })).toBeInTheDocument();
  expect(transcript).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "返回对话" }));
  expect(screen.queryByTestId("child-trajectory")).toBeNull();
  expect(screen.getByLabelText("子 Agent 执行内容")).toBeInTheDocument();
  await waitFor(() => expect(transcript).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "查看执行轨迹" }));
  expect(await screen.findByTestId("child-trajectory")).toBeInTheDocument();
  // 回到列表再点进来，默认看对话。
  fireEvent.click(screen.getByRole("button", { name: "返回子 Agent 列表" }));
  fireEvent.click(screen.getByRole("button", { name: /first/ }));
  expect(screen.getByRole("button", { name: "查看执行轨迹" })).toBeInTheDocument();
  expect(screen.queryByTestId("child-trajectory")).toBeNull();
});

it("returns to the list with a note when the focused child agent is not found", async () => {
  overrideBridge({ "sessions.getSubagents": vi.fn().mockResolvedValue([agent("first", "completed")]), "sessions.getSubAgentTranscript": vi.fn().mockResolvedValue([]) });
  render(<TooltipProvider><SubagentsPanel sessionId="parent" focus={{ childSessionId: "gone", view: "trajectory", revision: 1 }} /></TooltipProvider>);
  expect(await screen.findByText("找不到这个子智能体。")).toBeInTheDocument();
  expect(screen.getByText("已结束 · 1")).toBeInTheDocument();
});
