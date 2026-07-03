import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { BashRunBlock } from "../components/messages/BashRunBlock";
import { TooltipProvider } from "../components/ui/Tooltip";

function renderBash(message: Extract<MessageBlock, { kind: "bash" }>) {
  return render(
    <TooltipProvider delayDuration={0}>
      <BashRunBlock message={message} />
    </TooltipProvider>,
  );
}

describe("BashRunBlock tooltips", () => {
  it("shows a readable tooltip for Bash output actions", async () => {
    const user = userEvent.setup();
    renderBash({
      id: "bash-1",
      kind: "bash",
      createdAt: "2026-06-02T00:00:00.000Z",
      title: "Bash command",
      status: "failed",
      command: "pnpm test",
      stdout: "failed",
      exitCode: 1,
    });

    await user.hover(screen.getByRole("button", { name: "Open Bash output actions" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("更多 Bash 输出操作");
  });

  it("applies the shimmer running highlight while the command is executing", () => {
    renderBash({
      id: "bash-running-1",
      kind: "bash",
      createdAt: "2026-07-03T00:00:00.000Z",
      title: "Bash command",
      status: "running",
      command: "pnpm test",
    });

    const summary = screen.getByText("Running Bash command");
    expect(summary).toHaveClass("tool-log-text-running");
    expect(summary).toHaveAttribute("data-shimmer-text", "Running Bash command");
  });

  it("stops the shimmer once the background task reaches a terminal state", () => {
    renderBash({
      id: "bash-running-2",
      kind: "bash",
      createdAt: "2026-07-03T00:00:00.000Z",
      title: "Bash command (background)",
      status: "running",
      command: "pnpm build",
      backgroundTaskId: "bash_ghi789",
      backgroundStatus: "completed",
    });

    const summary = screen.getByText("Running Bash command (background)");
    expect(summary).not.toHaveClass("tool-log-text-running");
  });

  it("shows a background badge for backgrounded commands", () => {
    renderBash({
      id: "bash-bg-1",
      kind: "bash",
      createdAt: "2026-07-03T00:00:00.000Z",
      title: "Bash command (background)",
      status: "running",
      command: "pnpm dev",
      backgroundTaskId: "bash_abc123",
      backgroundStatus: "running",
      outputFilePath: "/tmp/tool-output/s1/x-bash.txt",
    });

    expect(screen.getByText("后台运行中")).toBeInTheDocument();
  });

  it("shows the terminal background state after a task update", () => {
    renderBash({
      id: "bash-bg-2",
      kind: "bash",
      createdAt: "2026-07-03T00:00:00.000Z",
      title: "Bash command (background)",
      status: "running",
      command: "pnpm build",
      backgroundTaskId: "bash_def456",
      backgroundStatus: "completed",
      exitCode: 0,
    });

    expect(screen.getByText("后台完成")).toBeInTheDocument();
  });

  it("shows a readable tooltip for approval actions", async () => {
    const user = userEvent.setup();
    renderBash({
      id: "bash-approval-1",
      kind: "bash",
      createdAt: "2026-06-02T00:00:00.000Z",
      title: "Approval required",
      status: "pending",
      command: "pnpm build",
      approvalRequestId: "approval-1",
    });

    await user.hover(screen.getByRole("button", { name: "Open approval actions" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("更多审批操作");
  });
});
