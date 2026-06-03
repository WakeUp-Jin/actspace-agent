import { render, screen } from "@testing-library/react";
import type { MessageBlock } from "@actspace/shared";
import { CompactCommandBlock } from "../components/messages/CompactCommandBlock";

function makeBlock(
  partial: Partial<Extract<MessageBlock, { kind: "context_compaction" }>>,
): Extract<MessageBlock, { kind: "context_compaction" }> {
  return {
    kind: "context_compaction",
    id: "compact-1",
    status: "running",
    trigger: "manual",
    summaryText: "Compacting context",
    createdAt: "2026-06-02T00:00:00.000Z",
    ...partial,
  };
}

describe("CompactCommandBlock", () => {
  it("renders the pending command line", () => {
    render(<CompactCommandBlock message={makeBlock({ status: "pending", summaryText: "/compact" })} />);

    expect(screen.getByText("/compact")).toBeInTheDocument();
  });

  it("renders running stage without requiring a fake percentage", () => {
    render(<CompactCommandBlock message={makeBlock({ status: "running", stage: "summarizing" })} />);

    expect(screen.getByText("Compacting context")).toBeInTheDocument();
    expect(screen.getByText("Summarizing")).toBeInTheDocument();
  });

  it("renders completed reduction label", () => {
    render(
      <CompactCommandBlock
        message={makeBlock({
          status: "completed",
          summaryText: "Context compacted",
          reductionLabel: "18 messages removed",
        })}
      />,
    );

    expect(screen.getByText("Context compacted")).toBeInTheDocument();
    expect(screen.getByText("18 messages removed")).toBeInTheDocument();
  });

  it("renders skipped and failed states", () => {
    const { rerender } = render(
      <CompactCommandBlock message={makeBlock({ status: "skipped", summaryText: "Nothing to compact" })} />,
    );
    expect(screen.getByText("Nothing to compact")).toBeInTheDocument();

    rerender(<CompactCommandBlock message={makeBlock({ status: "failed", summaryText: "Compaction failed" })} />);
    expect(screen.getByText("Compaction failed")).toBeInTheDocument();
  });
});
