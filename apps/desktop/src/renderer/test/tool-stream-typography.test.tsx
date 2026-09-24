import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThinkingBlock } from "../components/messages/ThinkingBlock";
import { ToolLogLine } from "../components/messages/ToolLogLine";
import { BashRunBlock } from "../components/messages/BashRunBlock";
import { TooltipProvider } from "../components/ui/Tooltip";
import { messageFlowKind } from "../components/messages/messageFlowStyles";

const base = { id: "fixture", createdAt: "2026-09-16T00:00:00.000Z" };

describe("tool stream presentation preserves behavior", () => {
  it("collapses completed thinking once but permits a manual reopening", async () => {
    const message = { ...base, kind: "thinking" as const, title: "Thinking", content: "Reasoning detail", collapsedByDefault: false };
    const view = render(<ThinkingBlock message={message} />);
    expect(screen.getByText("Reasoning detail")).toBeInTheDocument();
    view.rerender(<ThinkingBlock message={message} replyCompleted />);
    expect(screen.queryByText("Reasoning detail")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thinking" }));
    view.rerender(<ThinkingBlock message={{ ...message }} replyCompleted />);
    expect(screen.getByText("Reasoning detail")).toBeInTheDocument();
  });

  it.each([false, true])("keeps Read file opening separate from result disclosure (preview=%s)", async (hasPreview) => {
    const onOpen = vi.fn();
    const message = { ...base, kind: "read" as const, status: "completed" as const, filePath: "docs/very-long-file.md", displayText: "Read docs/very-long-file.md", resultPreview: hasPreview ? ["Full result content"] : undefined };
    render(<ToolLogLine message={message} onOpenFile={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Read docs/very-long-file.md" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(message);
    if (hasPreview) {
      const disclosure = screen.getByRole("button", { name: "Show result for Read docs/very-long-file.md" });
      disclosure.focus();
      await userEvent.keyboard("{Enter}");
      expect(screen.getByText("Full result content")).toBeInTheDocument();
      expect(onOpen).toHaveBeenCalledTimes(1);
    }
  });

  it("offers once, exact Session and explicitly revealed subtree choices for pending reads", async () => {
    const submitApproval = vi.fn(async () => ({ ok: true }));
    window.actspace = {
      submitApproval,
      listPendingApprovals: async () => [{
        requestId: "approval-read-1", toolName: "read_file", summary: "Read", reason: "Outside workspace", createdAt: Date.now(), expiresAt: Date.now() + 60_000,
        grantSuggestions: [
          { suggestionId: "exact-read", lifetime: "session", action: "file.read", access: "read", selector: { kind: "exact", canonicalPath: "/tmp/shared/a.md" }, audience: { pluginId: "actspace.core-tools", permissionDomain: "core-files", policyVersion: 1 }, label: "This file only" },
          { suggestionId: "tree-read", lifetime: "session", action: "file.read", access: "read", selector: { kind: "subtree", canonicalRoot: "/tmp/shared" }, audience: { pluginId: "actspace.core-tools", permissionDomain: "core-files", policyVersion: 1 }, label: "This directory tree" },
        ],
      }],
    } as unknown as Window["actspace"];
    render(<ToolLogLine message={{ ...base, kind: "read", status: "pending", filePath: "/tmp/shared/a.md", displayText: "Read", approvalRequestId: "approval-read-1", reason: "Outside workspace" }} />);
    expect(await screen.findByRole("button", { name: "本会话允许此路径" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "本会话允许此目录树" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "选择目录范围" }));
    await userEvent.click(screen.getByRole("button", { name: "本会话允许此目录树" }));
    expect(submitApproval).toHaveBeenCalledWith({ requestId: "approval-read-1", decision: "session", suggestionId: "tree-read" });
  });

  it("shows compact Bash commands while retaining old diagnostic titles and output", async () => {
    render(<TooltipProvider><BashRunBlock message={{ ...base, kind: "bash", status: "success", title: "Bash completed in 85ms (exit 0, sandboxed=true).", command: "pwd", stdout: "/work", sandboxed: true, durationMs: 85, exitCode: 0 }} /></TooltipProvider>);
    const toggle = screen.getByRole("button", { name: "Ran pwd" });
    expect(within(toggle).queryByText(/85ms/)).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText(/# summary: Bash completed in 85ms/)).toHaveTextContent("/work");
    expect(screen.getByText(/# environment: 沙盒/)).toBeInTheDocument();
  });

  it("preserves denial details and never invents successful output for unexecuted commands", async () => {
    render(<TooltipProvider><BashRunBlock message={{ ...base, kind: "bash", status: "denied", title: "Bash command", command: "wc -l file", notExecuted: true, reason: "Approval timed out.", stdout: "stale output", exitCode: 0 }} /></TooltipProvider>);
    await userEvent.click(screen.getByRole("button", { name: /Denied wc -l file/ }));
    expect(screen.getByText(/Approval timed out/)).toBeInTheDocument();
    expect(screen.queryByText(/# exit: 0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stale output/)).not.toBeInTheDocument();
  });

  it("classifies Bash as process while keeping pending approval out of compact rows", () => {
    const bash = { ...base, kind: "bash" as const, title: "Bash", command: "pwd", status: "success" as const };
    expect(messageFlowKind(bash)).toBe("process");
    expect(messageFlowKind({ ...bash, status: "pending" })).toBe("other");
    expect(messageFlowKind({ ...base, kind: "assistant", content: "Explanation" })).toBe("prose");
  });
});
