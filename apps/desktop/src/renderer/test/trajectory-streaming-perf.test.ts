import { describe, expect, it } from "vitest";
import { projectTrajectoryWindow } from "@actspace/client/sessions";
import type { RuntimeV2EventWindow, RuntimeV2TrajectoryNode, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import {
  buildTrajectorySnapshot, createLiveAccumulator, deriveLayout, flattenLayout, splitLiveChunks, streamingCells,
  type TrajectoryCell,
} from "../trajectory";
import { streamingLongFixture } from "../trajectory/fixtures";

// Frame-time measurement for the streaming path. Timing is machine-dependent, so it only runs on
// request: TRAJECTORY_PERF=1 pnpm --filter @actspace/desktop exec vitest run src/renderer/test/trajectory-streaming-perf.test.ts
const RUNS = 30;
const WARMUP = 3;
const ms = (value: { p50: number; p95: number }) => `p50 ${value.p50.toFixed(3)}ms / p95 ${value.p95.toFixed(3)}ms`;

const toEvent = (node: RuntimeV2TrajectoryNode) => ({
  recordKind: "event", seq: node.eventSeq, type: node.eventType, eventVersion: 1, criticality: "required",
  time: node.time, source: node.source ?? { ownerPluginId: "fixture" }, data: node.data, surface: node.surface ?? null, provenance: {},
}) as unknown as SessionEventEnvelopeV1;

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

function measure(run: () => void): { p50: number; p95: number } {
  const samples: number[] = [];
  for (let index = 0; index < RUNS + WARMUP; index += 1) {
    const start = performance.now();
    run();
    if (index >= WARMUP) samples.push(performance.now() - start);
  }
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
}

/** The window as the session store holds it after `chunks` chunks: one shared event object per Journal event. */
function windows(chunks: number) {
  const events = streamingLongFixture(chunks).nodes.map(toEvent);
  const window = (count: number): RuntimeV2EventWindow => ({
    events: events.slice(0, count), fromSeq: 0, throughJournalSeq: events[count - 1]!.seq, beforeSeq: null, turnOffset: 0, requestOffset: 0,
  });
  return { previous: window(events.length - 1), next: () => window(events.length), size: events.length };
}

/**
 * The view's split path over consecutive chunk frames: each sample adds one chunk to the window.
 * The settled layout is built once on the priming frame and reused while only chunks grow.
 */
function splitFrames(chunks: number) {
  const events = streamingLongFixture(chunks).nodes.map(toEvent);
  const frames = Array.from({ length: RUNS + WARMUP + 1 }, (_, index): RuntimeV2EventWindow => {
    const count = events.length - (RUNS + WARMUP) + index;
    return { events: events.slice(0, count), fromSeq: 0, throughJournalSeq: events[count - 1]!.seq, beforeSeq: null, turnOffset: 0, requestOffset: 0 };
  });
  const accumulator = createLiveAccumulator();
  let settled: { key: string; cells: ReadonlyMap<string, TrajectoryCell> } | null = null;
  let builds = 0;
  const stages = { project: [] as number[], split: [] as number[], stream: [] as number[], total: [] as number[] };
  frames.forEach((window, index) => {
    const t0 = performance.now();
    const snapshot = projectTrajectoryWindow("mock-long-session", window);
    const t1 = performance.now();
    const split = splitLiveChunks(snapshot);
    const t2 = performance.now();
    if (settled?.key !== split.settledKey) {
      builds += 1;
      const layout = deriveLayout(buildTrajectorySnapshot(split.settled(), { placeholders: new Set(split.live.keys()) }));
      settled = { key: split.settledKey, cells: new Map(layout.cells.map(cell => [cell.recordId, cell])) };
    }
    const t3 = performance.now();
    const cells = streamingCells(settled.cells, accumulator.update(split.live));
    const t4 = performance.now();
    expect(cells.size).toBe(1);
    if (index <= WARMUP) return;
    stages.project.push(t1 - t0); stages.split.push(t2 - t1); stages.stream.push(t4 - t3); stages.total.push(t4 - t0);
  });
  const summary = Object.fromEntries(Object.entries(stages).map(([key, samples]) => [key, { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95) }]));
  return { summary, builds, processed: accumulator.processed, size: events.length };
}

describe.runIf(process.env.TRAJECTORY_PERF === "1")("trajectory streaming frame cost", () => {
  for (const chunks of [10, 2000]) {
    it(`measures one streaming frame with ${chunks} chunks`, () => {
      const { next, size } = windows(chunks);
      const nodes = projectTrajectoryWindow("mock-long-session", next());
      const runtime = buildTrajectorySnapshot(nodes);
      const stages = {
        project: measure(() => { projectTrajectoryWindow("mock-long-session", next()); }),
        build: measure(() => { buildTrajectorySnapshot(nodes); }),
        layout: measure(() => { flattenLayout(deriveLayout(runtime).turns); }),
        total: measure(() => {
          const snapshot = projectTrajectoryWindow("mock-long-session", next());
          flattenLayout(deriveLayout(buildTrajectorySnapshot(snapshot)).turns);
        }),
      };
      console.log(`[trajectory-perf] full nodes=${size} chunks=${chunks}`, JSON.stringify(Object.fromEntries(Object.entries(stages).map(([key, value]) => [key, ms(value)]))));
      expect(runtime.records.length).toBeGreaterThan(0);
    });
  }

  for (const chunks of [40, 2000]) {
    it(`measures one split streaming frame with ${chunks} chunks`, () => {
      const { summary, builds, processed, size } = splitFrames(chunks);
      console.log(`[trajectory-perf] split nodes=${size} chunks=${chunks}`, JSON.stringify(Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, ms(value)]))));
      expect(builds).toBe(1);
      expect(processed).toBe(chunks);
      expect(summary.total!.p95).toBeLessThan(2);
    });
  }

  it("measures the settled rebuild a non-chunk event triggers", () => {
    const snapshot = projectTrajectoryWindow("mock-long-session", { events: streamingLongFixture(2000).nodes.map(toEvent), fromSeq: 0, throughJournalSeq: 0, beforeSeq: null, turnOffset: 0, requestOffset: 0 });
    const rebuild = measure(() => {
      const split = splitLiveChunks(snapshot);
      flattenLayout(deriveLayout(buildTrajectorySnapshot(split.settled(), { placeholders: new Set(split.live.keys()) })).turns);
    });
    console.log("[trajectory-perf] settled rebuild chunks=2000", ms(rebuild));
  });
});
