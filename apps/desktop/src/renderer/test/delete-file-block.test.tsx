import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { DeleteFileBlock } from "../components/messages/DeleteFileBlock";
import { ToolLogLine } from "../components/messages/ToolLogLine";
import { setupBridge } from "./helpers/bridge";

function makeDeleteBlock(
  partial: Partial<Extract<MessageBlock, { kind: "delete" }>> = {},
): Extract<MessageBlock, { kind: "delete" }> {
  return {
    kind: "delete",
    id: "delete-1",
    filePath: "notes.md",
    displayText: "Delete file requires approval",
    createdAt: "2026-06-02T00:00:00.000Z",
    status: "pending",
    approvalRequestId: "approval-delete-1",
    reason: "delete_file is a destructive file operation and requires approval.",
    ...partial,
  };
}

describe("DeleteFileBlock", () => {
  it("submits a one-time delete approval", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    setupBridge({ "approvals.submit": submitApproval });

    render(<DeleteFileBlock message={makeDeleteBlock()} />);

    const row = screen.getByRole("article");
    expect(row).toHaveClass("approval-row", "border-danger/35");
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    // 通用删除提示不重复展示，也不提供会话级授权。
    expect(screen.queryByText(/destructive file operation/)).toBeNull();
    expect(screen.queryByLabelText("审批原因")).toBeNull();
    expect(screen.queryByRole("button", { name: "本会话" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-delete-1",
      decision: "once",
    });
    expect(await screen.findByText("Delete notes.md")).toBeInTheDocument();
  });

  it("submits deny when skipping delete", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    setupBridge({ "approvals.submit": submitApproval });

    render(<DeleteFileBlock message={makeDeleteBlock()} />);

    await userEvent.click(screen.getByRole("button", { name: "拒绝" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-delete-1",
      decision: "deny",
    });
    expect(await screen.findByText("Denied delete notes.md")).toBeInTheDocument();
  });

  it("keeps the approval block open when the bridge rejects the decision", async () => {
    const submitApproval = vi.fn(async () => ({ ok: false, reason: "not_found_or_already_resolved" }));
    setupBridge({ "approvals.submit": submitApproval });

    render(<DeleteFileBlock message={makeDeleteBlock()} />);

    await userEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-delete-1",
      decision: "once",
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "删除" })).toBeEnabled();
    });
    expect(screen.getByRole("article")).toHaveClass("approval-row");
    expect(screen.queryByText("Delete notes.md")).toBeNull();
  });
});

describe("ToolLogLine delete state", () => {
  it("renders completed delete as a lightweight tool line", () => {
    render(<ToolLogLine message={makeDeleteBlock({ status: "completed", displayText: "Deleted notes.md" })} />);

    expect(screen.getByText("Deleted notes.md")).toBeInTheDocument();
  });
});
