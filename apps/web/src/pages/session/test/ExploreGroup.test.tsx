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
