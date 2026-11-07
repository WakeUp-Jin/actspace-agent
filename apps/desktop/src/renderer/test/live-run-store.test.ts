import { describe, expect, it, vi } from "vitest";
import type { TaskSnapshot } from "@actspace/shared/runtime-v2";
import { createBoundedSet, createLiveRunStore, TERMINAL_RUN_LIMIT } from "../session/live-runs/live-run-store";
import { createEmptyStreamingState, type SessionRunState } from "../session/session-run-state";
import { applyTaskSnapshot, createTaskQueueStore } from "../session/task-queue";

// 14 T16：live run 与任务队列缓存从 App 迁出后的行为。
function run(sessionId: string, agentRunId: string): SessionRunState {
  return { sessionId, agentRunId, state: createEmptyStreamingState(), userBlock: null, aborting: false };
}

describe("live run store", () => {
  it("forgets the oldest terminal runId past the limit while still rejecting recent ones", () => {
    const store = createLiveRunStore();
    for (let index = 0; index <= TERMINAL_RUN_LIMIT; index++) store.markTerminal(`run-${index}`);
    expect(store.isTerminal("run-0")).toBe(false);
    expect(store.isTerminal("run-1")).toBe(true);
    expect(store.isTerminal(`run-${TERMINAL_RUN_LIMIT}`)).toBe(true);
  });

  it("refreshes a re-marked runId to newest so it outlives older ones", () => {
    const set = createBoundedSet(3);
    set.add("a"); set.add("b"); set.add("c");
    set.add("a");
    set.add("d");
    expect(["a", "b", "c", "d"].filter(set.has)).toEqual(["a", "c", "d"]);
    expect(set.size).toBe(3);
  });

  it("tracks busy sessions and keeps the busy set and view stable until something changes", () => {
    const store = createLiveRunStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const idleBusy = store.busyIds();
    const first = run("s1", "run-1");
    store.start(first);
    expect(store.busyIds()).not.toBe(idleBusy);
    expect([...store.busyIds()]).toEqual(["s1"]);

    first.state.segments.push({ type: "text", text: "hello" });
    const before = store.view("s1");
    // 就地修改后不 refresh，视图保持缓存；refresh 之后重算。
    expect(store.view("s1")).toBe(before);
    store.refresh("s1");
    const after = store.view("s1");
    expect(after).not.toBe(before);
    expect(after).toMatchObject({ isStreaming: true, runId: "run-1", recovered: false });
    expect(after.blocks.map((block) => block.kind)).toEqual(["assistant"]);
    expect(store.view("s1")).toBe(after);
    const busy = store.busyIds();
    store.refresh("s1");
    expect(store.busyIds()).toBe(busy);
    expect(listener).toHaveBeenCalled();
  });

  it("ends a run only while it is still the session's run", () => {
    const store = createLiveRunStore();
    const stale = run("s1", "run-1");
    store.start(stale);
    // 替换同一会话的 run 不改变 busy 成员，Set 引用保持不变。
    const busy = store.busyIds();
    store.start(run("s1", "run-2"));
    expect(store.busyIds()).toBe(busy);
    expect(store.end("s1", stale)).toBe(false);
    expect(store.view("s1").runId).toBe("run-2");
    expect(store.end("s1")).toBe(true);
    expect(store.view("s1")).toMatchObject({ isStreaming: false, runId: null, blocks: [] });
    expect(store.busyIds().has("s1")).toBe(false);
  });

  it("puts the task-snapshot user block first and shows the steered message where it was read", () => {
    const store = createLiveRunStore();
    const current = run("s1", "run-1");
    current.userBlock = { kind: "user", id: "turn:run-1:user:0", runId: "run-1", content: "first", createdAt: "2026-10-06T00:00:00.000Z" };
    store.start(current);
    const onSteered = vi.fn(() => ({ id: "m-1", text: "steer", options: { mode: "agent", selectedSkills: [] } }) as never);
    store.applyStreamEvent({ type: "assistant_text_delta", sessionId: "s1", agentRunId: "run-1", delta: "reply" } as never, onSteered);
    store.applyStreamEvent({ type: "user_message_steered", sessionId: "s1", agentRunId: "run-1", messageId: "m-1" } as never, onSteered);
    // 不属于当前 run 的事件不生效，也不取 steer 正文。
    store.applyStreamEvent({ type: "user_message_steered", sessionId: "s1", agentRunId: "run-old", messageId: "m-2" } as never, onSteered);
    expect(onSteered).toHaveBeenCalledTimes(1);
    expect(store.view("s1").blocks.map((block) => [block.kind, block.id])).toEqual([
      ["user", "turn:run-1:user:0"], ["assistant", "turn:run-1:assistant:0"], ["user", "turn:run-1:steer:m-1"], ["status", "turn:run-1:model-wait"],
    ]);
  });

  it("does not project a sibling bash call as Running while the batch waits on another call's approval", () => {
    const store = createLiveRunStore();
    store.start(run("s1", "run-b"));
    const ids = { sessionId: "s1", agentRunId: "run-b", turnId: "t1", llmCallId: "l1" };
    const bashPreview = (command: string) => ({ kind: "bash", status: "running", title: "Bash command", command, commandPreview: command });
    const apply = (event: Record<string, unknown>) => store.applyStreamEvent({ ...ids, ...event } as never, () => undefined);
    // runtime 对一批调用先全部 prepared；`ls ~/Desktop` 在 stage 里等审批，`ls ~` 还没轮到。
    apply({ type: "tool_call_streaming", toolCallId: "call-a", toolName: "bash", preview: bashPreview("ls ~/Desktop") });
    apply({ type: "tool_call_streaming", toolCallId: "call-b", toolName: "bash", preview: bashPreview("ls ~") });
    apply({ type: "tool_approval_required", toolCallId: "call-a", toolName: "bash", requestId: "approval-a", summary: "List Desktop contents", reason: "Bash command requires approval", command: "ls ~/Desktop" });
    const toolBlocks = () => store.view("s1").blocks.filter((block) => block.kind === "bash");
    expect(toolBlocks().map((block) => [block.id, "status" in block ? block.status : null])).toEqual([["turn:run-b:tool:call-a", "pending"]]);

    // 审批通过、两个调用各自开始执行后，后面的调用才作为运行中出现。
    apply({ type: "tool_approval_resolved", toolCallId: "call-a", decision: "once" });
    apply({ type: "tool_started", toolCallId: "call-a", toolName: "bash", argsPreview: "", preview: bashPreview("ls ~/Desktop") });
    apply({ type: "tool_started", toolCallId: "call-b", toolName: "bash", argsPreview: "", preview: bashPreview("ls ~") });
    expect(toolBlocks().map((block) => "status" in block ? block.status : null)).toEqual(["running", "running"]);
  });

  it("puts the background notice divider first in a wake run and keys it like the durable block", () => {
    const store = createLiveRunStore();
    store.start(run("s1", "run-w"));
    const notice = { taskId: "bash_1", taskKind: "bash", title: "pnpm test", status: "completed" };
    store.applyStreamEvent({ type: "assistant_text_delta", sessionId: "s1", agentRunId: "run-w", delta: "done" } as never, () => undefined);
    store.applyStreamEvent({ type: "background_notice_claimed", sessionId: "s1", agentRunId: "run-w", messageId: "n-1", notice, content: "<task_notification/>" } as never, () => undefined);
    expect(store.view("s1").blocks[0]).toMatchObject({ kind: "background_notice", id: "turn:run-w:background-notice:0", renderKey: "turn:run-w:background-notice:0", ...notice });
  });

  it("keeps a notice read inside a running turn where it was read, numbered after the earlier ones", () => {
    const store = createLiveRunStore();
    store.start(run("s1", "run-r"));
    const claim = (messageId: string, title: string) => store.applyStreamEvent({ type: "background_notice_claimed", sessionId: "s1", agentRunId: "run-r", messageId,
      notice: { taskId: messageId, taskKind: "subagent", title, status: "completed", opensTurn: false }, content: "<subagent_notification/>" } as never, () => undefined);
    store.applyStreamEvent({ type: "assistant_text_delta", sessionId: "s1", agentRunId: "run-r", delta: "working" } as never, () => undefined);
    claim("sa-1", "探索");
    claim("sa-1", "探索");
    claim("sa-2", "Fork");
    expect(store.view("s1").blocks.map((block) => [block.kind, block.id])).toEqual([
      ["assistant", "turn:run-r:assistant:0"],
      ["background_notice", "turn:run-r:background-notice:0"],
      ["background_notice", "turn:run-r:background-notice:1"],
    ]);
  });
});

