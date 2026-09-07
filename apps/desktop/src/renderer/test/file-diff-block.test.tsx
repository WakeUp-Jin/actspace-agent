import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, afterEach } from "vitest";
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

  it("keeps the streaming write preview pinned to its latest content", () => {
    const { rerender } = render(
      <FileDiffBlock
        message={makeWriteBlock({
          status: "running",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
          streamingContent: "line 1",
        })}
      />,
    );

    const preview = screen.getByLabelText("Streaming write preview for 夜雨.md");
    Object.defineProperty(preview, "scrollHeight", { configurable: true, value: 360 });
    Object.defineProperty(preview, "clientHeight", { configurable: true, value: 120 });
    Object.defineProperty(preview, "scrollTop", { configurable: true, writable: true, value: 0 });

    rerender(
      <FileDiffBlock
        message={makeWriteBlock({
          status: "running",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
          streamingContent: "line 1\nline 2",
        })}
      />,
    );

    expect(preview.scrollTop).toBe(360);
  });

  it("pauses streaming preview follow while the user reads earlier content and resumes near the bottom", () => {
    const { rerender } = render(
      <FileDiffBlock
        message={makeWriteBlock({
          status: "running",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
          streamingContent: "line 1",
        })}
      />,
    );

    const preview = screen.getByLabelText("Streaming write preview for 夜雨.md");
    Object.defineProperty(preview, "scrollHeight", { configurable: true, value: 360 });
    Object.defineProperty(preview, "clientHeight", { configurable: true, value: 120 });
    Object.defineProperty(preview, "scrollTop", { configurable: true, writable: true, value: 0 });
    fireEvent.scroll(preview);

    rerender(
      <FileDiffBlock
        message={makeWriteBlock({
          status: "running",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
          streamingContent: "line 1\nline 2",
        })}
      />,
    );

    expect(preview.scrollTop).toBe(0);

    preview.scrollTop = 240;
    fireEvent.scroll(preview);
    Object.defineProperty(preview, "scrollHeight", { configurable: true, value: 480 });

    rerender(
      <FileDiffBlock
        message={makeWriteBlock({
          status: "running",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
          streamingContent: "line 1\nline 2\nline 3",
        })}
      />,
    );

    expect(preview.scrollTop).toBe(480);
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

describe("FileDiffBlock failed / denied states", () => {
  it("renders failed edit with an error detail instead of a fake diff", () => {
    render(
      <FileDiffBlock
        message={makeEditBlock({
          status: "failed",
          additions: 0,
          deletions: 0,
          diff: "",
          errorMessage: "old_string not found in file.",
        })}
      />,
    );

    expect(screen.getByText("Edit index.ts failed")).toBeInTheDocument();
    expect(screen.getByText("old_string not found in file.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders denied write as an error log line", () => {
    render(
      <FileDiffBlock
        message={makeWriteBlock({
          status: "denied",
          additions: 0,
          deletions: 0,
          diff: "",
        })}
      />,
    );

    expect(screen.getByText("Denied write 夜雨.md")).toBeInTheDocument();
  });
});

describe("FileDiffBlock approval state", () => {
  afterEach(() => {
    delete (window as unknown as { actspace?: unknown }).actspace;
  });

  function makePendingEditBlock() {
    return makeEditBlock({
      status: "pending",
      additions: 0,
      deletions: 0,
      diff: "",
      filePath: "vocab.md",
      approvalRequestId: "approval-edit-1",
      reason: "Target path is outside the workspace: /Users/me/.agents/vocab.md",
    });
  }

  it("submits approve_once when allowing an out-of-workspace edit", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    window.actspace = { submitApproval } as unknown as Window["actspace"];

    render(<FileDiffBlock message={makePendingEditBlock()} />);

    expect(screen.getByText("Edit file requires approval")).toBeInTheDocument();
    expect(screen.getByText("vocab.md")).toBeInTheDocument();
    expect(screen.getByText(/outside the workspace/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Allow" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-edit-1",
      decision: "approve_once",
    });
    expect(await screen.findByText("Edit vocab.md")).toBeInTheDocument();
  });

  it("submits deny when skipping", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    window.actspace = { submitApproval } as unknown as Window["actspace"];

    render(<FileDiffBlock message={makePendingEditBlock()} />);

    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-edit-1",
      decision: "deny",
    });
    expect(await screen.findByText("Denied edit vocab.md")).toBeInTheDocument();
  });
});
