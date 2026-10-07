import { describe, expect, it } from "vitest";
import { createMessageBlocks, type MessageBlock, type SessionEvent, type SessionRecord } from "@actspace/shared";
import { projectChatWindow } from "@actspace/client";
import { mergeTranscript, type DurableTranscript, type LiveTranscript, type LocalTranscript } from "../session/transcript";
import { createEmptyStreamingState, type StreamingState } from "../session/session-run-state";
import { createCompactionBlock, streamingStateToBlocks } from "../session/live-runs/stream-blocks";
import { recordProjectionFixture } from "./projection-fixture";
import { legacyMergeTranscript } from "../../../test-fixtures/legacy-transcript";

// 14 T14：mergeTranscript 按 runId 归属，旧实现按 renderKey 前缀 / `:tool:` 子串归属；两者必须深度相等。
// 输入都由真实生产者产出：durable 走 recordProjectionFixture → projectChatWindow，live 走 streamingStateToBlocks。

const SESSION = "s-transcript";
const TIME = "2026-10-06T00:00:00.000Z";
const NO_LOCAL: LocalTranscript = { compactionFailure: undefined, isStreaming: false, bashUpdates: {} };

function event(id: string, agentRunId: string, type: SessionEvent["type"], payload: Record<string, unknown>): SessionEvent {
  return { id, sessionId: SESSION, agentRunId, type, timestamp: TIME, schemaVersion: 2, payload } as SessionEvent;
}

function turnEvents(runId: string, prefix: string, user: string, reply: string, tools: Array<{ callId: string; preview: Record<string, unknown> }> = []): SessionEvent[] {
  return [
    event(`${prefix}-user`, runId, "user_message", { content: user }),
    ...tools.flatMap(({ callId, preview }) => [
      event(`${prefix}-call-${callId}`, runId, "tool_call", { id: callId, name: "read_file", arguments: {} }),
      event(`${prefix}-result-${callId}`, runId, "tool_result", { toolCallId: callId, toolName: "read_file", ok: true, status: "completed", summary: "ok", uiPreview: preview }),
    ]),
    event(`${prefix}-assistant`, runId, "assistant_message", { content: reply, stopReason: "stop" }),
  ];
}

function durableOf(events: SessionEvent[]): DurableTranscript {
  const record: SessionRecord = {
    meta: { schemaVersion: 2, id: SESSION, title: "Transcript", createdAt: TIME, updatedAt: TIME, agentRunCount: 0 },
    events, messageBlocks: createMessageBlocks(events), contextSnapshot: null,
  } as SessionRecord;
  const projected = projectChatWindow(recordProjectionFixture(record), "/tmp/workspace");
  return { blocks: projected.messageBlocks, events: projected.events };
}

/** 与 App 的 refreshStreamingBlocks 一致：任务快照的 user 块在前，其余由 streamingStateToBlocks 产出。 */
function liveOf(runId: string | null, state: StreamingState, options: { userBlock?: MessageBlock; recovered?: boolean; blockRunId?: string } = {}): LiveTranscript {
  const blocks = streamingStateToBlocks(state, options.blockRunId ?? runId ?? undefined);
  return { blocks: options.userBlock ? [options.userBlock, ...blocks] : blocks, runId, recovered: options.recovered === true };
}

function userBlock(runId: string, content: string): MessageBlock {
  return { kind: "user", id: `turn:${runId}:user:0`, runId, content, createdAt: TIME };
}

function streaming(text: string, tools: Array<{ callId: string; preview: Record<string, unknown>; finished?: boolean }> = []): StreamingState {
  const state = createEmptyStreamingState();
  for (const tool of tools) {
    state.segments.push({ type: "tool", toolCallId: tool.callId });
    state.activeTools.set(tool.callId, { toolName: "read_file", preview: tool.preview as never, finished: tool.finished ?? true });
  }
  if (text) state.segments.push({ type: "text", text });
  return state;
}

const readPreview = (file: string) => ({ kind: "read", filePath: file, displayText: `Read ${file}` });
const todoPreview = (revision: number) => ({ kind: "todo", todos: [{ id: "t1", content: "plan", status: "in_progress" }], totalCount: 1, completedCount: 0, revision, displayText: "1 todo" });

function compare(durable: DurableTranscript, live: LiveTranscript, local: LocalTranscript = NO_LOCAL): MessageBlock[] {
  const legacy = legacyMergeTranscript(durable, live, local);
  expect(mergeTranscript(durable, live, local)).toEqual(legacy);
  return legacy;
}

