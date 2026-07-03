import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MessageBlock } from "@actspace/shared";
import { FileDiffBlock } from "../components/messages/FileDiffBlock";

function makeWriteBlock(
  partial: Partial<Extract<MessageBlock, { kind: "write_diff" }>>,
): Extract<MessageBlock, { kind: "write_diff" }> {
  return {
    kind: "write_diff",
    id: "msg-1",
    filePath: "夜雨.md",
    additions: 35,
    deletions: 0,
    diff: "+# 夜雨\n+\n+半夜醒来",
    collapsedLines: 5,
    createdAt: new Date().toISOString(),
    status: "completed",
    ...partial,
  };
}

function makeEditBlock(
  partial: Partial<Extract<MessageBlock, { kind: "edit_diff" }>> = {},
): Extract<MessageBlock, { kind: "edit_diff" }> {
  return {
    kind: "edit_diff",
    id: "edit-1",
    filePath: "index.ts",
    additions: 3,
    deletions: 1,
    diff: "+new\n-old\n+line",
    collapsedLines: 5,
    createdAt: new Date().toISOString(),
    status: "completed",
    ...partial,
  };
}

describe("FileDiffBlock running state", () => {
  it("shows single-line shimmer for write running without streamingContent", () => {
    render(
      <FileDiffBlock
        message={makeWriteBlock({
          status: "running",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
        })}
      />,
    );

    const runningLine = screen.getByText("Write 夜雨.md");
    expect(runningLine).toBeInTheDocument();
    expect(runningLine).toHaveClass("tool-log-text-running");
    expect(runningLine).toHaveAttribute("data-shimmer-text", "Write 夜雨.md");
    expect(screen.queryByText(/\+\d+/)).toBeNull();
  });

  it("falls back to 'file…' label when filePath unknown (dispatched stage)", () => {
    render(
      <FileDiffBlock
        message={makeWriteBlock({
          status: "running",
          filePath: "",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
        })}
      />,
    );

    expect(screen.getByText(/Write file/)).toBeInTheDocument();
  });

  it("expands code preview when streamingContent present (cursor-style)", () => {
    render(
      <FileDiffBlock
        message={makeWriteBlock({
          status: "running",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
          streamingContent: "# 夜雨\n半夜醒来",
        })}
      />,
    );

    expect(screen.getByText(/Write 夜雨\.md/)).toBeInTheDocument();
    expect(screen.getByText(/半夜醒来/)).toBeInTheDocument();
  });

  it("edit running state stays single-line even with new_string in args", () => {
    render(
      <FileDiffBlock
        message={makeEditBlock({
          status: "running",
          filePath: "index.ts",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
        })}
      />,
    );

    expect(screen.getByText("Edit index.ts")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
  });
});

describe("FileDiffBlock completed state", () => {
  it("keeps expanded diff content in a bounded scroll area", () => {
    const css = readFileSync(resolve(__dirname, "../styles/diff.css"), "utf-8");
    const block = css.match(/\.file-diff-content\s*\{[^}]+\}/)?.[0] ?? "";

    expect(block).toContain("max-height: 420px");
    expect(block).toContain("overflow-y: auto");
    expect(block).toContain("overflow-x: auto");
  });

  it("omits +0 when additions are zero", () => {
    render(<FileDiffBlock message={makeWriteBlock({ additions: 0, deletions: 0 })} />);
    expect(screen.queryByText(/\+0/)).toBeNull();
    expect(screen.queryByText(/-0/)).toBeNull();
  });

  it("renders +N and -N when both present", () => {
    render(<FileDiffBlock message={makeEditBlock({ additions: 5, deletions: 2 })} />);
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText("-2")).toBeInTheDocument();
  });

  it("expands full diff on click", async () => {
    const user = userEvent.setup();
    render(<FileDiffBlock message={makeWriteBlock({ additions: 35 })} />);

    expect(screen.queryByText(/半夜醒来/)).toBeNull();
    const toggle = screen.getByRole("button");
    await user.click(toggle);
    const diffLine = screen.getByText(/半夜醒来/);
    expect(diffLine).toBeInTheDocument();
    expect(diffLine.closest("pre")).toHaveClass("file-diff-content");
  });
});
