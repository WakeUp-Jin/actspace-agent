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
    // 结束后盾牌收掉，行尾只剩 chevron。
    expect(screen.queryByRole("img", { name: "沙盒" })).not.toBeInTheDocument();
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

  it("shows the sandbox shield only while a sandboxed command is running", () => {
    renderBash({
      id: "bash-sbx-run",
      kind: "bash",
      createdAt: "2026-07-04T00:00:00.000Z",
      title: "Bash command",
      status: "running",
      command: "pnpm test",
      sandboxed: true,
    });

    const badge = screen.getByRole("img", { name: "沙盒" });
    expect(badge).toHaveClass("bash-sandbox-badge");
    expect(badge).toHaveAttribute("title", expect.stringContaining("沙盒内运行"));
    expect(screen.queryByText("沙盒")).not.toBeInTheDocument();
  });

  it.each([
    ["success", "Ran"],
    ["failed", "Failed"],
    ["denied", "Denied"],
    ["expired", "Expired"],
    ["cancelled", "Cancelled"],
  ] as const)(
    "drops the sandbox shield once the command is %s but keeps the environment in details",
    async (status, summary) => {
      renderBash({
        id: `bash-sbx-${status}`,
        kind: "bash",
        createdAt: "2026-07-04T00:00:00.000Z",
        title: "Bash command",
        status,
        command: "pnpm test",
        exitCode: status === "success" ? 0 : 1,
        sandboxed: true,
      });

      expect(screen.queryByRole("img", { name: "沙盒" })).not.toBeInTheDocument();
      expect(screen.queryByRole("img", { name: "真实环境" })).not.toBeInTheDocument();
      const toggle = screen.getByRole("button", { name: new RegExp(`^${summary}`) });
      // 失败的命令默认展开，其余要点开才能看到详情。
      if (toggle.getAttribute("aria-expanded") === "false") await userEvent.click(toggle);
      expect(screen.getByText(/# environment: 沙盒/)).toBeInTheDocument();
    },
  );

  it("keeps the trailing chevron in the same slot when the shield disappears", () => {
    const base = {
      id: "bash-sbx-layout",
      kind: "bash" as const,
      createdAt: "2026-07-04T00:00:00.000Z",
      title: "Bash command",
      command: "pnpm test",
      sandboxed: true,
    };
    const { rerender } = renderBash({ ...base, status: "running" });
    const trailing = () => document.querySelector(".bash-run-trailing")!;
    expect(trailing().children).toHaveLength(2);
    rerender(
      <TooltipProvider delayDuration={0}>
        <BashRunBlock message={{ ...base, status: "success", exitCode: 0 }} />
      </TooltipProvider>,
    );
    // 预览文字是 flex-1，trailing 靠右；盾牌移除后只有 chevron，仍是同一个靠右的 flex-none 容器。
    expect(trailing()).toHaveClass("flex-none");
    expect(trailing().children).toHaveLength(1);
    expect(trailing().querySelector("svg")).toBeInTheDocument();
  });

  it("shows the real-environment badge only while an unsandboxed command runs", () => {
    const base = { id: "bash-sbx-2", kind: "bash", createdAt: "2026-07-04T00:00:00.000Z", title: "Bash command", command: "npm i -g foo", sandboxed: false } as const;
    const view = renderBash({ ...base, status: "running" });

    const badge = screen.getByRole("img", { name: "真实环境" });
    expect(badge).toHaveClass("bash-real-env-badge");
    expect(badge).toHaveAttribute("title", expect.stringContaining("沙盒外运行"));
    expect(screen.queryByText("真实环境")).not.toBeInTheDocument();

    // 结束后与沙盒盾牌同一规则：收掉，避免完全权限下整列铺满。
    view.unmount();
    renderBash({ ...base, status: "success", exitCode: 0 });
    expect(screen.queryByRole("img", { name: "真实环境" })).not.toBeInTheDocument();
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
    // 待审批只有一个框：上方没有「等待确认」文字行，卡片下方也没有别的行；语义留在容器的可访问名称上。
    expect(screen.queryByText("等待确认")).toBeNull();
    expect(card).toHaveAccessibleName("等待确认");
    expect(card.parentElement?.children).toHaveLength(1);
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
