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
    const effects = { tasks, runs, patchLocal: vi.fn(), notice: vi.fn(), refreshSession: vi.fn() };
    const running = { runId: "run-1", taskId: "t-1", state: "running", result: null, configuration: {}, harness: { harnessId: "main", generationId: "g", revision: 1 } } as TaskSnapshot["runs"][number];
    applyTaskSnapshot(snapshot("s1", 1, [running]), effects);
    expect(runs.view("s1")).toMatchObject({ isStreaming: true, runId: "run-1", recovered: true });
    applyTaskSnapshot(snapshot("s1", 2, [{ ...running, state: "completed" } as TaskSnapshot["runs"][number]]), effects);
    expect(runs.has("s1")).toBe(false);
    expect(runs.isTerminal("run-1")).toBe(true);
    expect(effects.patchLocal).toHaveBeenCalledWith("s1", expect.objectContaining({ messageQueue: expect.anything() }));
  });
});
