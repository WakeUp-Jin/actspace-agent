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
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders running stage as text and a full-width progressbar", () => {
    render(<CompactCommandBlock message={makeBlock({ status: "running", stage: "summarizing" })} />);

    expect(screen.getByText("Compacting context")).toBeInTheDocument();
    expect(screen.getByText("Summarizing older messages")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Context compaction progress" })).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders completed state as an independent divider", () => {
    const { container } = render(
      <CompactCommandBlock
        message={makeBlock({
          status: "completed",
          summaryText: "Context compacted · 18 messages",
        })}
      />,
    );

    expect(screen.getByRole("separator", { name: "Context compacted · 18 messages" })).toBeInTheDocument();
    expect(screen.getByText("Context compacted · 18 messages")).toBeInTheDocument();
    expect(container.querySelector(".compact-command-block")).toHaveClass("w-full");
    expect(container.querySelector(".compact-command-block")).not.toHaveClass("max-w-[720px]");
    expect(screen.queryByText("18 messages removed")).not.toBeInTheDocument();
    expect(document.querySelector("svg")).toBeNull();
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
