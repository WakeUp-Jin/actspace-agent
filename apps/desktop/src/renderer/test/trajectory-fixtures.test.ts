import { buildTrajectorySnapshot } from "../trajectory";
import { describe, expect, it } from "vitest";
import { loadTrajectoryFixture, loadTrajectoryFixtureFromUrl, trajectoryFixtureName, validateTrajectoryFixture } from "../trajectory/fixtures";

describe("trajectory fixture loader", () => {
  it("requires an explicit supported query flag", () => {
    expect(loadTrajectoryFixtureFromUrl("http://127.0.0.1:5173/")).toBeNull();
    expect(trajectoryFixtureName("?trajectoryFixture=unknown")).toBeNull();
    expect(trajectoryFixtureName("http://127.0.0.1:5173/?trajectoryFixture=running")).toBe("running");
  });

  it("provides complete, running, error, long and empty snapshots", () => {
    const complete = loadTrajectoryFixture("complete");
    const running = loadTrajectoryFixture("running");
    const errors = loadTrajectoryFixture("errors");
    const long = loadTrajectoryFixture("long");
    const empty = loadTrajectoryFixture("empty");
    expect(complete.nodes.length).toBeGreaterThan(40);
    expect(running.nodes.some(node => node.eventType === "assistant/chunk")).toBe(true);
    expect(running.nodes.some(node => node.eventType === "tool/result")).toBe(false);
    expect(errors.nodes.some(node => node.state === "failed")).toBe(true);
    expect(long.nodes.length).toBeGreaterThan(complete.nodes.length * 4);
    expect(empty.nodes).toHaveLength(0);
    expect(empty.throughJournalSeq).toBe(-1);
  });
  it("rejects duplicate event identities and keeps long batches independently paired", () => {
    const complete = loadTrajectoryFixture("complete");
    expect(() => validateTrajectoryFixture({ ...complete, nodes: [complete.nodes[0], complete.nodes[0]] })).toThrow();
    const raw = loadTrajectoryFixture("long");
    validateTrajectoryFixture(raw);
    const runtime = buildTrajectorySnapshot(raw);
    expect(runtime.turns).toHaveLength(144);
    expect(new Set(runtime.records.map(record => record.id)).size).toBe(runtime.records.length);
    expect(runtime.records.filter(record => record.kind === "tool")).toHaveLength(7 * 24);
    expect(runtime.records.filter(record => record.kind === "tool").every(record => record.durationMs === 1200)).toBe(true);
  });

});
