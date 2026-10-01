import { act, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AgentRunResult,
  BootstrapState,
  CancelSteerInput,
  CancelSteerResult,
  CompactContextInput,
  RunAgentInput,
  RuntimeStreamEvent,
  SessionEvent,
  SessionRecord,
  SteerAgentRunInput,
  SteerAgentRunResult,
} from "@actspace/shared";
import { createMessageBlocks } from "@actspace/shared";
import { App } from "../App";
import { TooltipProvider } from "../components/ui/Tooltip";
import { recordProjectionFixture } from "./projection-fixture";

const bootstrapState: BootstrapState = {
  appVersion: "0.1.0",
  dataRoot: "/tmp/actspace",
  sessionRoot: "/tmp/actspace/sessions",
  logRoot: "/tmp/actspace/logs",
  tmpRoot: "/tmp/actspace/tmp",
  workspaceRoot: "/tmp/workspace",
};

const emptySnapshot = { totalTokens: 0, maxTokens: 200_000, percentUsed: 0, buckets: [] };

function createRecord(id: string, title: string): SessionRecord {
  const now = new Date().toISOString();
  return {
    meta: { schemaVersion: 2, id, title, createdAt: now, updatedAt: now, agentRunCount: 0 },
    events: [],
    messageBlocks: [],
    contextSnapshot: null,
    contextState: null,
  };
}

type PendingRun = { input: RunAgentInput; resolve: (result: AgentRunResult) => void };

