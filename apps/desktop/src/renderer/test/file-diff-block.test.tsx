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
  it("rounds generation counts, shows saving, then replaces progress with final diff", () => {
    const { rerender } = render(<FileDiffBlock message={makeWriteBlock({ status: "running", generationProgress: { phase: "generating", characters: 2499 } })} />);
    expect(screen.getByText("Write 夜雨.md · 已生成 2.4 千字符")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<FileDiffBlock message={makeWriteBlock({ status: "running", generationProgress: { phase: "saving", characters: 2499 } })} />);
    expect(screen.getByText("Write 夜雨.md · 正在保存")).toBeInTheDocument();
    rerender(<FileDiffBlock message={makeWriteBlock({ additions: 35, generationProgress: { phase: "saving", characters: 2499 } })} />);
    expect(screen.getByText("+35")).toBeInTheDocument();
    expect(screen.queryByText(/正在保存|已生成/)).toBeNull();
  });

  it("hides generation amounts when the existing display setting is disabled", async () => {
    window.actspace = { getSettingsV4: async () => ({ settings: { tools: { showFileChangeStats: false } } }) } as unknown as Window["actspace"];
    try {
      render(<FileDiffBlock message={makeEditBlock({ status: "running", generationProgress: { phase: "generating", characters: 2400 } })} />);
      expect(await screen.findByText("Edit index.ts · 正在生成")).toBeInTheDocument();
      expect(screen.queryByText(/字符/)).toBeNull();
    } finally { delete (window as unknown as { actspace?: unknown }).actspace; }
  });

  it("shows a single-line shimmer with generation status", () => {
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

    const runningLine = screen.getByText("Write 夜雨.md · 正在生成");
    expect(runningLine).toBeInTheDocument();
    expect(runningLine).toHaveClass("tool-log-text-running");
    expect(runningLine).toHaveAttribute("data-shimmer-text", "Write 夜雨.md · 正在生成");
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

  it("does not render file contents while a write is running", () => {
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

    expect(screen.getByText(/Write 夜雨\.md · 正在生成/)).toBeInTheDocument();
    expect(screen.queryByText(/半夜醒来/)).toBeNull();
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

    expect(screen.getByText("Edit index.ts · 正在生成")).toBeInTheDocument();
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

  it("omits zero change counters after a completed no-op", () => {
    render(<FileDiffBlock message={makeWriteBlock({ additions: 0, deletions: 0 })} />);
    expect(screen.queryByText(/\+0/)).toBeNull();
    expect(screen.queryByText(/-0/)).toBeNull();
  });

  it("shows generation status instead of zero counters while running", () => {
    render(<FileDiffBlock message={makeWriteBlock({ status: "running", additions: 0, deletions: 0, diff: "", collapsedLines: 0 })} />);
    expect(screen.getByText("Write 夜雨.md · 正在生成")).toBeInTheDocument();
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

  it("submits once when allowing an out-of-workspace edit", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    window.actspace = { submitApproval } as unknown as Window["actspace"];

    render(<FileDiffBlock message={makePendingEditBlock()} />);

    expect(screen.getByText("Edit file requires approval")).toBeInTheDocument();
    expect(screen.getByText("vocab.md")).toBeInTheDocument();
    expect(screen.getByText(/outside the workspace/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Allow" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-edit-1",
      decision: "once",
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

  it("submits only a Runtime suggestion id for Session scope and reveals subtree explicitly", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    window.actspace = {
      submitApproval,
      listPendingApprovals: async () => [{
        requestId: "approval-edit-1", toolName: "edit_file", summary: "Edit", reason: "Outside workspace", createdAt: Date.now(), expiresAt: Date.now() + 60_000,
        grantSuggestions: [
          { suggestionId: "exact-1", lifetime: "session", action: "file.write", access: "write", selector: { kind: "exact", canonicalPath: "/Users/me/.agents/vocab.md" }, audience: { pluginId: "actspace.core-tools", permissionDomain: "core-files", policyVersion: 1 }, label: "This file only" },
          { suggestionId: "tree-1", lifetime: "session", action: "file.write", access: "write", selector: { kind: "subtree", canonicalRoot: "/Users/me/.agents" }, audience: { pluginId: "actspace.core-tools", permissionDomain: "core-files", policyVersion: 1 }, label: "This directory tree" },
        ],
      }],
    } as unknown as Window["actspace"];

    render(<FileDiffBlock message={makePendingEditBlock()} />);
    expect(await screen.findByRole("button", { name: "本会话允许此文件" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "本会话允许此目录树" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "选择目录范围" }));
    await userEvent.click(screen.getByRole("button", { name: "本会话允许此目录树" }));
    expect(submitApproval).toHaveBeenCalledWith({ requestId: "approval-edit-1", decision: "session", suggestionId: "tree-1" });
  });
});
