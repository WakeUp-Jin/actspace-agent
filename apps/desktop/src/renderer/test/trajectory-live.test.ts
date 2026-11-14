import { describe, expect, it } from "vitest";
import type { RuntimeTrajectoryNode, RuntimeTrajectorySnapshot } from "@actspace/shared/runtime-v2";
import type { RequestLiveOutput } from "@actspace/client/live";
import {
  buildTrajectorySnapshot,
  deriveLayout,
  liveMessageIds,
  liveMessageIdsKey,
  streamingCells,
} from "../trajectory";
import {
  STREAMING_FRAMES,
  loadTrajectoryFixture,
  streamingFixture,
  streamingLongFixture,
} from "../trajectory/fixtures";

// 规范 agent-spec-live-assistant-stream §6：定稿层由日志构建，没有结算的请求留一个空占位；
// 流式层把界面进程实时运行里该请求的输出放进占位。旧会话的 chunk 仍由 builder 合并。

const node = (
  eventSeq: number,
  eventType: string,
  data: Record<string, string>,
  callId: string | null = null,
): RuntimeTrajectoryNode => ({
  key: `s:${eventSeq}`,
  sessionId: "s",
  eventSeq,
  eventType,
  time: new Date(1_700_000_000_000 + eventSeq * 100).toISOString(),
  kind: "other",
  state: "observed",
  callId,
  data: { turnId: "t1", stepId: "st1", ...data },
});
const snap = (nodes: RuntimeTrajectoryNode[]): RuntimeTrajectorySnapshot => ({
  kind: "trajectory",
  schemaVersion: 1,
  sessionId: "s",
  throughJournalSeq: nodes.at(-1)?.eventSeq ?? -1,
  nodes,
  history: { fromSeq: 0, previousFromSeq: null, turnOffset: 0, requestOffset: 0 },
});
const head = [
  node(0, "turn/start", {}),
  node(1, "user/message", { content: "hi" }),
  node(2, "step/start", {}),
  node(3, "request/header", { requestId: "r1" }),
];
const output = (text: string, extra: Partial<RequestLiveOutput> = {}): RequestLiveOutput => ({
  messageId: "m1",
  text,
  thinking: "",
  calls: new Map(),
  ...extra,
});
const placeholders = (nodes: RuntimeTrajectoryNode[], ids?: ReadonlyMap<string, string>) =>
  buildTrajectorySnapshot(snap(nodes), ids ? { liveMessageIds: ids } : {}).records.filter(
    (record) => record.placeholder === true,
  );

/** The view's path: the settled layer from the Journal and live message ids, live output merged on top. */
function frame(
  nodes: RuntimeTrajectoryNode[] | RuntimeTrajectorySnapshot,
  live: ReadonlyMap<string, RequestLiveOutput>,
) {
  const layout = deriveLayout(
    buildTrajectorySnapshot(Array.isArray(nodes) ? snap(nodes) : nodes, { liveMessageIds: liveMessageIds(live) }),
  );
  const cells = streamingCells(layout.cells, live);
  return { layout, live: cells, cells: layout.cells.map((cell) => cells.get(cell.recordId) ?? cell) };
}

