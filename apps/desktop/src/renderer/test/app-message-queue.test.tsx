import type { FixtureRunInput, FixtureCompactionInput, FixtureCompactionResult } from "./task-host-fixture";
import type { TaskSnapshot, TaskCommand, SubmitTaskInput, TaskContentEnvelope } from "@actspace/shared/runtime-v2";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AgentRunResult,
  BootstrapState,
  RuntimeStreamEvent,
  SessionEvent,
  SessionRecord,
} from "@actspace/shared";
import { createMessageBlocks } from "@actspace/shared";
import { App } from "../App";
import { TooltipProvider } from "../components/ui/Tooltip";
import { recordProjectionFixture } from "./projection-fixture";
import { overrideBridge, setupBridge } from "./helpers/bridge";
import { projectRecord } from "./helpers/session-records";
import { transcriptShadow } from "./helpers/transcript-shadow";

// 14 T15：每次 durable / live 合并都与旧实现对照，不一致就让用例失败（见 helpers/transcript-shadow.ts）。
vi.mock("../session/transcript", async (importOriginal) => (await import("./helpers/transcript-shadow")).shadowTranscript(await importOriginal()));
afterEach(() => { expect(transcriptShadow.mismatches.splice(0)).toEqual([]); });

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

type PendingRun = { input: FixtureRunInput; resolve: (result: AgentRunResult) => void };

