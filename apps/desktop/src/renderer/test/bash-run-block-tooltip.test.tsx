import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { BashRunBlock } from "../components/messages/BashRunBlock";
import { TooltipProvider } from "../components/ui/Tooltip";
import { overrideBridge } from "./helpers/bridge";

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
    expect(screen.getByRole("img", { name: "沙盒" })).toBeInTheDocument();
  });

  it("stops the shimmer once the background task reaches a terminal state", () => {
    renderBash({
      id: "bash-running-2",
      kind: "bash",
      createdAt: "2026-07-03T00:00:00.000Z",
      title: "Bash command (background)",
      command: "pnpm build",
      backgroundTaskId: "bash_ghi789",
      background: true,
      status: "success",
    });

    const summary = screen.getByText("Ran");
    expect(summary).not.toHaveClass("tool-log-text-running");
  });

  it("shows a single background tag for backgrounded commands", () => {
    renderBash({
      id: "bash-bg-1",
      kind: "bash",
      createdAt: "2026-07-03T00:00:00.000Z",
      title: "Bash command (background)",
      status: "running",
      command: "pnpm dev",
      backgroundTaskId: "bash_abc123",
      background: true,
      outputFilePath: "/tmp/tool-output/s1/x-bash.txt",
    });

    expect(screen.getByText("后台")).toBeInTheDocument();
  });

  it("marks sandboxed commands with the sandbox shield and keeps the environment in details", async () => {
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

    const badge = screen.getByRole("img", { name: "沙盒" });
    expect(badge).toHaveClass("bash-sandbox-badge");
    expect(badge).toHaveAttribute("title", expect.stringContaining("沙盒内运行"));
    expect(screen.queryByText("沙盒")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Ran/ }));
    expect(screen.getByText(/# environment: 沙盒/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "真实环境" })).not.toBeInTheDocument();
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

    const badge = screen.getByRole("img", { name: "真实环境" });
    expect(badge).toHaveClass("bash-real-env-badge");
    expect(badge).toHaveAttribute("title", expect.stringContaining("沙盒外运行"));
    expect(screen.queryByText("真实环境")).not.toBeInTheDocument();
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

    expect(screen.queryByRole("img", { name: "沙盒" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "真实环境" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("img", { name: "沙盒" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "真实环境" })).not.toBeInTheDocument();
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

    expect(screen.getByRole("img", { name: "沙盒" })).toBeInTheDocument();
  });

  it("switches an approval card to not executed after deny", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    overrideBridge({ "approvals.submit": submitApproval });
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
    expect(screen.queryByRole("img", { name: "沙盒" })).not.toBeInTheDocument();
    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-deny-1",
      decision: "deny",
    });
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
    expect(card).toHaveClass("approval");
    expect(card.querySelector(".approval-card-head")).toHaveTextContent("构建桌面端pnpm");
    expect(card.querySelector(".bash-approval-command")).toHaveTextContent("$ pnpm build");
    // 命令名单独着色。
    expect(screen.getByText("pnpm", { selector: ".bash-approval-command span" })).toHaveClass("text-(--md-hl-variable)");
    expect(screen.getByText("/workspace/actspace-agent")).toBeInTheDocument();
    const footer = card.querySelector(".approval-card-footer");
    expect(footer).toContainElement(screen.getByRole("button", { name: "运行" }));
    expect(footer).toContainElement(screen.getByRole("button", { name: "拒绝" }));
    // 通用审批提示、策略折叠不再出现。
    expect(screen.queryByText(/Allow Bash to run/)).toBeNull();
    expect(screen.queryByText("Allowlist")).toBeNull();
  });

  it("shows the escalation justification under the command only while approval is pending", () => {
    const pending = {
      id: "bash-approval-escalated",
      kind: "bash" as const,
      createdAt: "2026-06-02T00:00:00.000Z",
      title: "Run Bash command: git",
      intent: "推送分支",
      status: "pending" as const,
      command: "git push",
      justification: "Pushing over HTTPS needs the keychain.",
      sandboxed: false,
      approvalRequestId: "approval-escalated",
    };
    const { unmount } = renderBash(pending);
    const card = screen.getByRole("article");
    expect(card.querySelector(".bash-approval-command + .bash-approval-justification")).toHaveTextContent("Pushing over HTTPS needs the keychain.");
    expect(screen.getByRole("img", { name: "真实环境" })).toBeInTheDocument();
    unmount();
    for (const message of [{ ...pending, justification: undefined }, { ...pending, status: "running" as const, approvalRequestId: undefined }]) {
      const view = renderBash(message);
      expect(document.querySelector(".bash-approval-justification")).toBeNull();
      expect(document.body).not.toHaveTextContent("needs the keychain");
      view.unmount();
    }
  });

  it("keeps the Bash approval actionable when the bridge rejects the decision", async () => {
    const submitApproval = vi.fn(async () => ({ ok: false, reason: "expired" }));
    overrideBridge({ "approvals.submit": submitApproval });
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
  });
});
