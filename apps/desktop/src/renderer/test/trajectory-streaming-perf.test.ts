import { describe, expect, it } from "vitest";
import { projectTrajectoryWindow } from "@actspace/client/sessions";
import type { RuntimeEventWindow, RuntimeTrajectoryNode, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { buildTrajectorySnapshot, deriveLayout, flattenLayout, liveMessageIds, streamingCells } from "../trajectory";
import { streamingLongFixture } from "../trajectory/fixtures";

// Frame-time measurement for the streaming path. Timing is machine-dependent, so it only runs on
// request: TRAJECTORY_PERF=1 pnpm --filter @actspace/desktop exec vitest run src/renderer/test/trajectory-streaming-perf.test.ts
const RUNS = 30;
const WARMUP = 3;
const ms = (value: { p50: number; p95: number }) => `p50 ${value.p50.toFixed(3)}ms / p95 ${value.p95.toFixed(3)}ms`;

const toEvent = (node: RuntimeTrajectoryNode) =>
  ({
    recordKind: "event",
    seq: node.eventSeq,
    type: node.eventType,
    eventVersion: 1,
    criticality: "required",
    time: node.time,
    source: node.source ?? { ownerPluginId: "fixture" },
    data: node.data,
    surface: node.surface ?? null,
    provenance: {},
  }) as unknown as SessionEventEnvelopeV1;

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
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

const windowOf = (nodes: readonly RuntimeTrajectoryNode[]): RuntimeEventWindow => ({
  events: nodes.map(toEvent),
  fromSeq: 0,
  throughJournalSeq: nodes.at(-1)!.eventSeq,
  beforeSeq: null,
  turnOffset: 0,
  requestOffset: 0,
});

describe.runIf(process.env.TRAJECTORY_PERF === "1")("trajectory streaming frame cost", () => {
  for (const chunks of [40, 2000]) {
    it(`measures one streaming frame with ${chunks} chunks of live output`, () => {
      // The Journal does not change while a reply streams: the settled layer is built once, each frame only
      // merges the live run's output into the placeholder.
      const { snapshot, live } = streamingLongFixture(chunks);
      const projected = projectTrajectoryWindow("mock-long-session", windowOf(snapshot.nodes));
      const layout = deriveLayout(buildTrajectorySnapshot(projected, { liveMessageIds: liveMessageIds(live) }));
      const frame = measure(() => {
        expect(streamingCells(layout.cells, live).size).toBe(1);
      });
      console.log(`[trajectory-perf] streaming frame nodes=${snapshot.nodes.length} chunks=${chunks}`, ms(frame));
      expect(frame.p95).toBeLessThan(2);
    });
  }

  it("measures the settled rebuild a Journal event triggers", () => {
    const { snapshot, live } = streamingLongFixture(2000);
    const stages = {
      project: measure(() => {
        projectTrajectoryWindow("mock-long-session", windowOf(snapshot.nodes));
      }),
      rebuild: measure(() => {
        flattenLayout(deriveLayout(buildTrajectorySnapshot(snapshot, { liveMessageIds: liveMessageIds(live) })).turns);
      }),
    };
    console.log(
      "[trajectory-perf] settled rebuild",
      JSON.stringify(Object.fromEntries(Object.entries(stages).map(([key, value]) => [key, ms(value)]))),
    );
  });
});
