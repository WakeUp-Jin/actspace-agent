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

  it("keeps the summary stable while long command previews truncate", () => {
    renderBash({
      id: "bash-long-preview-1",
      kind: "bash",
      createdAt: "2026-07-09T00:00:00.000Z",
      title: "Bash command",
      status: "success",
      command: "\"/Users/wakeup-jin/Library/Application Support/actspace/plugins/browser-bridge/bin/abb\" doctor --json",
      commandPreview:
        "\"/Users/wakeup-jin/Library/Application Support/actspace/plugins/browser-bridge/bin/abb\" doctor",
      exitCode: 0,
      sandboxed: true,
    });

    const summary = screen.getByText("Ran Bash command");
    const preview = screen.getByText(
      "\"/Users/wakeup-jin/Library/Application Support/actspace/plugins/browser-bridge/bin/abb\" doctor",
    );
    const toggle = summary.closest("button");

    expect(toggle).toHaveClass("flex", "w-full", "overflow-hidden");
    expect(summary).toHaveClass("bash-run-summary", "flex-none", "whitespace-nowrap");
    expect(preview).toHaveClass("bash-command-preview", "min-w-0", "flex-1", "overflow-hidden", "text-ellipsis");
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

  it("shows a subdued sandbox badge for sandboxed commands", () => {
    renderBash({
      id: "bash-sbx-1",
      kind: "bash",
      createdAt: "2026-07-04T00:00:00.000Z",
      title: "Bash command",
      status: "success",
      command: "pnpm test",
      exitCode: 0,
      sandboxed: true,
    });

    expect(screen.getByText("沙盒")).toBeInTheDocument();
    expect(screen.queryByText("真实环境")).not.toBeInTheDocument();
  });

  it("shows a prominent real-environment badge for unsandboxed commands", () => {
    renderBash({
      id: "bash-sbx-2",
      kind: "bash",
      createdAt: "2026-07-04T00:00:00.000Z",
      title: "Bash command",
      status: "success",
      command: "npm i -g foo",
      exitCode: 0,
      sandboxed: false,
    });

    const badge = screen.getByText("真实环境");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bash-real-env-badge");
  });

  it("shows no environment badge when sandboxed is unknown (historical data)", () => {
    renderBash({
      id: "bash-sbx-3",
      kind: "bash",
      createdAt: "2026-07-04T00:00:00.000Z",
      title: "Bash command",
      status: "success",
      command: "pwd",
      exitCode: 0,
    });

    expect(screen.queryByText("沙盒")).not.toBeInTheDocument();
    expect(screen.queryByText("真实环境")).not.toBeInTheDocument();
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