const keys = (blocks: MessageBlock[]) => blocks.map((block) => `${block.kind}:${block.renderKey ?? block.id}`);

describe("mergeTranscript matches the legacy merge", () => {
  it("hands a finished turn from live to durable (app-streaming-user-message handoff)", () => {
    const runId = "run-handoff";
    const finished = durableOf(turnEvents(runId, "evt-handoff", "handoff prompt", "handoff reply"));
    const live = liveOf(runId, streaming("handoff reply"), { userBlock: userBlock(runId, "handoff prompt") });

    // 流式中：durable 尚无该 run → 只显示 live。
    expect(keys(compare(durableOf([]), live))).toEqual([`user:turn:${runId}:user:0`, `assistant:turn:${runId}:assistant:0`]);
    // durable 已写入、live 仍在：durable 中同一 run 的块隐藏，live 不重复。
    expect(keys(compare(finished, live))).toEqual([`user:turn:${runId}:user:0`, `assistant:turn:${runId}:assistant:0`]);
    // run 完成后 live 清空：同一 renderKey 由 durable 接手。
    expect(keys(compare(finished, liveOf(null, createEmptyStreamingState())))).toEqual([`user:turn:${runId}:user:0`, `assistant:turn:${runId}:assistant:0`]);
  });

  it("hydrates a recovered task without duplicating its persisted user (app-message-queue)", () => {
    const runId = "recovered-run";
    const durable = durableOf([event("durable-user", runId, "user_message", { content: "reload active task input" })]);
    const live = liveOf(runId, createEmptyStreamingState(), { userBlock: userBlock(runId, "reload active task input"), recovered: true });
    const merged = compare(durable, live);
    expect(merged.filter((block) => block.kind === "user")).toHaveLength(1);
    expect(merged[0]).toMatchObject({ kind: "user", id: expect.not.stringMatching(/^turn:/) });
  });

  it("keeps background runs of other sessions apart (session-background-runs fixture)", () => {
    // 前一个 run 已完成并写入 durable；新 run 在流式中，进度和工具块只来自 live。
    const done = turnEvents("run-a1", "v2-a1", "第一轮", "A 后台任务已完成，共 2 次进度更新。");
    const live = liveOf("run-a2", streaming("后台进度 2。", [{ callId: "read-1", preview: readPreview("file-1.md") }, { callId: "read-2", preview: readPreview("file-2.md") }]),
      { userBlock: userBlock("run-a2", "第二轮") });
    const merged = compare(durableOf(done), live);
    expect(merged.map((block) => block.runId)).toEqual(["run-a1", "run-a1", "run-a2", "run-a2", "run-a2", "run-a2"]);
    // 第二轮 durable 已到但 live 未清：第二轮的 durable 块全部隐藏。
    const both = durableOf([...done, ...turnEvents("run-a2", "v2-a2", "第二轮", "A 后台任务已完成，共 2 次进度更新。", [{ callId: "read-1", preview: readPreview("file-1.md") }])]);
    expect(compare(both, live).filter((block) => block.runId === "run-a2")).toEqual(live.blocks);
  });

  it("keeps durable content of a recovered run and hides only tool blocks live already has", () => {
    const runId = "run-recover";
    const durable = durableOf(turnEvents(runId, "evt-r", "question", "partial answer", [
      { callId: "c1", preview: readPreview("a.md") },
      { callId: "c2", preview: readPreview("b.md") },
    ]));
    const live = liveOf(runId, streaming("continued answer", [{ callId: "c2", preview: readPreview("b.md"), finished: false }]), { recovered: true });
    const merged = compare(durable, live);
    expect(keys(merged)).toEqual([
      `user:turn:${runId}:user:0`, `read:turn:${runId}:tool:c1`, `assistant:turn:${runId}:assistant:0`,
      `read:turn:${runId}:tool:c2`, `assistant:turn:${runId}:assistant:0`,
    ]);
  });

  it("does not hide a durable todo for a recovered run (legacy only matched `:tool:` ids)", () => {
    const runId = "run-todo";
    // 测试用 projection fixture 按工具名投影，todo 会变成 read；这里直接用 createMessageBlocks 产出 durable todo。
    const events = turnEvents(runId, "evt-t", "question", "answer", [{ callId: "todo-1", preview: todoPreview(1) }]);
    const durable: DurableTranscript = { blocks: createMessageBlocks(events), events };
    expect(durable.blocks?.find((block) => block.kind === "todo")?.renderKey).toBe(`turn:${runId}:todo`);
    const live = liveOf(runId, streaming("", [{ callId: "todo-2", preview: todoPreview(2) }]), { recovered: true });
    const merged = compare(durable, live);
    expect(merged.filter((block) => block.kind === "todo")).toHaveLength(2);
  });

  it("falls back to events when the record has no blocks, excluding the streaming run", () => {
    const events = [...turnEvents("run-old", "e-old", "old", "old reply"), ...turnEvents("run-new", "e-new", "new", "new reply")];
    const live = liveOf("run-new", streaming("new reply"));
    const merged = compare({ blocks: [], events: durableOf(events).events }, live);
    expect(merged.map((block) => block.runId)).toEqual(["run-old", "run-old", "run-new"]);
    compare({ blocks: undefined, events: durableOf(events).events }, liveOf(null, createEmptyStreamingState()));
    // 恢复的 run 不按流式处理：events 里该 run 的内容保留。
    const recovered = compare({ blocks: [], events: durableOf(events).events }, liveOf("run-new", streaming("new reply"), { recovered: true }));
    expect(recovered.map((block) => block.runId)).toEqual(["run-old", "run-old", "run-new", "run-new", "run-new"]);
  });

  it("drops a live user block whose identity durable already has, keeping the durable one", () => {
    const runId = "run-dup";
    const durable = durableOf(turnEvents(runId, "evt-dup", "same", "reply"));
    // live.runId 已切到下一个 run，但旧 run 的 user 块还在 live 里：按 renderKey 去重。
    const live = liveOf("run-next", streaming("next"), { userBlock: userBlock(runId, "same"), blockRunId: "run-next" });
    const merged = compare(durable, live);
    expect(merged.filter((block) => block.kind === "user")).toHaveLength(1);
  });

  it("keeps steer and workspace-preparation blocks the same way after the run completes", () => {
    const runId = "run-steer";
    const state = createEmptyStreamingState();
    state.segments.push(
      { type: "workspace_preparation", agentRunId: runId },
      { type: "text", text: "before steer" },
      { type: "user_message", block: { kind: "user", id: `turn:${runId}:steer:m-1`, runId, content: "steer now", createdAt: TIME } },
      { type: "compaction", agentRunId: runId },
      { type: "text", text: "after steer" },
    );
    state.activeWorkspacePreparations.set(runId, { kind: "workspace_preparation", id: `turn:${runId}:workspace-preparation:0`, runId, status: "completed", sourceWorkspaceRoot: "/w", baseBranch: "main", createdAt: TIME });
    state.activeCompactions.set(runId, createCompactionBlock({ agentRunId: runId, status: "completed" }));
    const durable = durableOf([...turnEvents("run-prev", "p", "prev", "prev reply"), ...turnEvents(runId, "s", "start", "after steer")]);

    // run 进行中 / 刚完成但 live 尚未清空（runId 已置空）/ 恢复后。
    compare(durable, liveOf(runId, state, { userBlock: userBlock(runId, "start") }));
    const lingering = compare(durable, liveOf(null, state, { userBlock: userBlock(runId, "start"), blockRunId: runId }));
    expect(lingering.filter((block) => block.kind === "user")).toHaveLength(3);
    compare(durable, liveOf(runId, state, { userBlock: userBlock(runId, "start"), recovered: true }));
    compare(durable, liveOf(null, createEmptyStreamingState()));
  });

  it("appends a compaction failure only when idle and applies background bash updates", () => {
    const failure = createCompactionBlock({ agentRunId: "compact-task", status: "failed" });
    const bash: MessageBlock = { kind: "bash", id: "bash-1", runId: "run-b", title: "sleep 9", command: "sleep 9", status: "success", backgroundTaskId: "task-1", backgroundStatus: "running", createdAt: TIME };
    const durable: DurableTranscript = { blocks: [...(durableOf(turnEvents("run-b", "b", "go", "started")).blocks ?? []), bash], events: [] };
    const idle = compare(durable, liveOf(null, createEmptyStreamingState()), { compactionFailure: failure, isStreaming: false, bashUpdates: { "task-1": { status: "completed", exitCode: 0 } } });
    expect(idle.at(-1)).toBe(failure);
    expect(idle.find((block) => block.kind === "bash")).toMatchObject({ backgroundStatus: "completed", exitCode: 0 });
    const busy = compare(durable, liveOf("run-c", streaming("x")), { compactionFailure: failure, isStreaming: true, bashUpdates: { "task-2": { status: "failed" } } });
    expect(busy).not.toContain(failure);
  });
});