describe("trajectory streaming placeholder", () => {
  it("opens one placeholder per request no reply, retry or turn end has settled", () => {
    expect(placeholders(head).map((record) => [record.id, record.requestId, record.partial, record.state])).toEqual([
      ["s:record:assistant:request:r1", "r1", true, "running"],
    ]);
    expect(
      placeholders([...head, node(4, "assistant/message", { requestId: "r1", messageId: "m1", content: "ab" })]),
    ).toEqual([]);
    expect(placeholders([...head, node(4, "llm/retry", { requestId: "r1" })])).toEqual([]);
    expect(placeholders([...head, node(4, "turn/end", {})])).toEqual([]);
    // The retry opens a new request, which gets its own placeholder.
    expect(
      placeholders([
        ...head,
        node(4, "llm/retry", { requestId: "r1" }),
        node(5, "request/header", { requestId: "r2" }),
      ]).map((record) => record.requestId),
    ).toEqual(["r2"]);
  });

  it("takes the message's record id once the live run names it, so the settled reply keeps the row", () => {
    const [placeholder] = placeholders(head, new Map([["r1", "m1"]]));
    expect(placeholder).toMatchObject({
      id: "s:record:assistant:m1",
      messageId: "m1",
      requestDetail: expect.objectContaining({ requestId: "r1" }),
    });
    const settled = buildTrajectorySnapshot(
      snap([...head, node(4, "assistant/message", { requestId: "r1", messageId: "m1", content: "ab" })]),
    );
    expect(settled.records.find((record) => record.kind === "assistant")).toMatchObject({
      id: placeholder.id,
      summary: "ab",
      partial: false,
    });
  });

  it("leaves an old Session's unfinished chunks to the builder instead of a placeholder", () => {
    const chunks = [
      node(4, "assistant/chunk", { requestId: "r1", messageId: "m1", delta: "a" }),
      node(5, "assistant/chunk", { requestId: "r1", messageId: "m1", delta: "b" }),
    ];
    const built = buildTrajectorySnapshot(snap([...head, ...chunks]));
    expect(built.records.filter((record) => record.placeholder === true)).toEqual([]);
    expect(built.records.find((record) => record.kind === "assistant")).toMatchObject({
      id: "s:record:assistant:m1",
      summary: "ab",
      partial: true,
      sourceSequences: [4, 5],
    });
  });

  it("fills only the placeholder from the live output: text, thinking and streaming tool calls", () => {
    const live = new Map([
      ["r1", output("hello", { thinking: "hmm", calls: new Map([["c1", { toolName: "bash" }]]) })],
      ["other", output("not here", { messageId: "m9" })],
    ]);
    const view = frame(head, live);
    expect([...view.live.keys()]).toEqual(["s:record:assistant:m1"]);
    expect(view.live.get("s:record:assistant:m1")!.record).toMatchObject({
      summary: "hello",
      outputDetail: "hello",
      thinkingDetail: "hmm",
      sourceBlocks: [
        expect.objectContaining({ type: "reasoning", content: "hmm" }),
        expect.objectContaining({ type: "text", content: "hello" }),
        { type: "tool-call", content: "", callId: "c1", toolName: "bash" },
      ],
    });
  });

  it("rebuilds the settled layer only when a request starts streaming or names its message", () => {
    const keys = ["", "a", "ab", "abc"].map((text) =>
      liveMessageIdsKey(text === "" ? new Map() : new Map([["r1", output(text)]])),
    );
    expect(new Set(keys.slice(1)).size).toBe(1);
    expect(keys[0]).not.toBe(keys[1]);
    expect(liveMessageIdsKey(new Map([["r1", output("a", { messageId: null })]]))).not.toBe(keys[1]);
  });

  it("drops the streaming cell once the reply is final", () => {
    const live = new Map([["r1", output("ab")]]);
    expect(frame(head, live).live.size).toBe(1);
    const final = frame(
      [...head, node(4, "assistant/message", { requestId: "r1", messageId: "m1", content: "ab" })],
      live,
    );
    expect(final.live.size).toBe(0);
    expect(final.cells.find((cell) => cell.kind === "message")?.record).toMatchObject({
      summary: "ab",
      partial: false,
      sourceSequences: [4],
    });
  });

  it("grows the streaming fixture frame by frame on one settled layout", () => {
    let layout: ReturnType<typeof frame>["layout"] | null = null;
    let rowId: string | null = null;
    const lengths: number[] = [];
    for (let index = 1; index <= STREAMING_FRAMES; index += 1) {
      const { snapshot, live } = streamingFixture(index);
      const view = frame(snapshot, live);
      layout ??= view.layout;
      expect(view.layout.cells.map((cell) => cell.recordId)).toEqual(layout.cells.map((cell) => cell.recordId));
      expect(view.live.size).toBe(1);
      rowId ??= [...view.live.keys()][0];
      lengths.push(view.live.get(rowId)!.record.summary.length);
    }
    expect(lengths.every((length, index) => index === 0 || length > lengths[index - 1])).toBe(true);
    expect(rowId).toMatch(/:record:assistant:assistant-running$/);
  });

  it("streams exactly one call in the long fixture", () => {
    for (const chunks of [1, 800, 2000]) {
      const { snapshot, live } = streamingLongFixture(chunks);
      expect(frame(snapshot, live).live.size).toBe(1);
    }
  });

  it("shows an old running fixture's chunks as before", () => {
    const running = deriveLayout(buildTrajectorySnapshot(loadTrajectoryFixture("complete"))).cells.find(
      (cell) => cell.record.messageId === "assistant-running",
    );
    expect(running?.record).toMatchObject({ partial: true, state: "running" });
    expect(running?.record.summary).toMatch(/^正在整理/);
    expect(running?.record.placeholder).toBeUndefined();
  });
});
