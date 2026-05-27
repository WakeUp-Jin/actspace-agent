import { describe, expect, it } from "vitest";
import { aggregateKairosEvents } from "../kairos-aggregator";
import type { KairosRowKind } from "../kairos-contracts";
import {
  makeAssistantReply,
  makeError,
  makeSleepEnd,
  makeSleepInterrupted,
  makeSleepStart,
  makeTickInjected,
  makeToolCall,
  makeToolResult,
  resetFixtureCounter,
  sampleMultiTickMix,
  sampleSingleTickWithToolAndReply,
  sampleSleepInterrupted
} from "./fixtures/kairos-events";

const kinds = (rows: ReturnType<typeof aggregateKairosEvents>): KairosRowKind[] =>
  rows.map((r) => r.kind);

describe("aggregateKairosEvents", () => {
  it("returns [] on empty input", () => {
    expect(aggregateKairosEvents([])).toEqual([]);
  });

  it("folds tool_call + tool_result into single tool row", () => {
    resetFixtureCounter();
    const events = [
      makeTickInjected(),
      makeToolCall({ id: "tc-A", name: "read_file", arguments: { path: "a.txt" } }),
      makeToolResult({ toolCallId: "tc-A", ok: true, summary: "12 bytes" })
    ];
    const rows = aggregateKairosEvents(events);
    const tool = rows.find((r) => r.kind === "tool");
    expect(tool).toBeDefined();
    expect(tool!.status).toBe("success");
    expect(tool!.relatedEventIds).toHaveLength(2);
    expect(tool!.summary).toContain("read_file");
    expect(tool!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("marks tool row as running when tool_result is missing", () => {
    resetFixtureCounter();
    const events = [
      makeTickInjected(),
      makeToolCall({ id: "tc-orphan", name: "grep" })
    ];
    const rows = aggregateKairosEvents(events);
    const tool = rows.find((r) => r.kind === "tool");
    expect(tool?.status).toBe("running");
    expect(tool?.finishedAt).toBeUndefined();
  });

  it("flags tool row as failed when tool_result ok=false", () => {
    resetFixtureCounter();
    const events = [
      makeTickInjected(),
      makeToolCall({ id: "tc-fail", name: "read_file" }),
      makeToolResult({
        toolCallId: "tc-fail",
        toolName: "read_file",
        ok: false,
        summary: "ENOENT"
      })
    ];
    const rows = aggregateKairosEvents(events);
    const tool = rows.find((r) => r.kind === "tool");
    expect(tool?.status).toBe("failed");
    expect(tool?.summary).toContain("ENOENT");
  });

  it("folds sleep_start + sleep_end into single sleep row (status=success)", () => {
    resetFixtureCounter();
    const events = [
      makeTickInjected(),
      makeSleepStart({ plannedSeconds: 60 }),
      makeSleepEnd({ actualSeconds: 60 })
    ];
    const rows = aggregateKairosEvents(events);
    const sleeps = rows.filter((r) => r.kind === "sleep");
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0].status).toBe("success");
    expect(sleeps[0].summary).toMatch(/Slept 60s/);
  });

  it("folds sleep_start + sleep_interrupted into sleep(interrupted) + standalone interrupt row", () => {
    const rows = aggregateKairosEvents(sampleSleepInterrupted());
    expect(kinds(rows)).toContain("tick");
    const sleep = rows.find((r) => r.kind === "sleep");
    const interrupt = rows.find((r) => r.kind === "interrupt");
    expect(sleep?.status).toBe("interrupted");
    expect(interrupt?.summary).toContain("user_message");
  });

  it("emits one reply row per assistant_message", () => {
    resetFixtureCounter();
    const events = [
      makeTickInjected(),
      makeAssistantReply({ content: "First answer" }),
      makeAssistantReply({ content: "Second answer" })
    ];
    const rows = aggregateKairosEvents(events).filter((r) => r.kind === "reply");
    expect(rows).toHaveLength(2);
    expect(rows[0].summary).toBe("First answer");
    expect(rows[1].summary).toBe("Second answer");
  });

  it("opens a tick row at kairos_tick_injected and ties subsequent events into relatedEventIds", () => {
    const events = sampleSingleTickWithToolAndReply();
    const rows = aggregateKairosEvents(events);
    const tick = rows.find((r) => r.kind === "tick");
    expect(tick).toBeDefined();
    expect(tick!.status).toBe("success");
    expect(tick!.relatedEventIds.length).toBeGreaterThanOrEqual(events.length);
    expect(tick!.summary).toMatch(/^\[auto\]/);
  });

  it("marks tick row failed when an error event sits inside it", () => {
    resetFixtureCounter();
    const events = [
      makeTickInjected(),
      makeError({ message: "boom" })
    ];
    const rows = aggregateKairosEvents(events);
    const tick = rows.find((r) => r.kind === "tick");
    const error = rows.find((r) => r.kind === "error");
    expect(tick?.status).toBe("failed");
    expect(error?.status).toBe("failed");
    expect(error?.summary).toContain("boom");
  });

  it("separates two ticks without bleeding events across them", () => {
    const rows = aggregateKairosEvents(sampleMultiTickMix());
    const ticks = rows.filter((r) => r.kind === "tick");
    expect(ticks).toHaveLength(2);
    // First tick should contain its tool row's relatedEventIds, second should not.
    const firstTickIds = ticks[0].relatedEventIds;
    const secondTickIds = ticks[1].relatedEventIds;
    const overlap = firstTickIds.filter((id) => secondTickIds.includes(id));
    expect(overlap).toEqual([]);
    expect(ticks[0].status).toBe("success");
    expect(ticks[1].status).toBe("failed");
  });

  it("sorts unordered input by timestamp before aggregating", () => {
    resetFixtureCounter();
    const tick = makeTickInjected();
    const reply = makeAssistantReply({ content: "out of order" });
    const rows = aggregateKairosEvents([reply, tick]);
    expect(rows[0].kind).toBe("tick");
  });
});
