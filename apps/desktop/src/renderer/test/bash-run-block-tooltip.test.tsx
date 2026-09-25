import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

    const summary = screen.getByText("Running");
    expect(summary).toHaveClass("tool-log-text-running");
    expect(summary).toHaveAttribute("data-shimmer-text", "Running");
  });

  it("keeps the summary stable while long command previews truncate", () => {
    renderBash({
      id: "bash-long-preview-1",
      kind: "bash",
      createdAt: "2026-07-09T00:00:00.000Z",
      title: "Bash command",
      status: "success",
      command: "\"/Users/wakeup-jin/Library/Application Support/actspace/browser-bridge/bin/abb\" doctor --json",
      commandPreview:
        "\"/Users/wakeup-jin/Library/Application Support/actspace/browser-bridge/bin/abb\" doctor",
      exitCode: 0,
      sandboxed: true,
    });

    const summary = screen.getByText("Ran");
    const preview = screen.getByText(
      "\"/Users/wakeup-jin/Library/Application Support/actspace/browser-bridge/bin/abb\" doctor",
    );
    const trailing = screen.getByRole("button", { name: /Ran/ }).querySelector(".bash-run-trailing");
    const toggle = summary.closest("button");

    expect(toggle).toHaveClass("flex", "w-full", "overflow-hidden");
    expect(summary).toHaveClass("bash-run-summary", "flex-none", "whitespace-nowrap");
    expect(preview).toHaveClass("bash-command-preview", "min-w-0", "flex-1", "overflow-hidden", "text-ellipsis");
    expect(trailing).toHaveClass("bash-run-trailing", "flex-none");
    expect(screen.queryByText("沙盒")).not.toBeInTheDocument();
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

    const summary = screen.getByText("Running");
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

  it("keeps routine sandbox metadata in execution details", async () => {
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

    expect(screen.queryByText("沙盒")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Ran/ }));
    expect(screen.getByText(/# environment: 沙盒/)).toBeInTheDocument();
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

  it("shows not executed when Bash was denied before process start", () => {
    renderBash({
      id: "bash-denied-1",
      kind: "bash",
      createdAt: "2026-07-25T00:00:00.000Z",
      title: "Bash command denied",
      status: "denied",
      command: "rm -rf /",
      notExecuted: true,
    });

    expect(screen.getByText("未执行")).toBeInTheDocument();
    expect(screen.queryByText("沙盒")).not.toBeInTheDocument();
    expect(screen.queryByText("真实环境")).not.toBeInTheDocument();
  });

  it("shows the planned environment in a Bash approval card", () => {
    renderBash({
      id: "bash-approval-env-1",
      kind: "bash",
      createdAt: "2026-07-25T00:00:00.000Z",
      title: "Delete directory",
      status: "pending",
      command: "rm -rf user-management",
      approvalRequestId: "approval-env-1",
      sandboxed: true,
    });

    expect(screen.getByText("沙盒")).toBeInTheDocument();
  });

  it("switches an approval card to not executed after deny", async () => {
    const originalActspace = window.actspace;
    const submitApproval = vi.fn(async () => ({ ok: true }));
    window.actspace = { ...originalActspace, submitApproval } as typeof window.actspace;
    try {
      renderBash({
        id: "bash-approval-deny-1",
        kind: "bash",
        createdAt: "2026-07-25T00:00:00.000Z",
        title: "Delete directory",
        status: "pending",
        command: "rm -rf user-management",
        approvalRequestId: "approval-deny-1",
        sandboxed: true,
      });

      await userEvent.click(screen.getByRole("button", { name: "拒绝" }));

      expect(await screen.findByText("未执行")).toBeInTheDocument();
      expect(screen.queryByText("沙盒")).not.toBeInTheDocument();
      expect(submitApproval).toHaveBeenCalledWith({
        requestId: "approval-deny-1",
        decision: "deny",
      });
    } finally {
      window.actspace = originalActspace;
    }
  });

  it("shows intent, command and cwd in the approval card with actions in the footer", () => {
    renderBash({
      id: "bash-approval-1",
      kind: "bash",
      createdAt: "2026-06-02T00:00:00.000Z",
      title: "Run Bash command: pnpm",
      intent: "构建桌面端",
      status: "pending",
      command: "pnpm build",
      cwd: "/workspace/actspace-agent",
      reason: "Allow Bash to run this command once?",
      policyLabel: "Allowlist",
      approvalRequestId: "approval-1",
    });

    const card = screen.getByRole("article");
    expect(card).toHaveClass("approval-card");
    expect(card.querySelector(".approval-card-head")).toHaveTextContent("运行构建桌面端");
    expect(screen.getByText("pnpm build", { exact: false })).toHaveClass("bash-approval-command");
    expect(screen.getByText("/workspace/actspace-agent")).toBeInTheDocument();
    const footer = card.querySelector(".approval-card-footer");
    expect(footer).toContainElement(screen.getByRole("button", { name: "运行" }));
    expect(footer).toContainElement(screen.getByRole("button", { name: "拒绝" }));
    // 通用审批提示、策略折叠不再出现。
    expect(screen.queryByText(/Allow Bash to run/)).toBeNull();
    expect(screen.queryByText("Allowlist")).toBeNull();
  });

  it("keeps the Bash approval actionable when the bridge rejects the decision", async () => {
    const originalActspace = window.actspace;
    const submitApproval = vi.fn(async () => ({ ok: false, reason: "expired" }));
    window.actspace = { ...originalActspace, submitApproval } as typeof window.actspace;
    try {
      renderBash({
        id: "bash-approval-reject-1",
        kind: "bash",
        createdAt: "2026-06-02T00:00:00.000Z",
        title: "Run Bash command: pnpm",
        status: "pending",
        command: "pnpm build",
        approvalRequestId: "approval-reject-1",
      });

      await userEvent.click(screen.getByRole("button", { name: "运行" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "运行" })).toBeEnabled());
      expect(screen.getByText("Bash 命令")).toBeInTheDocument();
    } finally {
      window.actspace = originalActspace;
    }
  });
});
