import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { BrowserApprovalBlock } from "../components/messages/BrowserApprovalBlock";
import { setupBridge } from "./helpers/bridge";

function makeMessage(): Extract<MessageBlock, { kind: "tool" }> {
  return {
    kind: "tool",
    id: "browser-tool-1",
    toolName: "browser_tabs",
    title: "Browser tabs · create · https://example.com",
    content: "等待浏览器授权",
    createdAt: "2026-07-11T00:00:00.000Z",
    status: "pending",
    approvalRequestId: "browser-approval-1",
    approvalScope: "browser_session",
  };
}

describe("BrowserApprovalBlock", () => {
  it("approves only the displayed browser action", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    setupBridge({ "approvals.submit": submitApproval });
    render(<BrowserApprovalBlock message={makeMessage()} />);

    expect(screen.getByText("确认浏览器操作")).toBeInTheDocument();
    expect(screen.getByText("仅这次")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "允许这次" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "允许这次" }));
    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "browser-approval-1",
      decision: "once",
    });
    expect(await screen.findByText(/正在执行这次浏览器操作/)).toBeInTheDocument();
  });

  it("denies the current action", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    setupBridge({ "approvals.submit": submitApproval });
    render(<BrowserApprovalBlock message={makeMessage()} />);

    await userEvent.click(screen.getByRole("button", { name: "拒绝" }));
    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "browser-approval-1",
      decision: "deny",
    });
    expect(await screen.findByText(/已拒绝这次浏览器操作/)).toBeInTheDocument();
  });

  it("keeps the card actionable when submitting fails", async () => {
    setupBridge({
      "approvals.submit": vi.fn(async () => ({ ok: false, reason: "expired" })),
    });
    render(<BrowserApprovalBlock message={makeMessage()} />);

    await userEvent.click(screen.getByRole("button", { name: "允许这次" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "允许这次" })).toBeEnabled());
  });
});
