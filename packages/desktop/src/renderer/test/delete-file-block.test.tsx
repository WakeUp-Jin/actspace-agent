import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { DeleteFileBlock } from "../components/messages/DeleteFileBlock";
import { ToolLogLine } from "../components/messages/ToolLogLine";

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
  afterEach(() => {
    delete (window as unknown as { actspace?: unknown }).actspace;
  });

  it("submits a one-time delete approval", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    window.actspace = { submitApproval } as unknown as Window["actspace"];

    render(<DeleteFileBlock message={makeDeleteBlock()} />);

    expect(screen.getByText("Delete file requires approval")).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-delete-1",
      decision: "approve_once",
    });
    expect(await screen.findByText("Delete notes.md")).toBeInTheDocument();
  });

  it("submits deny when skipping delete", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    window.actspace = { submitApproval } as unknown as Window["actspace"];

    render(<DeleteFileBlock message={makeDeleteBlock()} />);

    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-delete-1",
      decision: "deny",
    });
    expect(await screen.findByText("Denied delete notes.md")).toBeInTheDocument();
  });

  it("keeps the approval block open when the bridge rejects the decision", async () => {
    const submitApproval = vi.fn(async () => ({ ok: false, reason: "not_found_or_already_resolved" }));
    window.actspace = { submitApproval } as unknown as Window["actspace"];

    render(<DeleteFileBlock message={makeDeleteBlock()} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-delete-1",
      decision: "approve_once",
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    });
    expect(screen.getByText("Delete file requires approval")).toBeInTheDocument();
    expect(screen.queryByText("Delete notes.md")).toBeNull();
  });
});

describe("ToolLogLine delete state", () => {
  it("renders completed delete as a lightweight tool line", () => {
    render(<ToolLogLine message={makeDeleteBlock({ status: "completed", displayText: "Deleted notes.md" })} />);

    expect(screen.getByText("Deleted notes.md")).toBeInTheDocument();
  });
});