function setupQueueFixture() {
  const records = new Map([
    ["queue-a", createRecord("queue-a", "Queue A")],
    ["queue-b", createRecord("queue-b", "Queue B")],
  ]);
  let emit!: (event: RuntimeStreamEvent) => void;
  let seq = 0;
  const pending = new Map<string, PendingRun>();
  const runAgent = vi.fn((input: RunAgentInput) => new Promise<AgentRunResult>((resolve) => {
    pending.set(input.sessionId, { input, resolve });
    emit({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
  }));
  const compactContext = vi.fn(async (input: CompactContextInput) => ({
    sessionId: input.sessionId, agentRunId: input.agentRunId, status: "skipped" as const,
    events: [], contextSnapshot: emptySnapshot, contextState: null,
  }));
  const steerAgentRun = vi.fn(async (input: SteerAgentRunInput): Promise<SteerAgentRunResult> => ({
    status: "accepted", sessionId: input.sessionId, agentRunId: input.agentRunId, messageId: input.messageId,
  }));
  const cancelSteer = vi.fn(async (_input: CancelSteerInput): Promise<CancelSteerResult> => ({ status: "cancelled" }));
  const abort = vi.fn(async () => true);

  window.actspace = {
    getBootstrapState: async () => bootstrapState,
    getSettings: async () => ({ version: 1, defaultModelId: null, providers: {}, searchProviders: {}, agent: {}, skills: { disabled: [] } }),
    listSessions: async () => [...records.values()].map((record) => ({
      id: record.meta.id, title: record.meta.title, updatedAt: record.meta.updatedAt, agentRunCount: record.meta.agentRunCount,
    })),
    getSession: async ({ sessionId }: { sessionId: string }) => records.get(sessionId) ?? null,
    getSessionPage: async ({ sessionId }: { sessionId: string }) => recordProjectionFixture(records.get(sessionId)!),
    createSession: async () => records.get("queue-a")!,
    abortAgentRun: abort,
    listPendingApprovals: async () => [],
    getUsageStatistics: async () => null,
    describeContext: async () => null,
    getReviewSnapshot: async () => ({ ok: false, reason: "not_git_repository" }),
    setUiZoom: () => {},
    setNativeTheme: () => {},
    onShuttingDown: () => () => {},
    onAgentStream: (callback: typeof emit) => { emit = callback; return () => {}; },
    runAgent,
    compactContext,
    steerAgentRun,
    cancelSteer,
  } as unknown as Window["actspace"];

  const event = (sessionId: string, value: Record<string, unknown>) => {
    emit({ sessionId, agentRunId: pending.get(sessionId)!.input.agentRunId, ...value } as RuntimeStreamEvent);
  };
  const finish = (sessionId: string, status: AgentRunResult["status"], extra: SessionEvent[] = []) => {
    const { input, resolve } = pending.get(sessionId)!;
    const record = records.get(sessionId)!;
    const timestamp = new Date().toISOString();
    const events: SessionEvent[] = [
      ...record.events,
      { id: `v2-${++seq}`, sessionId, agentRunId: input.agentRunId, type: "user_message", timestamp, schemaVersion: 2, payload: { content: input.userInput } },
      ...extra,
      { id: `v2-${++seq}`, sessionId, agentRunId: input.agentRunId, type: "assistant_message", timestamp, schemaVersion: 2, payload: { content: `reply to ${input.userInput}` } },
    ];
    records.set(sessionId, { ...record, meta: { ...record.meta, agentRunCount: record.meta.agentRunCount + 1 }, events, messageBlocks: createMessageBlocks(events) });
    event(sessionId, { type: status === "completed" ? "agent_run_finished" : status === "aborted" ? "agent_run_aborted" : "agent_run_failed" });
    pending.delete(sessionId);
    resolve({ sessionId, agentRunId: input.agentRunId, status, events, contextSnapshot: emptySnapshot });
  };
  const sentTexts = () => runAgent.mock.calls.map(([input]) => input.userInput);
  return { records, pending, runAgent, compactContext, steerAgentRun, cancelSteer, abort, event, finish, sentTexts, nextSeq: () => ++seq };
}

function renderApp() {
  return render(
    <TooltipProvider delayDuration={0}>
      <App />
    </TooltipProvider>,
  );
}

async function selectSession(id: string, title: string) {
  const row = await waitFor(() => {
    const element = document.querySelector(`[data-session-id="${id}"]`);
    if (!element) throw new Error(`session row ${id} not rendered`);
    return element as HTMLElement;
  });
  await userEvent.click(within(row).getByRole("button", { name: title }));
}

async function startFirstRun(fixture: ReturnType<typeof setupQueueFixture>, text = "first question") {
  await selectSession("queue-a", "Queue A");
  await userEvent.type(await screen.findByLabelText("消息输入框"), text);
  await userEvent.click(screen.getByLabelText("发送消息"));
  await waitFor(() => expect(fixture.pending.has("queue-a")).toBe(true));
}

async function queueText(text: string) {
  const input = screen.getByLabelText("消息输入框");
  await userEvent.type(input, text);
  await userEvent.keyboard("{Enter}");
}

const tray = () => screen.queryByRole("region", { name: "消息队列" });

describe("App message queue", () => {
  afterEach(() => {
    delete (window as unknown as { actspace?: unknown }).actspace;
  });

  it("queues messages while running and sends them one turn at a time after completion", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);

    const input = screen.getByLabelText("消息输入框") as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    expect(screen.getByLabelText("停止 Agent")).toBeInTheDocument();
    await userEvent.type(input, "second");
    // 输入框有内容时仍是 ↑，只是语义变成加入队列。
    expect(screen.queryByLabelText("停止 Agent")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("加入队列"));
    await queueText("third");

    expect(within(tray()!).getByText("2 条排队")).toBeInTheDocument();
    expect(within(tray()!).getByText("second")).toBeInTheDocument();
    expect(input.value).toBe("");
    expect(fixture.runAgent).toHaveBeenCalledTimes(1);

    await act(async () => fixture.finish("queue-a", "completed"));
    await waitFor(() => expect(fixture.sentTexts()).toEqual(["first question", "second"]));
    expect(within(tray()!).getByText("1 条排队")).toBeInTheDocument();

    await act(async () => fixture.finish("queue-a", "completed"));
    await waitFor(() => expect(fixture.sentTexts()).toEqual(["first question", "second", "third"]));
    expect(tray()).toBeNull();
  });

  it("pauses the queue after stop and resumes when the user continues", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await queueText("after stop");

    await userEvent.click(screen.getByLabelText("停止 Agent"));
    await act(async () => fixture.finish("queue-a", "aborted"));

    await waitFor(() => expect(within(tray()!).getByText("已暂停")).toBeInTheDocument());
    expect(fixture.runAgent).toHaveBeenCalledTimes(1);

    await userEvent.click(within(tray()!).getByRole("button", { name: "继续发送" }));
    await waitFor(() => expect(fixture.sentTexts()).toEqual(["first question", "after stop"]));
    expect(tray()).toBeNull();
  });

  it("steers a queued message into the running turn and shows it where it was read", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await act(async () => fixture.event("queue-a", { type: "assistant_text_delta", delta: "working on it" }));
    await queueText("also check tests");

    await userEvent.click(within(tray()!).getByRole("button", { name: "↳ 插入" }));
    const steerInput = fixture.steerAgentRun.mock.calls[0]![0];
    expect(steerInput).toMatchObject({ sessionId: "queue-a", userInput: "also check tests", agentRunId: fixture.pending.get("queue-a")!.input.agentRunId });
    expect(await within(tray()!).findByText("下一步读取")).toBeInTheDocument();
    expect(within(tray()!).getByText("1 条已插入")).toBeInTheDocument();

    await act(async () => fixture.event("queue-a", { type: "user_message_steered", turnId: "turn-1", messageId: steerInput.messageId }));
    expect(tray()).toBeNull();
    const log = screen.getByText("working on it").closest("[role='log'], main") ?? document.body;
    expect(within(log as HTMLElement).getByText("also check tests")).toBeInTheDocument();

    await act(async () => fixture.finish("queue-a", "completed"));
    await waitFor(() => expect(fixture.cancelSteer).not.toHaveBeenCalled());
    expect(fixture.runAgent).toHaveBeenCalledTimes(1);
  });

  it("returns an unread steer to the top of the queue when the run is stopped", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await queueText("steer me");
    await queueText("later");
    await userEvent.click(within(tray()!).getAllByRole("button", { name: "↳ 插入" })[0]!);
    await within(tray()!).findByText("下一步读取");

    await userEvent.click(screen.getByLabelText("停止 Agent"));
    await act(async () => fixture.finish("queue-a", "aborted"));

    await waitFor(() => expect(fixture.cancelSteer).toHaveBeenCalledWith({ sessionId: "queue-a", messageId: fixture.steerAgentRun.mock.calls[0]![0].messageId }));
    await waitFor(() => expect(within(tray()!).getByText("已暂停")).toBeInTheDocument());
    const rows = within(tray()!).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("steer me"), expect.stringContaining("later")]);
    expect(fixture.runAgent).toHaveBeenCalledTimes(1);
  });

  it("puts a steer back into the queue when the run already ended or input is rejected", async () => {
    const fixture = setupQueueFixture();
    fixture.steerAgentRun.mockImplementationOnce(async (input) => ({
      status: "unavailable", sessionId: input.sessionId, agentRunId: input.agentRunId, messageId: input.messageId,
    }));
    renderApp();
    await startFirstRun(fixture);
    await queueText("too late");

    await userEvent.click(within(tray()!).getByRole("button", { name: "↳ 插入" }));
    await waitFor(() => expect(within(tray()!).getByText("1 条排队")).toBeInTheDocument());
    expect(within(tray()!).queryByText("下一步读取")).not.toBeInTheDocument();
  });

  it("withdraws an unread steer back to the queue", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await queueText("changed my mind");
    await userEvent.click(within(tray()!).getByRole("button", { name: "↳ 插入" }));
    await userEvent.click(await within(tray()!).findByRole("button", { name: "撤回" }));

    await waitFor(() => expect(within(tray()!).getByText("1 条排队")).toBeInTheDocument());
    expect(fixture.cancelSteer).toHaveBeenCalledTimes(1);
  });

  it("disables steering while a tool approval is pending", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await queueText("wait for approval");
    await act(async () => fixture.event("queue-a", {
      type: "tool_approval_required", toolCallId: "tool-1", toolName: "bash", requestId: "approval-1", reason: "run command",
    }));

    await waitFor(() => expect(within(tray()!).getByRole("button", { name: "↳ 插入" })).toBeDisabled());
  });

  it("auto-sends a background session queue after its run completes", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await queueText("background follow-up");
    await selectSession("queue-b", "Queue B");
    expect(tray()).toBeNull();

    await act(async () => fixture.finish("queue-a", "completed"));
    await waitFor(() => expect(fixture.sentTexts()).toEqual(["first question", "background follow-up"]));
    expect(fixture.runAgent.mock.calls[1]![0].sessionId).toBe("queue-a");
  });

  it("queues /compact as a command without steering", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await userEvent.type(screen.getByLabelText("消息输入框"), "/compact");
    await userEvent.keyboard("{Enter}");

    expect(within(tray()!).getByText("命令")).toBeInTheDocument();
    expect(within(tray()!).queryByRole("button", { name: "↳ 插入" })).not.toBeInTheDocument();

    await act(async () => fixture.finish("queue-a", "completed"));
    await waitFor(() => expect(fixture.compactContext).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "queue-a" })));
  });

  it("edits a queued message back into the empty input", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await queueText("fix wording");

    await userEvent.click(within(tray()!).getByRole("button", { name: "更多操作：排队消息 1" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "编辑" }));

    expect(tray()).toBeNull();
    await waitFor(() => expect((screen.getByLabelText("消息输入框") as HTMLTextAreaElement).value).toBe("fix wording"));
  });
});
