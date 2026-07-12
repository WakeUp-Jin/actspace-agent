import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { BrowserApprovalBlock } from "../components/messages/BrowserApprovalBlock";

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
  afterEach(() => {
    delete (window as unknown as { actspace?: unknown }).actspace;
  });

  it("allows Browser Use for the session with a single simple action", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    window.actspace = { submitApproval } as unknown as Window["actspace"];
    render(<BrowserApprovalBlock message={makeMessage()} />);

    expect(screen.getByText("允许 ActSpace 在当前会话中使用浏览器？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "允许" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "允许" }));
    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "browser-approval-1",
      decision: "approve_once",
    });
    expect(await screen.findByText(/正在连接浏览器/)).toBeInTheDocument();
  });

  it("denies only the current turn", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    window.actspace = { submitApproval } as unknown as Window["actspace"];
    render(<BrowserApprovalBlock message={makeMessage()} />);

    await userEvent.click(screen.getByRole("button", { name: "拒绝" }));
    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "browser-approval-1",
      decision: "deny",
    });
    expect(await screen.findByText(/本轮浏览器授权已拒绝/)).toBeInTheDocument();
  });

  it("keeps the card actionable when submitting fails", async () => {
    window.actspace = {
      submitApproval: vi.fn(async () => ({ ok: false, reason: "expired" })),
    } as unknown as Window["actspace"];
    render(<BrowserApprovalBlock message={makeMessage()} />);

    await userEvent.click(screen.getByRole("button", { name: "允许" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "允许" })).toBeEnabled());
  });
});