describe("task queue store", () => {
  const snapshot = (sessionId: string, revision: number, runs: TaskSnapshot["runs"] = []): TaskSnapshot => ({ sessionId, revision, paused: false, queue: [], tasks: [], runs });

  it("keeps newer revisions and releases everything a session held on evict", () => {
    const tasks = createTaskQueueStore();
    expect(tasks.accept(snapshot("s1", 3))).not.toBeNull();
    expect(tasks.accept(snapshot("s1", 2))).toBeNull();
    expect(tasks.snapshot("s1")?.revision).toBe(3);
    tasks.rememberOptions("s1", "sub-1", { mode: "agent", selectedSkills: [] } as never);
    tasks.rememberOptions("s2", "sub-2", { mode: "agent", selectedSkills: [] } as never);
    tasks.rememberSteer("s1", "m-1", { id: "m-1", text: "x" } as never);
    tasks.evict("s1");
    expect(tasks.snapshot("s1")).toBeUndefined();
    expect(tasks.options("sub-1")).toBeUndefined();
    expect(tasks.takeSteer("m-1")).toBeUndefined();
    expect(tasks.options("sub-2")).toBeDefined();
  });

  it("attaches a recovered run from a snapshot and detaches it once the Host reports it finished", () => {
    const tasks = createTaskQueueStore();
    const runs = createLiveRunStore();
    const effects = { tasks, runs, patchLocal: vi.fn(), notice: vi.fn(), refreshSession: vi.fn(), attachLiveBaseline: vi.fn() };
    const running = { runId: "run-1", taskId: "t-1", state: "running", result: null, configuration: {}, harness: { harnessId: "main", generationId: "g", revision: 1 } } as TaskSnapshot["runs"][number];
    applyTaskSnapshot(snapshot("s1", 1, [running]), effects);
    expect(runs.view("s1")).toMatchObject({ isStreaming: true, runId: "run-1", recovered: true });
    expect(effects.attachLiveBaseline).toHaveBeenCalledExactlyOnceWith("s1", "run-1");
    applyTaskSnapshot(snapshot("s1", 2, [running]), { ...effects });
    expect(effects.attachLiveBaseline).toHaveBeenCalledOnce();
    applyTaskSnapshot(snapshot("s1", 3, [{ ...running, state: "completed" } as TaskSnapshot["runs"][number]]), effects);
    expect(runs.has("s1")).toBe(false);
    expect(runs.isTerminal("run-1")).toBe(true);
    expect(effects.patchLocal).toHaveBeenCalledWith("s1", expect.objectContaining({ messageQueue: expect.anything() }));
  });

  // agent-edit-resend-rewind.md §5.5：空闲发送的任务正在开始，不进托盘；它没开始就结束时卸下乐观 run。
  it("keeps the task an optimistic run is starting out of the tray, and drops the run if the task never starts", () => {
    const tasks = createTaskQueueStore();
    const runs = createLiveRunStore();
    const patchLocal = vi.fn();
    const effects = { tasks, runs, patchLocal, notice: vi.fn(), refreshSession: vi.fn() };
    const task = (taskId: string, submissionId: string, state: string) => ({ taskId, submissionId, content: { kind: "composer-task", original: { userInput: taskId }, prepared: taskId }, acceptedSeq: 1, state, targetRunId: null, runId: null, continuationOf: null });
    tasks.rememberOptions("s1", "sub-a", { mode: "agent", selectedSkills: [] } as never, "optimistic-run");
    expect(tasks.requestedRun("sub-a")).toBe("optimistic-run");
    const optimistic = run("s1", "optimistic-run");
    runs.start(optimistic);
    const pending = { ...snapshot("s1", 1), queue: ["a", "b"], tasks: [task("a", "sub-a", "pending"), task("b", "sub-b", "pending")] } as unknown as TaskSnapshot;
    applyTaskSnapshot(pending, effects);
    expect(patchLocal.mock.calls.at(-1)![1].messageQueue.items.map((item: { id: string }) => item.id)).toEqual(["b"]);
    expect(runs.get("s1")).toBe(optimistic);

    // Cancelled before it started: the optimistic run goes away.
    applyTaskSnapshot({ ...pending, revision: 2, queue: ["b"], tasks: [task("a", "sub-a", "cancelled"), task("b", "sub-b", "pending")] } as unknown as TaskSnapshot, effects);
    expect(runs.has("s1")).toBe(false);
  });

  it("forgets a rewound Session's snapshot so the next, lower revision is accepted", () => {
    const tasks = createTaskQueueStore();
    tasks.rememberOptions("s1", "sub-1", { mode: "agent", selectedSkills: [] } as never);
    expect(tasks.accept(snapshot("s1", 9))).not.toBeNull();
    tasks.forgetSnapshot("s1");
    expect(tasks.accept(snapshot("s1", 1))).not.toBeNull();
    expect(tasks.options("sub-1")).toBeDefined();
  });
});
