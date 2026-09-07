import { describe, expect, it } from "vitest";
import type { RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import { buildTrajectoryDetail, buildTrajectorySnapshot, groupVirtualRows, searchTrajectory } from "../trajectory";
import { loadTrajectoryFixture } from "../trajectory/fixtures";

const snapshot: RuntimeV2TrajectorySnapshot = {
  kind: "trajectory", schemaVersion: 1, sessionId: "s", throughJournalSeq: 9,
  nodes: [
    { key: "s:0", sessionId: "s", eventSeq: 0, eventType: "turn/start", time: "2026-09-05T00:00:00.000Z", kind: "turn", state: "started", callId: null, data: { turnId: "t1" } },
    { key: "s:1", sessionId: "s", eventSeq: 1, eventType: "user/message", time: "2026-09-05T00:00:00.100Z", kind: "user", state: "observed", callId: null, data: { turnId: "t1", content: "inspect files" } },
    { key: "s:2", sessionId: "s", eventSeq: 2, eventType: "assistant/chunk", time: "2026-09-05T00:00:00.200Z", kind: "assistant", state: "updated", callId: null, data: { turnId: "t1", messageId: "m1", delta: "I will inspect " } },
    { key: "s:3", sessionId: "s", eventSeq: 3, eventType: "assistant/chunk", time: "2026-09-05T00:00:00.300Z", kind: "assistant", state: "updated", callId: null, data: { turnId: "t1", messageId: "m1", delta: "the files." } },
    { key: "s:4", sessionId: "s", eventSeq: 4, eventType: "assistant/message", time: "2026-09-05T00:00:00.400Z", kind: "assistant", state: "completed", callId: null, data: { turnId: "t1", messageId: "m1", content: "I will inspect the files.", usage: { inputTokens: 10, outputTokens: 5 } } },
    { key: "s:5", sessionId: "s", eventSeq: 5, eventType: "tool/call", time: "2026-09-05T00:00:00.500Z", kind: "tool", state: "started", callId: "c1", data: { turnId: "t1", stepId: "st1", callId: "c1", name: "read_file", arguments: { path: "README.md" } } },
    { key: "s:6", sessionId: "s", eventSeq: 6, eventType: "approval/asked", time: "2026-09-05T00:00:00.600Z", kind: "approval", state: "started", callId: "c1", data: { turnId: "t1", callId: "c1", reason: "approval" } },
    { key: "s:7", sessionId: "s", eventSeq: 7, eventType: "approval/decided", time: "2026-09-05T00:00:00.700Z", kind: "approval", state: "completed", callId: "c1", data: { turnId: "t1", callId: "c1", decision: "approved" } },
    { key: "s:8", sessionId: "s", eventSeq: 8, eventType: "tool/result", time: "2026-09-05T00:00:01.500Z", kind: "tool", state: "completed", callId: "c1", data: { turnId: "t1", callId: "c1", result: "ok" } },
    { key: "s:9", sessionId: "s", eventSeq: 9, eventType: "assistant/chunk", time: "2026-09-05T00:00:01.600Z", kind: "assistant", state: "updated", callId: null, data: { turnId: "t1", messageId: "m2", delta: "still running" } },
  ],
};

describe("trajectory runtime builder", () => {
  it("aggregates chunks and pairs tool result and approvals", () => {
    const result = buildTrajectorySnapshot(snapshot, "actual");
    const assistant = result.records.find(record => record.messageId === "m1");
    expect(assistant?.sourceSequences).toEqual([2, 3, 4]);
    expect(result.records.find(record => record.callId === "c1" && record.kind === "tool")).toMatchObject({ result: "ok", state: "completed", sourceSequences: [5, 6, 7, 8] });
    expect(result.partial?.summary).toBe("still running");
    expect(result.turns).toHaveLength(1);
    expect(result.timeline?.mode).toBe("actual");
  });

  it("searches by all terms and resolves raw detail source nodes", () => {
    const result = buildTrajectorySnapshot(snapshot);
    const matches = searchTrajectory(result, "read_file README");
    expect(matches?.size).toBe(1);
    const detail = buildTrajectoryDetail(result, [...matches!][0]!);
    expect(detail?.sourceNodes.map(node => node.eventSeq)).toEqual([5, 6, 7, 8]);
  });

  it("keeps lifecycle and request facts raw-only while projecting semantic records", () => {
    const result = buildTrajectorySnapshot(snapshot, "actual");

    expect(result.records.map(record => record.eventType)).toEqual([
      "user/message",
      "assistant/message",
      "tool/call",
      "assistant/chunk",
    ]);
    expect(result.records.some(record => record.eventType === "request/header" && record.kind !== "system")).toBe(false);
    expect(result.records.some(record => record.eventType === "request/context")).toBe(false);
    expect(result.records.some(record => record.eventType === "turn/start")).toBe(false);
    expect(result.rawRecords).toHaveLength(snapshot.nodes.length);
    expect(result.rawRecords?.find(record => record.eventType === "turn/start")?.visible).toBe(false);
  });

  it("derives DSH assistant timing metrics from step start and stream boundaries", () => {
    const result = buildTrajectorySnapshot(snapshot, "actual");
    const assistant = result.records.find(record => record.messageId === "m1");
    expect(assistant).toMatchObject({ startedAt: "2026-09-05T00:00:00.000Z", durationMs: 400 });
    expect(assistant?.assistantMetrics).toMatchObject({
      stepStartAt: "2026-09-05T00:00:00.000Z",
      firstTokenAt: "2026-09-05T00:00:00.200Z",
      completedAt: "2026-09-05T00:00:00.400Z",
      ttftMs: 200,
      generationMs: 200,
      throughputTokensPerSecond: 25,
    });
  });

  it("projects explicit prompt changes as SYSTEM records only", () => {
    const nodes = [
      snapshot.nodes[0]!,
      snapshot.nodes[1]!,
      { ...snapshot.nodes[1]!, key: "s:10", eventSeq: 10, eventType: "request/header", data: { turnId: "t1", stepId: "st1", requestId: "r1", prompt: { systemPrompt: "initial", tools: [] } } },
      { ...snapshot.nodes[1]!, key: "s:11", eventSeq: 11, eventType: "request/header", data: { turnId: "t1", stepId: "st1", requestId: "r2", prompt: { systemPrompt: "updated", tools: [] } } },
      { ...snapshot.nodes[1]!, key: "s:12", eventSeq: 12, eventType: "request/header", data: { turnId: "t1", stepId: "st1", requestId: "r3", model: "same" } },
    ];
    const result = buildTrajectorySnapshot({ ...snapshot, nodes });
    const systems = result.records.filter(record => record.kind === "system");
    expect(systems).toHaveLength(2);
    expect(systems.map(record => record.summary)).toEqual(["Initial System Prompt", "System Prompt Updated"]);
    expect(result.records.filter(record => record.kind === "request")).toHaveLength(0);
  });

  it("retains the first visible turn row and groups adjacent tool calls when collapsed", () => {
    const result = buildTrajectorySnapshot(snapshot);
    const turnRows = groupVirtualRows(result.records, new Set(["t1"]));
    expect(turnRows.map(row => row.rowType)).toEqual(["record", "turn-summary", "record"]);
    expect(turnRows[1]?.summary).toContain("1 step");

    const callRows = groupVirtualRows(result.records, new Set(), new Set(["c1"]));
    expect(callRows.some(row => row.rowType === "call-summary")).toBe(true);
    expect(callRows.find(row => row.rowType === "call-summary")?.summary).toContain("tool call");
  });

  it("keeps request and lifecycle facts out of the semantic ledger", () => {
    const result = buildTrajectorySnapshot(loadTrajectoryFixture("complete"), "actual");
    expect(result.records.some(record => record.eventType === "request/header" && record.kind !== "system")).toBe(false);
    expect(result.records.some(record => record.eventType === "request/context")).toBe(false);
    expect(result.records.filter(record => record.kind === "system")).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ kind: "system", turnId: null });
    expect(result.records.find(record => record.messageId === "assistant-2-2")).toMatchObject({ turnNumber: 2, stepNumber: 2, requestId: "request-2-2" });
    expect(result.records.find(record => record.callId === "call-3-1-1")).toMatchObject({ state: "failed", durationMs: 1200 });
    expect(result.records.find(record => record.messageId === "assistant-5-1")?.assistantMetrics).toMatchObject({ ttftMs: null, generationMs: null });
    expect(result.rawRecords?.some(record => record.eventType === "request/header")).toBe(true);
    expect(result.records.filter(record => record.kind === "assistant").length).toBeGreaterThan(0);
    expect(result.records.filter(record => record.kind === "tool").every(record => record.sourceSequences.length >= 2)).toBe(true);
    const assistant = result.records.find(record => record.kind === "assistant" && record.assistantMetrics);
    expect(assistant?.assistantMetrics?.ttftMs).toBeTypeOf("number");
  });
  it("compresses idle gaps without counting overlap twice or inventing missing timestamps", () => {
    const timed: RuntimeV2TrajectorySnapshot = { ...snapshot, nodes: [
      { ...snapshot.nodes[5]!, time: "2026-09-05T00:00:01.000Z", data: { callId: "a" }, callId: "a" },
      { ...snapshot.nodes[8]!, eventSeq: 6, time: "2026-09-05T00:00:03.000Z", data: { callId: "a" }, callId: "a" },
      { ...snapshot.nodes[5]!, eventSeq: 7, time: "2026-09-05T00:00:02.000Z", data: { callId: "b" }, callId: "b" },
      { ...snapshot.nodes[8]!, eventSeq: 8, time: "2026-09-05T00:00:04.000Z", data: { callId: "b" }, callId: "b" },
      { ...snapshot.nodes[5]!, eventSeq: 9, time: "2026-09-05T00:01:00.000Z", data: { callId: "c" }, callId: "c" },
      { ...snapshot.nodes[8]!, eventSeq: 10, time: "2026-09-05T00:01:02.000Z", data: { callId: "c" }, callId: "c" },
      { ...snapshot.nodes[1]!, eventSeq: 11, time: null, data: { content: "no time" } },
    ] };
    const compressed = buildTrajectorySnapshot(timed, "duration").timeline!;
    const actual = buildTrajectorySnapshot(timed, "actual").timeline!;
    expect(compressed.end - compressed.start).toBe(5000);
    expect(actual.end - actual.start).toBe(61000);
    expect(compressed.spans).toHaveLength(3);
  });

});