function setupQueueFixture() {
  const records = new Map([
    ["queue-a", createRecord("queue-a", "Queue A")],
    ["queue-b", createRecord("queue-b", "Queue B")],
  ]);
  let emit!: (event: RuntimeStreamEvent) => void;
  let seq = 0;
  const states = new Map<string, TaskSnapshot>();
  const live = new Set<(event: any) => void>();
  const state = (id: string) => { if (!states.has(id)) states.set(id, { sessionId: id, revision: 0, paused: false, tasks: [], queue: [], runs: [] }); return states.get(id)!; };
  const publish = (id: string, next: TaskSnapshot) => { states.set(id, { ...next, revision: state(id).revision + 1 }); for (const fn of live) fn({ event: { kind: "journal-update", message: "task-queue-updated", sessionId: id } }); };
  // Host 用客户端申请的 run id 开始任务（空闲发送的乐观 run，§5.5）；`hold` 时先不开始，留在 pending。
  const requested = new Map<string, string>();
  const rewinds: NonNullable<SubmitTaskInput["rewind"]>[] = [];
  let hold = false;
  const schedule = (id: string) => {
    const current = state(id);
    if (hold || pending.has(id) || current.paused || !current.queue.length) return;
    const task = current.tasks.find(task => task.taskId === current.queue[0])!;
    const original = (task.content as TaskContentEnvelope).original as { userInput: string };
    if (original.userInput === "/compact") { void executeCompaction({ sessionId: id, agentRunId: "compact" }); publish(id, { ...current, queue: current.queue.slice(1), tasks: current.tasks.map(item => item === task ? { ...item, state: "completed" } : item) }); return; }
    const agentRunId = requested.get(task.taskId) ?? `host-${task.taskId}`;
    publish(id, { ...current, queue: current.queue.slice(1), tasks: current.tasks.map(item => item === task ? { ...item, state: "claimed", runId: agentRunId } : item) });
    void startExecution({ sessionId: id, agentRunId, userInput: original.userInput });
  };
  const submitTask = vi.fn(async (input: SubmitTaskInput) => {
    const current = state(input.sessionId); const taskId = input.submissionId;
    if (input.agentRunId) requested.set(taskId, input.agentRunId);
    if (input.rewind) {
      // Host 侧回退：日志截到被编辑轮之前（agent-edit-resend-rewind.md §3）。
      const record = records.get(input.sessionId)!;
      const cut = record.events.findIndex(event => event.agentRunId === input.rewind!.runId);
      const events = record.events.slice(0, cut);
      records.set(input.sessionId, { ...record, events, messageBlocks: createMessageBlocks(events) });
      rewinds.push(input.rewind);
    }
    const task = { taskId, submissionId: taskId, content: { kind: "composer-task", original: { userInput: input.userInput }, prepared: input.userInput }, acceptedSeq: ++seq, state: "pending" as const, targetRunId: null, runId: null, continuationOf: null };
    publish(input.sessionId, { ...current, tasks: [...current.tasks, task], queue: [...current.queue, taskId] });
    schedule(input.sessionId);
    return { task, revision: state(input.sessionId).revision, durableSeq: seq };
  });
  const taskCommand = vi.fn(async (input: TaskCommand) => {
    const current = state(input.sessionId);
    if (input.op === "designate") {
      const task = current.tasks.find(task => task.taskId === input.taskId)!;
      if (input.runId) {
        const result = await designateSupplement(input);
        if (!result) return { snapshot: current, error: "RUN_NOT_ACTIVE" };
      } else await clearDesignation(input);
      publish(input.sessionId, { ...current, tasks: current.tasks.map(item => item.taskId === input.taskId ? { ...item, targetRunId: input.runId } : item) });
    }
    if (input.op === "cancel") publish(input.sessionId, { ...current, queue: current.queue.filter(id => id !== input.taskId), tasks: current.tasks.map(item => item.taskId === input.taskId ? { ...item, state: "cancelled" } : item) });
    if (input.op === "resume") { publish(input.sessionId, { ...current, paused: false }); schedule(input.sessionId); }
    return { snapshot: state(input.sessionId) };
  });
  const pending = new Map<string, PendingRun>();
  const startExecution = vi.fn((input: FixtureRunInput) => new Promise<AgentRunResult>((resolve) => {
    pending.set(input.sessionId, { input, resolve });
    const current = state(input.sessionId);
    publish(input.sessionId, { ...current, runs: [...current.runs, { runId: input.agentRunId, taskId: "initial", configuration: {}, harness: { harnessId: "main", generationId: "fixture", revision: 1 }, state: "running", result: null }] });
    emit({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
  }));
  const executeCompaction = vi.fn(async (input: FixtureCompactionInput) => ({
    sessionId: input.sessionId, agentRunId: input.agentRunId, status: "skipped" as const,
    events: [], contextSnapshot: emptySnapshot, contextState: null,
  }));
  const designateSupplement = vi.fn(async (_input: Extract<TaskCommand, { op: "designate" }>) => true);
  const clearDesignation = vi.fn(async (_input: Extract<TaskCommand, { op: "designate" }>) => {});
  const abort = vi.fn(async () => true);

  setupBridge({
    "tasks.command": taskCommand, "tasks.submit": submitTask,
    "events.sessionLive": (callback: any) => { live.add(callback); return () => live.delete(callback); },
    "app.getBootstrapState": async () => bootstrapState,
    "settings.get": async () => ({ version: 1, defaultModelId: null, providers: {}, searchProviders: {}, agent: {}, skills: { disabled: [] } }),
    "sessions.list": async () => [...records.values()].map((record) => ({
      id: record.meta.id, title: record.meta.title, updatedAt: record.meta.updatedAt, agentRunCount: record.meta.agentRunCount,
      workspaceRoot: "/tmp/workspace",
    })),
    "sessions.get": projectRecord(async ({ sessionId }: { sessionId: string }) => records.get(sessionId) ?? null),
    "sessions.getPage": async ({ sessionId }: { sessionId: string }) => recordProjectionFixture(records.get(sessionId)!),
    "sessions.create": projectRecord(async () => records.get("queue-a")!),
    "tasks.abort": abort,
    "approvals.listPending": async () => [],
    "usage.getStatistics": async () => null,
    "review.getSnapshot": async () => ({ ok: false, reason: "not_git_repository" }),
    "appearance.setUiZoom": () => {},
    "appearance.setNativeTheme": () => {},
    "events.shuttingDown": () => () => {},
    "events.agentStream": (callback: typeof emit) => { emit = callback; return () => {}; },
  });

  const event = (sessionId: string, value: Record<string, unknown>) => {
    if (value.type === "user_message_steered") {
      const current = state(sessionId); publish(sessionId, { ...current, queue: current.queue.filter(id => id !== value.messageId), tasks: current.tasks.map(task => task.taskId === value.messageId ? { ...task, state: "claimed", targetRunId: null, runId: pending.get(sessionId)!.input.agentRunId } : task) });
    }
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
    const current = state(sessionId); publish(sessionId, { ...current, paused: status !== "completed", runs: current.runs.map(run => run.runId === input.agentRunId ? { ...run, state: status === "aborted" ? "cancelled" : status } : run), tasks: current.tasks.map(task => ({ ...task, targetRunId: null, state: task.runId === input.agentRunId ? status === "aborted" ? "cancelled" : status : task.state })) });
    resolve({ sessionId, agentRunId: input.agentRunId, status, events, contextSnapshot: emptySnapshot });
    schedule(sessionId);
  };
  const sentTexts = () => startExecution.mock.calls.map(([input]) => input.userInput);
  const seedTasks = (id: string, tasks: TaskSnapshot["tasks"]) => { states.set(id, { ...state(id), tasks }); };
  const holdStart = (value: boolean, sessionId = "queue-a") => { hold = value; if (!value) schedule(sessionId); };
  const seedTurns = (sessionId: string, turns: readonly [runId: string, prompt: string][]) => {
    const record = records.get(sessionId)!; const timestamp = new Date().toISOString();
    const events: SessionEvent[] = turns.flatMap(([runId, prompt]) => [
      { id: `v2-${++seq}`, sessionId, agentRunId: runId, type: "user_message" as const, timestamp, schemaVersion: 2 as const, payload: { content: prompt } },
      { id: `v2-${++seq}`, sessionId, agentRunId: runId, type: "assistant_message" as const, timestamp, schemaVersion: 2 as const, payload: { content: `reply to ${prompt}` } },
    ]);
    records.set(sessionId, { ...record, meta: { ...record.meta, agentRunCount: turns.length }, events, messageBlocks: createMessageBlocks(events) });
  };
  const liveEvent = (event: unknown) => { for (const fn of live) fn({ event }); };
  return { holdStart, rewinds, seedTurns, liveEvent, records, pending, startExecution, submitTask, taskCommand, seedTasks, executeCompaction, designateSupplement, clearDesignation, abort, event, finish, sentTexts, nextSeq: () => ++seq };
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
  it("hydrates an active task without duplicating its persisted user message", async () => {
    const fixture = setupQueueFixture();
    const record = fixture.records.get("queue-a")!;
    const text = "reload active task input";
    record.events = [{ id: "durable-user", sessionId: "queue-a", agentRunId: "recovered-run", type: "user_message", timestamp: new Date().toISOString(), schemaVersion: 2, payload: { content: text } }];
    record.messageBlocks = createMessageBlocks(record.events);
    const snapshot: TaskSnapshot = {
      sessionId: "queue-a", revision: 4, paused: false, queue: [],
      tasks: [{ taskId: "accepted-task", submissionId: "accepted-task", acceptedSeq: 1, state: "claimed", targetRunId: null, runId: "recovered-run", continuationOf: null,
        content: { kind: "composer-task", original: { userInput: text }, prepared: text } }],
      runs: [{ runId: "recovered-run", taskId: "accepted-task", state: "running", result: null, configuration: {}, harness: { harnessId: "main", generationId: "fixture", revision: 1 } }],
    };
    overrideBridge({ "tasks.command": vi.fn(async () => ({ snapshot })) });
    renderApp();
    await selectSession("queue-a", "Queue A");
    await screen.findByLabelText("停止 Agent");
    await waitFor(() => expect(screen.getAllByText(text)).toHaveLength(1));
    expect(fixture.submitTask).not.toHaveBeenCalled();
  });

  // agent-edit-resend-rewind.md §5.5：空闲时发送不经过托盘，用户消息马上出现在消息流里。
  it("shows an idle send in the message flow right away and never in the queue tray", async () => {
    const fixture = setupQueueFixture();
    fixture.holdStart(true);
    renderApp();
    await selectSession("queue-a", "Queue A");
    await userEvent.type(await screen.findByLabelText("消息输入框"), "idle question");
    await userEvent.click(screen.getByLabelText("发送消息"));
    await waitFor(() => expect(fixture.submitTask).toHaveBeenCalledOnce());
    const agentRunId = fixture.submitTask.mock.calls[0]![0].agentRunId;
    expect(agentRunId).toEqual(expect.any(String));
    // 任务还在 pending（Host 尚未开始）：消息已在消息流里，托盘不出现。
    await waitFor(() => expect(screen.getByText("idle question")).toBeInTheDocument());
    expect(tray()).toBeNull();
    expect(screen.getByLabelText("停止 Agent")).toBeInTheDocument();

    await act(async () => fixture.holdStart(false));
    await waitFor(() => expect(fixture.pending.get("queue-a")?.input.agentRunId).toBe(agentRunId));
    expect(screen.getAllByText("idle question")).toHaveLength(1);
    expect(tray()).toBeNull();
    await act(async () => fixture.finish("queue-a", "completed"));
    await waitFor(() => expect(screen.getByText("reply to idle question")).toBeInTheDocument());
    expect(screen.getAllByText("idle question")).toHaveLength(1);
  });

  it("stopping an idle send before it starts cancels the task and takes the message back out", async () => {
    const fixture = setupQueueFixture();
    fixture.holdStart(true);
    renderApp();
    await selectSession("queue-a", "Queue A");
    await userEvent.type(await screen.findByLabelText("消息输入框"), "never mind");
    await userEvent.click(screen.getByLabelText("发送消息"));
    await waitFor(() => expect(screen.getByText("never mind")).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText("停止 Agent"));
    await waitFor(() => expect(fixture.taskCommand).toHaveBeenCalledWith(expect.objectContaining({ op: "cancel" })));
    await waitFor(() => expect(screen.queryByText("never mind")).toBeNull());
    expect(screen.queryByLabelText("停止 Agent")).toBeNull();
    expect(fixture.startExecution).not.toHaveBeenCalled();
  });

  // agent-edit-resend-rewind.md §5.2、§5.4：从第一轮编辑重发，后面的轮次消失，新提问接着运行。
  it("resends an edited prompt from that turn: later turns disappear and the new prompt runs in their place", async () => {
    const fixture = setupQueueFixture();
    fixture.seedTurns("queue-a", [["run-1", "first prompt"], ["run-2", "second prompt"]]);
    renderApp();
    await selectSession("queue-a", "Queue A");
    await userEvent.click(await screen.findByText("first prompt"));
    const input = await screen.findByRole("textbox", { name: "编辑提问内容" });
    await userEvent.clear(input);
    await userEvent.type(input, "edited prompt{Enter}");
    await waitFor(() => expect(fixture.submitTask).toHaveBeenCalledOnce());
    const submitted = fixture.submitTask.mock.calls[0]![0];
    expect(submitted).toMatchObject({ userInput: "edited prompt", rewind: { runId: "run-1" } });
    expect(submitted.agentRunId).toEqual(expect.any(String));
    await waitFor(() => expect(fixture.pending.get("queue-a")?.input.agentRunId).toBe(submitted.agentRunId));
    await waitFor(() => expect(screen.queryByText("second prompt")).toBeNull());
    expect(screen.queryByText("first prompt")).toBeNull();
    expect(screen.queryByText("reply to second prompt")).toBeNull();
    expect(screen.getAllByText("edited prompt")).toHaveLength(1);
    expect(tray()).toBeNull();
    await act(async () => fixture.finish("queue-a", "completed"));
    await waitFor(() => expect(screen.getByText("reply to edited prompt")).toBeInTheDocument());
    expect(screen.getAllByText("edited prompt")).toHaveLength(1);
  });

  it("keeps the conversation and reopens the editor when the Host refuses the rewind", async () => {
    const fixture = setupQueueFixture();
    fixture.seedTurns("queue-a", [["run-1", "first prompt"], ["run-2", "second prompt"]]);
    const refused = vi.fn(async (_input: SubmitTaskInput) => ({ status: "submission-failed", acknowledgement: "rejected", message: "这段对话有了新内容，看过最新内容后再编辑。" }));
    overrideBridge({ "tasks.submit": refused });
    renderApp();
    await selectSession("queue-a", "Queue A");
    await userEvent.click(await screen.findByText("second prompt"));
    await userEvent.type(await screen.findByRole("textbox", { name: "编辑提问内容" }), " again{Enter}");
    expect(await screen.findByText("这段对话有了新内容，看过最新内容后再编辑。")).toBeInTheDocument();
    expect(refused).toHaveBeenCalledWith(expect.objectContaining({ userInput: "second prompt again", rewind: expect.objectContaining({ runId: "run-2" }) }));
    expect(await screen.findByRole("textbox", { name: "编辑提问内容" })).toHaveValue("second prompt again");
    expect(screen.getByText("first prompt")).toBeInTheDocument();
    expect(screen.getByText("reply to second prompt")).toBeInTheDocument();
    expect(screen.queryByLabelText("停止 Agent")).toBeNull();
  });

  it("reloads the Session when another window rewound it", async () => {
    const fixture = setupQueueFixture();
    fixture.seedTurns("queue-a", [["run-1", "first prompt"], ["run-2", "second prompt"]]);
    renderApp();
    await selectSession("queue-a", "Queue A");
    await screen.findByText("second prompt");
    // 另一个窗口从第二轮重来：日志变短，序号回退。
    const record = fixture.records.get("queue-a")!;
    const events = record.events.slice(0, 2);
    fixture.records.set("queue-a", { ...record, events, messageBlocks: createMessageBlocks(events) });
    act(() => fixture.liveEvent({ kind: "journal-update", sessionId: "queue-a", update: { sessionId: "queue-a", throughJournalSeq: 2, event: { recordKind: "event", seq: 2, type: "session/rewound", eventVersion: 1, criticality: "ignorable", time: new Date().toISOString(), source: { ownerPluginId: "@actspace/core" }, data: {}, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } } }));
    await waitFor(() => expect(screen.queryByText("second prompt")).toBeNull());
    expect(screen.getByText("first prompt")).toBeInTheDocument();
    await waitFor(() => expect(fixture.taskCommand).toHaveBeenCalledWith(expect.objectContaining({ op: "snapshot", sessionId: "queue-a" })));
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
    // 运行中发送的才是排队消息：不带 run id，进托盘。
    expect(fixture.submitTask.mock.calls[1]![0].agentRunId).toBeUndefined();

    expect(within(tray()!).getByRole("img", { name: /^2 条排队/ })).toBeInTheDocument();
    expect(within(tray()!).getByText("second")).toBeInTheDocument();
    expect(input.value).toBe("");
    expect(fixture.startExecution).toHaveBeenCalledTimes(1);

    await act(async () => fixture.finish("queue-a", "completed"));
    await waitFor(() => expect(fixture.sentTexts()).toEqual(["first question", "second"]));
    expect(within(tray()!).getByRole("img", { name: /^1 条排队/ })).toBeInTheDocument();

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
    expect(fixture.startExecution).toHaveBeenCalledTimes(1);

    await userEvent.click(within(tray()!).getByRole("button", { name: "继续发送" }));
    await waitFor(() => expect(fixture.sentTexts()).toEqual(["first question", "after stop"]));
    expect(tray()).toBeNull();
  });

  it("preserves a definitively rejected draft without retrying or retaining a pending submission", async () => {
    const fixture = setupQueueFixture();
    renderApp(); await startFirstRun(fixture);
    fixture.submitTask.mockResolvedValueOnce({ status: "submission-failed", acknowledgement: "rejected", message: "单个文件不能超过 20 MiB。" } as never);
    await queueText("oversized draft");
    await screen.findByText("单个文件不能超过 20 MiB。");
    expect(fixture.submitTask).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("消息输入框")).toHaveValue("oversized draft");
    expect(localStorage.getItem("actspace:pending-submission:queue-a")).toBeNull();
    expect(screen.queryByText("提交结果尚未确认，正在用同一标识核对。")).not.toBeInTheDocument();
  });

  describe("pending submission recovery (14 T20)", () => {
    const KEY = "actspace:pending-submission:queue-a";
    const unknown = { status: "submission-failed", acknowledgement: "unknown" } as never;
    const seedRecord = (id: string, text: string) => localStorage.setItem(KEY, JSON.stringify({
      content: JSON.stringify({ sessionId: "queue-a", userInput: text }), id, createdAt: new Date().toISOString(), draft: { sessionId: "queue-a", text },
    }));

    it("restores an unconfirmed local submission as a draft after remount without resending it", async () => {
      const fixture = setupQueueFixture();
      const view = renderApp(); await startFirstRun(fixture);
      fixture.submitTask.mockResolvedValueOnce(unknown).mockResolvedValueOnce(unknown);
      await queueText("maybe sent");
      await screen.findByText("提交尚未确认，再次发送将核对同一次提交。");
      const record = JSON.parse(localStorage.getItem(KEY)!);
      expect(record.draft.text).toBe("maybe sent");
      view.unmount();
      fixture.submitTask.mockClear();

      renderApp(); await selectSession("queue-a", "Queue A");
      await waitFor(() => expect(screen.getByLabelText("消息输入框")).toHaveValue("maybe sent"));
      expect(screen.getByText("上次提交尚未确认，再次发送将核对同一次提交。")).toBeInTheDocument();
      expect(fixture.taskCommand).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "queue-a", op: "snapshot" }));
      expect(fixture.submitTask).not.toHaveBeenCalled();
      expect(localStorage.getItem(KEY)).not.toBeNull();
    });

    it("only clears the record when the task snapshot already holds the same submission", async () => {
      const fixture = setupQueueFixture();
      fixture.seedTasks("queue-a", [{ taskId: "sub-1", submissionId: "sub-1", content: { kind: "composer-task", original: { userInput: "landed" }, prepared: "landed" }, acceptedSeq: 1, state: "completed", targetRunId: null, runId: null, continuationOf: null }] as TaskSnapshot["tasks"]);
      seedRecord("sub-1", "landed");
      renderApp(); await selectSession("queue-a", "Queue A");
      await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
      expect(screen.getByLabelText("消息输入框")).toHaveValue("");
      expect(screen.queryByText("上次提交尚未确认，再次发送将核对同一次提交。")).not.toBeInTheDocument();
      expect(fixture.submitTask).not.toHaveBeenCalled();
    });

    it("falls back to restoring the draft when the snapshot cannot be read", async () => {
      const fixture = setupQueueFixture();
      seedRecord("sub-2", "offline draft");
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      fixture.taskCommand.mockRejectedValue(new Error("IPC 断开"));
      renderApp(); await selectSession("queue-a", "Queue A");
      await waitFor(() => expect(screen.getByLabelText("消息输入框")).toHaveValue("offline draft"));
      expect(error).toHaveBeenCalledWith("Failed to check pending submission", expect.any(Error));
      expect(fixture.submitTask).not.toHaveBeenCalled();
      expect(localStorage.getItem(KEY)).not.toBeNull();
      error.mockRestore();
    });

    // 复核发现：恢复要等一次快照查询。期间用户开始发送或已经输入了内容，都不能再把记录恢复进输入框。
    const holdSnapshots = (fixture: ReturnType<typeof setupQueueFixture>) => {
      const original = fixture.taskCommand.getMockImplementation()!;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      fixture.taskCommand.mockImplementation(async (input: TaskCommand) => {
        if (input.op === "snapshot") await gate;
        return original(input);
      });
      return () => act(async () => { release(); await Promise.resolve(); });
    };

    it("does not restore the record while the same content is being sent", async () => {
      const fixture = setupQueueFixture();
      seedRecord("sub-4", "in flight");
      const releaseSnapshots = holdSnapshots(fixture);
      const submit = fixture.submitTask.getMockImplementation()!;
      let releaseSubmit!: () => void;
      const submitGate = new Promise<void>((resolve) => { releaseSubmit = resolve; });
      fixture.submitTask.mockImplementationOnce(async (input: SubmitTaskInput) => { await submitGate; return submit(input); });
      renderApp(); await selectSession("queue-a", "Queue A");
      await userEvent.type(screen.getByLabelText("消息输入框"), "in flight");
      await userEvent.click(screen.getByLabelText("发送消息"));
      await waitFor(() => expect(fixture.submitTask).toHaveBeenCalledTimes(1));
      expect(fixture.submitTask.mock.calls[0]![0].submissionId).toBe("sub-4");
      await releaseSnapshots();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(screen.getByLabelText("消息输入框")).toHaveValue("");
      await act(async () => { releaseSubmit(); await Promise.resolve(); });
      await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
      expect(screen.getByLabelText("消息输入框")).toHaveValue("");
      expect(screen.queryByText("上次提交尚未确认，再次发送将核对同一次提交。")).not.toBeInTheDocument();
    });

    it("keeps what the user typed while the snapshot was being checked", async () => {
      const fixture = setupQueueFixture();
      seedRecord("sub-5", "old draft");
      const releaseSnapshots = holdSnapshots(fixture);
      renderApp(); await selectSession("queue-a", "Queue A");
      await userEvent.type(screen.getByLabelText("消息输入框"), "my own words");
      await releaseSnapshots();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(screen.getByLabelText("消息输入框")).toHaveValue("my own words");
      expect(screen.queryByText("上次提交尚未确认，再次发送将核对同一次提交。")).not.toBeInTheDocument();
      expect(localStorage.getItem(KEY)).not.toBeNull();
      expect(fixture.submitTask).not.toHaveBeenCalled();
    });

    it("keeps the attachments the user added while the snapshot was being checked", async () => {
      const fixture = setupQueueFixture();
      overrideBridge({ "dialogs.getPathForFile": (file: File) => `/Users/test/${file.name}` });
      seedRecord("sub-6", "old draft");
      const releaseSnapshots = holdSnapshots(fixture);
      renderApp(); await selectSession("queue-a", "Queue A");
      fireEvent.drop(screen.getByLabelText("消息输入面板"), {
        dataTransfer: { files: [new File(["report"], "report.pdf", { type: "application/pdf" })], types: ["Files"] },
      });
      expect(screen.getByLabelText("已附加的文件 report.pdf")).toBeInTheDocument();
      await releaseSnapshots();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(screen.getByLabelText("消息输入框")).toHaveValue("");
      expect(screen.getByLabelText("已附加的文件 report.pdf")).toBeInTheDocument();
      expect(screen.queryByText("上次提交尚未确认，再次发送将核对同一次提交。")).not.toBeInTheDocument();
      expect(localStorage.getItem(KEY)).not.toBeNull();
    });

    it("reuses the recorded submissionId when the restored draft is sent unchanged", async () => {
      const fixture = setupQueueFixture();
      seedRecord("sub-3", "send again");
      renderApp(); await selectSession("queue-a", "Queue A");
      await waitFor(() => expect(screen.getByLabelText("消息输入框")).toHaveValue("send again"));
      await userEvent.click(screen.getByLabelText("发送消息"));
      await waitFor(() => expect(fixture.submitTask).toHaveBeenCalledTimes(1));
      expect(fixture.submitTask.mock.calls[0]![0].submissionId).toBe("sub-3");
      await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
    });
  });

  it("steers a queued message into the running turn and shows it where it was read", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await act(async () => fixture.event("queue-a", { type: "assistant_text_delta", delta: "working on it" }));
    await queueText("also check tests");

    await userEvent.click(within(tray()!).getByRole("button", { name: "↳ 引导" }));
    const steerInput = fixture.designateSupplement.mock.calls[0]![0];
    expect(steerInput).toMatchObject({ sessionId: "queue-a", op: "designate", runId: fixture.pending.get("queue-a")!.input.agentRunId });
    expect(await within(tray()!).findByText("下一步读取")).toBeInTheDocument();
    expect(within(tray()!).getByRole("img", { name: /1 条已引导/ })).toBeInTheDocument();

    await act(async () => fixture.event("queue-a", { type: "user_message_steered", turnId: "turn-1", messageId: steerInput.taskId }));
    expect(tray()).toBeNull();
    const log = screen.getByText("working on it").closest("[role='log'], main") ?? document.body;
    expect(within(log as HTMLElement).getByText("also check tests")).toBeInTheDocument();

    await act(async () => fixture.finish("queue-a", "completed"));
    await waitFor(() => expect(fixture.clearDesignation).not.toHaveBeenCalled());
    expect(fixture.startExecution).toHaveBeenCalledTimes(1);
  });

  it("returns an unread steer to the top of the queue when the run is stopped", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await queueText("steer me");
    await queueText("later");
    await userEvent.click(within(tray()!).getAllByRole("button", { name: "↳ 引导" })[0]!);
    await within(tray()!).findByText("下一步读取");

    await userEvent.click(screen.getByLabelText("停止 Agent"));
    await act(async () => fixture.finish("queue-a", "aborted"));

    expect(fixture.clearDesignation).not.toHaveBeenCalled(); // Host clears unread designation at terminal commit.
    await waitFor(() => expect(within(tray()!).getByText("已暂停")).toBeInTheDocument());
    const rows = within(tray()!).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("steer me"), expect.stringContaining("later")]);
    expect(fixture.startExecution).toHaveBeenCalledTimes(1);
  });

  it("puts a steer back into the queue when the run already ended or input is rejected", async () => {
    const fixture = setupQueueFixture();
    fixture.designateSupplement.mockResolvedValueOnce(false);
    renderApp();
    await startFirstRun(fixture);
    await queueText("too late");

    await userEvent.click(within(tray()!).getByRole("button", { name: "↳ 引导" }));
    await waitFor(() => expect(within(tray()!).getByRole("img", { name: /^1 条排队/ })).toBeInTheDocument());
    expect(within(tray()!).queryByText("下一步读取")).not.toBeInTheDocument();
  });

  it("withdraws an unread steer back to the queue", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await queueText("changed my mind");
    await userEvent.click(within(tray()!).getByRole("button", { name: "↳ 引导" }));
    await userEvent.click(await within(tray()!).findByRole("button", { name: "撤回" }));

    await waitFor(() => expect(within(tray()!).getByRole("img", { name: /^1 条排队/ })).toBeInTheDocument());
    expect(fixture.clearDesignation).toHaveBeenCalledTimes(1);
  });

  it("disables steering while a tool approval is pending", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await queueText("wait for approval");
    await act(async () => fixture.event("queue-a", {
      type: "tool_approval_required", toolCallId: "tool-1", toolName: "bash", requestId: "approval-1", reason: "run command",
    }));

    await waitFor(() => expect(within(tray()!).getByRole("button", { name: "↳ 引导" })).toBeDisabled());
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
    expect(fixture.startExecution.mock.calls[1]![0].sessionId).toBe("queue-a");
  });

  it("queues /compact as a command without steering", async () => {
    const fixture = setupQueueFixture();
    renderApp();
    await startFirstRun(fixture);
    await userEvent.type(screen.getByLabelText("消息输入框"), "/compact");
    await userEvent.keyboard("{Enter}");

    expect(within(tray()!).getByText("命令")).toBeInTheDocument();
    expect(within(tray()!).queryByRole("button", { name: "↳ 引导" })).not.toBeInTheDocument();

    await act(async () => fixture.finish("queue-a", "completed"));
    await waitFor(() => expect(fixture.executeCompaction).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "queue-a" })));
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
