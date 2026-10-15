import { describe, expect, it } from "vitest";
import { buildTrajectorySnapshot, deriveLayout, TrajectorySearchIndex, type TrajectoryCell } from "../trajectory";
import { loadTrajectoryFixture } from "../trajectory/fixtures";

const cells = deriveLayout(buildTrajectorySnapshot(loadTrajectoryFixture("errors"))).cells;
const searchable = cells.filter(cell => !cell.requestOnly);

describe("TrajectorySearchIndex", () => {
  it("generates text once per record and reports no change for the same cells", () => {
    const index = new TrajectorySearchIndex();
    expect(index.update(cells)).toBe(true);
    expect(index.generated).toBe(searchable.length);
    expect(index.update(cells)).toBe(false);
    expect(index.generated).toBe(searchable.length);
  });

  it("regenerates only the record that changed and drops removed records", () => {
    const index = new TrajectorySearchIndex();
    index.update(cells);
    const target = searchable.find(cell => cell.kind === "message")!;
    const changed: TrajectoryCell = { ...target, record: { ...target.record, summary: "zebra-marker" } };
    expect(index.search("zebra-marker")?.size).toBe(0);
    expect(index.update(cells.map(cell => cell === target ? changed : cell))).toBe(true);
    expect(index.generated).toBe(searchable.length + 1);
    expect(index.search("zebra-marker")).toEqual(new Set([target.recordId]));
    expect(index.update(cells.filter(cell => cell !== target))).toBe(true);
    expect(index.search("zebra-marker")?.size).toBe(0);
  });

  it("matches every term, case-insensitively, and returns null for an empty query", () => {
    const index = new TrajectorySearchIndex();
    index.update(cells);
    expect(index.search("   ")).toBeNull();
    const tools = index.search("TOOL")!;
    expect(tools.size).toBeGreaterThan(0);
    const failedTools = index.search("tool failed")!;
    expect([...failedTools].every(id => tools.has(id))).toBe(true);
    expect(failedTools.size).toBeLessThanOrEqual(tools.size);
    // Request-only cells have no record content to search.
    expect([...tools].every(id => searchable.some(cell => cell.recordId === id))).toBe(true);
  });
});
