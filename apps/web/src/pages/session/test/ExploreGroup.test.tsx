import { render, screen } from "@testing-library/react";
import type { ExploreBlock } from "../../../sessions/transcript-model";
import { ExploreGroup, exploreLine } from "../blocks/ExploreGroup";

const at = "2026-11-15T00:00:00.000Z";
const deep = (overrides: Partial<Extract<ExploreBlock, { kind: "deep_search" }>> = {}): ExploreBlock => ({ kind: "deep_search", id: "ds", question: "2026 electric car sales", displayText: "Deep Search 2026 electric car sales", createdAt: at, status: "completed", stats: "6 searches · 11 sources", ...overrides });

describe("ExploreGroup deep search row", () => {
  it("shows the action, the question and the stats", () => {
    expect(exploreLine(deep())).toEqual({ verb: "Deep Search", target: "2026 electric car sales", meta: "6 searches · 11 sources" });
    render(<ExploreGroup blocks={[deep()]} />);
    expect(screen.getByText("Deep Search")).toBeInTheDocument();
    expect(screen.getByText("6 searches · 11 sources")).toBeInTheDocument();
  });

  it("has no row end when there are no stats", () => {
    expect(exploreLine(deep({ stats: undefined, status: "failed" }))).toEqual({ verb: "Deep Search", target: "2026 electric car sales" });
  });
});

describe("ExploreGroup read rows", () => {
  const read = (overrides: Partial<Extract<ExploreBlock, { kind: "read" }>> = {}): ExploreBlock => ({ kind: "read", id: "r", filePath: "", displayText: "x", createdAt: at, status: "completed", ...overrides });

  it("shows a document row's name and page stats", () => {
    expect(exploreLine(read({ document: { name: "季度报告.pdf", stats: "2 pages" } }))).toEqual({ verb: "Read", target: "季度报告.pdf", meta: "2 pages" });
    expect(exploreLine(read({ filePath: "docs/big.pdf", document: { name: "big.pdf", stats: "pages 31-45" } }))).toEqual({ verb: "Read", target: "big.pdf", meta: "pages 31-45" });
  });

  it("keeps a plain read row's path and range", () => {
    expect(exploreLine(read({ filePath: "src/a.ts", range: "1-40" }))).toEqual({ verb: "Read", target: "src/a.ts", meta: "1-40" });
    expect(exploreLine(read({ filePath: "src/a.ts" }))).toEqual({ verb: "Read", target: "src/a.ts" });
  });
});
