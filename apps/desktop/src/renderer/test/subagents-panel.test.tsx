import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { MessageBlock, SubagentListItem } from "@actspace/shared";
import { SubagentsPanel } from "../components/right-panel/SubagentsPanel";
import { TooltipProvider } from "../components/ui/Tooltip";
import { overrideBridge } from "./helpers/bridge";

// 子轨迹本身由 TrajectoryView 渲染（另有测试），这里只看面板把哪个会话、从哪个 seq 之后交给它。
vi.mock("../components/TrajectoryView", () => ({
  TrajectoryView: ({ sessionId, variant, afterSeq }: { sessionId?: string; variant?: string; afterSeq?: number }) =>
    <div data-testid="child-trajectory" data-session={sessionId} data-variant={variant} data-after={afterSeq ?? ""} />,
}));

// 测试直接把消息块当作 transcript 事件传入，跳过事件到消息块的投影。
vi.mock("@actspace/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@actspace/shared")>()),
  createMessageBlocks: (events: unknown[]) => events as MessageBlock[],
}));

const item = (agentId: string, status: SubagentListItem["status"], extra: Partial<SubagentListItem> = {}): SubagentListItem => ({
  agentId, kind: "local", preset: "general", description: agentId, status, activationCount: 1, background: false,
  createdAt: "2026-11-04T09:05:00.000Z", activeSince: "2026-11-04T09:05:00.000Z", transcriptPath: `/data/sessions/${agentId}.jsonl`, ...extra,
});
const panel = (focus?: Parameters<typeof SubagentsPanel>[0]["focus"]) => render(<TooltipProvider><SubagentsPanel sessionId="parent" focus={focus} /></TooltipProvider>);
// 行按钮的可读名称以描述开头；运行中的行旁边还有「停止 <描述>」按钮。
const row = (description: string) => screen.getByRole("button", { name: new RegExp(`^${description}`) });

it("groups running and other agents, shows kind, model, rounds and start time, and stops a running one from its row", async () => {
  const interrupt = vi.fn().mockResolvedValue({ ok: true });
  overrideBridge({
    "sessions.getSubagents": vi.fn().mockResolvedValue([
      item("scan", "running", { model: "deepseek/deepseek-v4", activationCount: 3 }),
      item("review", "idle", { kind: "fork", preset: undefined }),
      item("port", "ended", { kind: "codex", preset: undefined }),
      item("old", "interrupted", { legacy: true, preset: "explore" }),
    ]),
    "sessions.getSubAgentTranscript": vi.fn().mockResolvedValue([]),
    "sessions.interruptSubagent": interrupt,
  });
  panel();
  expect(await screen.findByText("运行中 · 1")).toBeInTheDocument();
  expect(screen.getByText("其他 · 3")).toBeInTheDocument();
  expect(row("scan")).toHaveTextContent(/运行中.*通用.*deepseek-v4.*第 3 轮/);
  expect(row("review")).toHaveTextContent(/空闲.*Fork/);
  expect(row("port")).toHaveTextContent(/已结束.*Codex/);
  // 老会话的委派仍按 Agent / Explore 显示。
  expect(row("old")).toHaveTextContent(/已中断.*Explore/);
  expect(screen.getAllByRole("button", { name: /^停止 / })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "停止 scan" }));
  await waitFor(() => expect(interrupt).toHaveBeenCalledWith({ sessionId: "parent", agentId: "scan" }));
});

