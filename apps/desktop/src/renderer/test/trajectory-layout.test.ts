import { describe, expect, it } from "vitest";
import type { RuntimeV2TrajectoryNode, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import {
  buildTrajectorySnapshot,
  cellStatus,
  collapseAssistants,
  collapseTurns,
  deriveLayout,
  deriveTimeline,
  detailTabs,
  filterRows,
  flattenLayout,
  formatDurationMs,
  requestBoundaries,
  type TrajectoryCell,
} from "../trajectory";

let seq = 0;
const node = (eventType: string, time: string, data: Record<string, unknown>, callId: string | null = null): RuntimeV2TrajectoryNode => {
  seq += 1;
  return { key: `s:${seq}`, sessionId: "s", eventSeq: seq, eventType, time: `2026-10-14T00:00:${time}Z`, kind: "other", state: "observed", callId, data } as RuntimeV2TrajectoryNode;
};
const t1 = { turnId: "t1" };
const nodes = [
  node("turn/start", "00.000", t1),
  node("user/message", "00.100", { ...t1, content: "读一下 README" }),
  node("step/start", "00.200", { ...t1, stepId: "st1" }),
  node("request/header", "00.200", { ...t1, stepId: "st1", requestId: "r1", routeId: "deepseek", model: "v4", prompt: { systemPrompt: "你是助手", tools: [] } }),
  node("assistant/message", "01.000", { ...t1, stepId: "st1", requestId: "r1", messageId: "m1", content: "先读文件", usage: { outputTokens: 5 } }),
  node("tool/call", "01.100", { ...t1, stepId: "st1", callId: "c1", name: "read_file", arguments: { path: "README.md" } }, "c1"),
  node("tool/call", "01.200", { ...t1, stepId: "st1", callId: "c2", name: "bash", parentCallId: "c1", arguments: { command: "ls" } }, "c2"),
  node("tool/result", "01.300", { ...t1, stepId: "st1", callId: "c2", result: "a.md" }, "c2"),
  node("tool/result", "01.500", { ...t1, stepId: "st1", callId: "c1", result: "ok" }, "c1"),
  node("step/end", "01.500", { ...t1, stepId: "st1" }),
  node("step/start", "05.000", { ...t1, stepId: "st2" }),
  node("request/header", "05.000", { ...t1, stepId: "st2", requestId: "r2a" }),
  node("llm/retry", "05.100", { ...t1, stepId: "st2", requestId: "r2a", attempt: 1, delayMs: 200, failure: { message: "超时" } }),
  node("request/header", "05.300", { ...t1, stepId: "st2", requestId: "r2b", attempt: 2 }),
  node("assistant/message", "06.000", { ...t1, stepId: "st2", requestId: "r2b", messageId: "m2", content: "完成" }),
  node("step/end", "06.000", { ...t1, stepId: "st2" }),
  node("turn/end", "06.000", t1),
  node("turn/start", "10.000", { turnId: "t2" }),
  node("user/message", "10.100", { turnId: "t2", content: "继续" }),
  node("step/start", "10.200", { turnId: "t2", stepId: "st3" }),
  node("request/header", "10.200", { turnId: "t2", stepId: "st3", requestId: "r3" }),
];
const snapshot: RuntimeV2TrajectorySnapshot = { kind: "trajectory", schemaVersion: 1, sessionId: "s", throughJournalSeq: seq, nodes };
const layout = () => deriveLayout(buildTrajectorySnapshot(snapshot));

describe("trajectory layout", () => {
  it("maps builder records onto the seven DSH kinds and appends request-only cells", () => {
    const { cells } = layout();
    expect(cells.map(cell => cell.requestOnly ? "request" : cell.kind)).toEqual(["system", "user", "message", "tool", "subtool", "message", "user", "request"]);
    expect(cells.map(cell => cell.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("puts the turn label on the first content row and the request dot on the first non-input row", () => {
    const current = layout();
    const rows = flattenLayout(current.turns);
    expect(rows.filter(row => row.turnStart).map(row => row.cell.kind)).toEqual(["user", "user"]);
    const boundaries = requestBoundaries(rows, current);
    expect([...boundaries.keys()]).toEqual([3, 6, 8]);
    expect([...boundaries.values()].map(key => current.requests.get(key)?.number)).toEqual([1, 2, 3]);
  });

  it("folds retries into the step's request view", () => {
    const requests = [...layout().requests.values()];
    expect(requests[0]).toMatchObject({ provider: "deepseek", model: "v4", status: "completed", toolCalls: 1, subtoolCalls: 1 });
    expect(requests[1]).toMatchObject({ retries: 1, lastAttemptError: "超时", retryDelayMs: 200, status: "completed" });
    expect(requests[2]).toMatchObject({ status: "running", resultRecordId: null });
  });

  it("collapses a turn into one summary row and an assistant's tool rows into one summary row", () => {
    const current = layout();
    const rows = flattenLayout(current.turns);
    const turn = collapseTurns(rows, new Set([1]), current).filter(row => row.cell.turn === 1);
    expect(turn.map(row => row.collapsed?.summary ?? row.cell.kind)).toEqual(["user", "2 个步骤 · 2 个工具调用"]);
    const assistant = current.cells.find(cell => cell.kind === "message")!;
    const calls = collapseAssistants(rows, new Set([assistant.recordId]));
    expect(calls.map(row => row.collapsed?.summary ?? row.cell.kind).slice(2, 5)).toEqual(["message", "2 个工具调用 · read_file, bash", "message"]);
  });

  it("search keeps matching rows and recomputes turn edges", () => {
    const current = layout();
    const rows = filterRows(flattenLayout(current.turns), new Set(current.cells.filter(cell => cell.kind === "message").map(cell => cell.recordId)));
    expect(rows.map(row => [row.cell.kind, row.turnStart, row.turnEnd])).toEqual([["message", true, false], ["message", false, true]]);
  });

  it("chooses detail tabs by kind and present fields", () => {
    const { cells } = layout();
    expect(detailTabs(cells[0]!).map(tab => tab.label)).toEqual(["系统提示词", "工具"]);
    expect(detailTabs(cells[1]!).map(tab => tab.label)).toEqual(["概述", "预览", "原始内容"]);
    expect(detailTabs(cells[3]!).map(tab => tab.label)).toEqual(["概述", "参数", "结果", "Schema", "计时"]);
  });
});

describe("trajectory timeline", () => {
  it("assigns lanes 0/1/2 and equal widths in sequence mode", () => {
    const model = deriveTimeline(layout().turns)!;
    expect(model.spans.map(span => span.lane)).toEqual([0, 0, 1, 2, 2, 1, 0]);
    expect(model.turnBoundaries).toEqual([{ turn: 1, time: 1 }, { turn: 2, time: 6 }]);
  });

  it("removes idle gaps in duration mode only", () => {
    const { turns } = layout();
    const duration = deriveTimeline(turns, "duration")!;
    const actual = deriveTimeline(turns, "actual")!;
    expect(actual.end - actual.start).toBeGreaterThan(duration.end - duration.start);
    expect(duration.end - duration.start).toBeLessThan(5_000);
  });

  it("keeps the timeline model unchanged while streamed text grows", () => {
    const chunk = (content: string) => ({ ...nodes.at(-1)!, key: "s:99", eventSeq: 99, eventType: "assistant/chunk", data: { turnId: "t2", stepId: "st3", requestId: "r3", messageId: "m3", kind: "text-delta", content } });
    const first = deriveLayout(buildTrajectorySnapshot({ ...snapshot, nodes: [...nodes, chunk("正在")] }));
    const second = deriveLayout(buildTrajectorySnapshot({ ...snapshot, nodes: [...nodes, chunk("正在读取文件")] }));
    expect(second.cells.at(-1)?.record.summary).toBe("正在读取文件");
    expect(deriveTimeline(second.turns)).toEqual(deriveTimeline(first.turns));
  });
});

describe("trajectory status and format", () => {
  const base = layout().cells;
  const variant = (index: number, change: Partial<TrajectoryCell>): TrajectoryCell => ({ ...base[index]!, ...change });

  it("applies the five DSH status rules", () => {
    expect(cellStatus(variant(3, { isError: true }))).toBe("failed");
    expect(cellStatus(variant(2, { kind: "compacted", durationMs: null }))).toBe("running");
    expect(cellStatus(variant(2, { record: { ...base[2]!.record, partial: true } }))).toBe("running");
    expect(cellStatus(variant(3, { record: { ...base[3]!.record, outputDetail: null, result: null } }))).toBe("running");
    expect(cellStatus(base[3]!)).toBe("completed");
  });

  it("formats durations like DSH", () => {
    expect([850, 2_345, 12_400, null].map(formatDurationMs)).toEqual(["850 毫秒", "2.35 秒", "12.4 秒", "—"]);
  });
});
