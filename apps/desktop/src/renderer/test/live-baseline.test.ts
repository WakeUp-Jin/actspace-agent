import { describe, expect, it, vi } from "vitest";
import { attachLiveBaseline } from "../session/live-runs/live-baseline";
import { createLiveRunStore } from "../session/live-runs/live-run-store";
import { createEmptyStreamingState } from "../session/session-run-state";

// 渲染进程重载后：恢复的 run 从主进程实时底稿接着显示（规范 agent-spec-live-assistant-stream §6）。
function recovered() {
  const runs = createLiveRunStore();
  runs.start({ sessionId: "s", agentRunId: "run", recovered: true, state: createEmptyStreamingState(), userBlock: null, aborting: false });
  return runs;
}
const delta = (text: string, liveRevision: number) => ({ type: "assistant_text_delta", sessionId: "s", agentRunId: "run", delta: text, liveRevision }) as never;
const assistantText = (runs: ReturnType<typeof createLiveRunStore>) =>
  runs.view("s").blocks.filter((block) => block.kind === "assistant").map((block) => (block as { content: string }).content);

describe("attachLiveBaseline", () => {
  it("joins the baseline with the deltas that raced it, without duplicates or gaps", async () => {
    const runs = recovered();
    let resolve!: (value: { runId: string; revision: number; segments: { kind: "text"; messageId: string; text: string }[] }) => void;
    const pending = attachLiveBaseline(runs, "s", "run", () => new Promise((done) => { resolve = done; }));
    // 主进程读底稿前先冲出的帧（revision ≤ 底稿）与之后的新帧，都可能先于 invoke 回复到达。
    runs.applyStreamEvent(delta("前半", 2), () => undefined);
    runs.applyStreamEvent(delta("后半", 3), () => undefined);
    expect(assistantText(runs)).toEqual([]);
    resolve({ runId: "run", revision: 2, segments: [{ kind: "text", messageId: "m", text: "开头前半" }] });
    await pending;
    expect(assistantText(runs)).toEqual(["开头前半后半"]);
  });

  it("uses only the revision when the baseline belongs to another run, and an empty one when reading fails", async () => {
    const other = recovered();
    other.applyStreamEvent(delta("x", 5), () => undefined);
    await attachLiveBaseline(other, "s", "run", async () => ({ runId: "older", revision: 4, segments: [{ kind: "text", messageId: "m", text: "stale" }] }));
    expect(assistantText(other)).toEqual(["x"]);

    const failing = recovered();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    failing.applyStreamEvent(delta("kept", 7), () => undefined);
    await attachLiveBaseline(failing, "s", "run", async () => { throw new Error("ipc down"); });
    expect(assistantText(failing)).toEqual(["kept"]);
  });

  it("leaves a remote run alone: its adapter pushes the baseline itself", async () => {
    const runs = recovered();
    runs.applyStreamEvent(delta("waiting", 1), () => undefined);
    await attachLiveBaseline(runs, "s", "run", async () => null);
    expect(assistantText(runs)).toEqual([]);
  });
});