it("reports a failed stop on the list", async () => {
  overrideBridge({
    "sessions.getSubagents": vi.fn().mockResolvedValue([item("scan", "running")]),
    "sessions.interruptSubagent": vi.fn().mockResolvedValue({ ok: false, message: "子智能体已经结束" }),
  });
  panel();
  fireEvent.click(await screen.findByRole("button", { name: "停止 scan" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("停止失败：子智能体已经结束");
});

it("navigates within the panel while rejecting stale transcript responses", async () => {
  let finishOld!: (value: never[]) => void;
  const transcript = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValue([]);
  overrideBridge({ "sessions.getSubagents": vi.fn().mockResolvedValue([item("first", "idle"), item("second", "ended")]), "sessions.getSubAgentTranscript": transcript });
  const { unmount } = panel();
  await screen.findByText("其他 · 2");
  fireEvent.click(row("first"));
  await waitFor(() => expect(transcript).toHaveBeenCalledTimes(1));
  // 记录按子智能体 id 和记录文件路径取。
  expect(transcript.mock.calls[0][0]).toEqual({ transcriptRef: { kind: "subagent_transcript", sessionId: "parent", agentRunId: "", runId: "first", path: "/data/sessions/first.jsonl" } });
  fireEvent.click(screen.getByRole("button", { name: "返回子 Agent 列表" }));
  fireEvent.click(row("second"));
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
    "sessions.getSubagents": vi.fn().mockResolvedValue([item("first", "ended")]),
    "sessions.getSubAgentTranscript": vi.fn().mockResolvedValue(blocks),
  });
  panel();
  fireEvent.click(await screen.findByRole("button", { name: /^first/ }));
  await screen.findByText("Done reading.");
  const flow = screen.getByLabelText("子 Agent 执行内容").querySelector(".message-flow")!;
  expect(Array.from(flow.children).map((child) => child.getAttribute("data-flow-kind"))).toEqual(["process", "prose"]);
});

it("keeps retrying a finished agent's transcript before falling back to its result", async () => {
  const blocks = [{ kind: "assistant", id: "a1", content: "Final **answer**.", createdAt: "now" }] as MessageBlock[];
  const transcript = vi.fn().mockRejectedValueOnce(new Error("busy")).mockResolvedValueOnce([]).mockResolvedValue(blocks);
  overrideBridge({
    "sessions.getSubagents": vi.fn().mockResolvedValue([item("first", "ended", { result: "# raw result" })]),
    "sessions.getSubAgentTranscript": transcript,
  });
  panel();
  fireEvent.click(await screen.findByRole("button", { name: /^first/ }));
  expect(await screen.findByText("answer", {}, { timeout: 4000 })).toBeInTheDocument();
  expect(transcript).toHaveBeenCalledTimes(3);
  expect(screen.queryByText("raw result")).toBeNull();
}, 8000);

it("opens a focused agent on its trajectory and toggles between trajectory and conversation", async () => {
  const transcript = vi.fn().mockResolvedValue([]);
  overrideBridge({ "sessions.getSubagents": vi.fn().mockResolvedValue([item("first", "ended"), item("second", "ended")]), "sessions.getSubAgentTranscript": transcript });
  panel({ agentId: "second", view: "trajectory", revision: 1 });
  expect(screen.getByRole("status")).toHaveTextContent("正在加载子智能体…");
  const trajectory = await screen.findByTestId("child-trajectory");
  expect(trajectory).toHaveAttribute("data-session", "second");
  expect(trajectory).toHaveAttribute("data-variant", "panel");
  expect(trajectory).toHaveAttribute("data-after", "");
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
  fireEvent.click(row("first"));
  expect(screen.getByRole("button", { name: "查看执行轨迹" })).toBeInTheDocument();
  expect(screen.queryByTestId("child-trajectory")).toBeNull();
});

it("shows where a fork split off and hands the boundary to its trajectory", async () => {
  overrideBridge({
    "sessions.getSubagents": vi.fn().mockResolvedValue([item("branch", "idle", { kind: "fork", preset: undefined, inheritedThroughSeq: 42 })]),
    "sessions.getSubAgentTranscript": vi.fn().mockResolvedValue([]),
  });
  panel({ agentId: "branch", view: "trajectory", revision: 1 });
  expect(await screen.findByText("从主会话 #42 分出")).toBeInTheDocument();
  expect(screen.getByTestId("child-trajectory")).toHaveAttribute("data-after", "42");
});

it("shows an external agent's result and native record file without a trajectory toggle", async () => {
  const reveal = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
  const transcript = vi.fn();
  overrideBridge({
    "sessions.getSubagents": vi.fn().mockResolvedValue([item("codex-1", "ended", { kind: "codex", preset: undefined, result: "Ported the **parser**.", transcriptPath: "/home/.codex/sessions/rollout-1.jsonl" })]),
    "sessions.getSubAgentTranscript": transcript,
    "sessions.revealSubagentRecord": reveal,
  });
  panel({ agentId: "codex-1", view: "chat", revision: 1 });
  expect(await screen.findByText("parser")).toBeInTheDocument();
  expect(screen.getByText("Codex 记录文件")).toBeInTheDocument();
  expect(screen.getByText("/home/.codex/sessions/rollout-1.jsonl")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "查看执行轨迹" })).toBeNull();
  expect(transcript).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "在 Finder 中显示" }));
  await waitFor(() => expect(reveal).toHaveBeenCalledWith({ sessionId: "parent", agentId: "codex-1" }));
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "在 Finder 中显示" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("找不到这个记录文件");
});

it("stops a running agent from its detail footer", async () => {
  const interrupt = vi.fn().mockResolvedValue({ ok: true });
  overrideBridge({
    "sessions.getSubagents": vi.fn().mockResolvedValue([item("scan", "running")]),
    "sessions.getSubAgentTranscript": vi.fn().mockResolvedValue([]),
    "sessions.interruptSubagent": interrupt,
  });
  panel({ agentId: "scan", view: "chat", revision: 1 });
  fireEvent.click(await screen.findByRole("button", { name: "停止" }));
  await waitFor(() => expect(interrupt).toHaveBeenCalledWith({ sessionId: "parent", agentId: "scan" }));
});

it("returns to the list with a note when the focused agent is not found", async () => {
  overrideBridge({ "sessions.getSubagents": vi.fn().mockResolvedValue([item("first", "ended")]), "sessions.getSubAgentTranscript": vi.fn().mockResolvedValue([]) });
  panel({ agentId: "gone", view: "trajectory", revision: 1 });
  expect(await screen.findByText("找不到这个子智能体。")).toBeInTheDocument();
  expect(screen.getByText("其他 · 1")).toBeInTheDocument();
});
