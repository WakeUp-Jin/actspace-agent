import { describe, expect, it } from "vitest";
import { createEmptyStreamingState, createLiveRunStore } from "../live";

// 规范 agent-spec-live-assistant-stream §6：恢复的运行从实时底稿开始，底稿到达前的增量先缓存，
// 底稿 revision 以内的帧丢掉，之后的帧接着拼，不重复也不缺字。

const ids = { sessionId: "s", agentRunId: "run" };
const text = (delta: string, liveRevision?: number) =>
  ({ type: "assistant_text_delta", ...ids, delta, ...(liveRevision === undefined ? {} : { liveRevision }) }) as never;
const thinking = (delta: string, liveRevision: number) =>
  ({ type: "assistant_thinking_delta", ...ids, delta, liveRevision }) as never;
const baseline = (revision: number, segments: { kind: "text" | "thinking"; messageId: string; text: string }[]) =>
  ({ type: "live_output_baseline", ...ids, revision, segments }) as never;
const noSteer = () => undefined;

function recoveredStore() {
  const store = createLiveRunStore();
  store.start({ ...ids, recovered: true, state: createEmptyStreamingState(), userBlock: null, aborting: false });
  return store;
}
const contents = (store: ReturnType<typeof createLiveRunStore>) =>
  store
    .view("s")
    .blocks.filter((block) => block.kind === "assistant" || block.kind === "thinking")
    .map((block) => `${block.kind}:${(block as { content: string }).content}`);

describe("recovered live run", () => {
  it("holds deltas until the baseline, drops frames the baseline already has, and appends the rest", () => {
    const store = recoveredStore();
    store.applyStreamEvent(text("你好", 3), noSteer);
    store.applyStreamEvent(text("，世", 5), noSteer);
    expect(contents(store)).toEqual([]);
    store.applyStreamEvent(
      baseline(4, [
        { kind: "thinking", messageId: "m", text: "想" },
        { kind: "text", messageId: "m", text: "你好" },
      ]),
      noSteer,
    );
    expect(contents(store)).toEqual(["thinking:想", "assistant:你好，世"]);
    store.applyStreamEvent(text("界", 6), noSteer);
    store.applyStreamEvent(text("旧帧", 2), noSteer);
    expect(contents(store)).toEqual(["thinking:想", "assistant:你好，世界"]);
  });

  it("applies only the first baseline and keeps frames without a revision", () => {
    const store = recoveredStore();
    store.applyStreamEvent(baseline(10, []), noSteer);
    store.applyStreamEvent(baseline(20, [{ kind: "text", messageId: "m", text: "stale" }]), noSteer);
    store.applyStreamEvent(thinking("想", 9), noSteer);
    store.applyStreamEvent(text("新"), noSteer);
    store.applyStreamEvent(text("的", 11), noSteer);
    expect(contents(store)).toEqual(["assistant:新的"]);
  });

  it("ignores a baseline for a run that is not recovered", () => {
    const store = createLiveRunStore();
    store.start({ ...ids, state: createEmptyStreamingState(), userBlock: null, aborting: false });
    store.applyStreamEvent(text("a", 1), noSteer);
    store.applyStreamEvent(baseline(5, [{ kind: "text", messageId: "m", text: "dup" }]), noSteer);
    store.applyStreamEvent(text("b", 2), noSteer);
    expect(contents(store)).toEqual(["assistant:ab"]);
  });
});
