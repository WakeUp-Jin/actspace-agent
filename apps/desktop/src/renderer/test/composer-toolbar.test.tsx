import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { composerSendButtonState, type ComposerSendState } from "../components/composer/ComposerToolbar";
import { ReviewStrip } from "../components/composer/ReviewStrip";
import { TooltipProvider } from "../components/ui/Tooltip";

const idle: ComposerSendState = {
  isStreaming: false,
  isAborting: false,
  isCompacting: false,
  queueEnabled: true,
  canSend: false,
  modelAvailable: true,
  notReady: null,
  hostReachable: true,
};

describe("composerSendButtonState", () => {
  it("disables stop while the abort is in flight", () => {
    const state = composerSendButtonState({ ...idle, isStreaming: true, isAborting: true });

    expect(state.showStop).toBe(true);
    expect(state.disabled).toBe(true);
  });

  it("queues instead of stopping when a running session has a draft", () => {
    const state = composerSendButtonState({ ...idle, isStreaming: true, canSend: true });

    expect(state.showStop).toBe(false);
    expect(state.ariaLabel).toBe("加入队列");
    expect(state.disabled).toBe(false);
  });
});

describe("ReviewStrip", () => {
  function renderStrip(summary: Parameters<typeof ReviewStrip>[0]["summary"]) {
    render(<TooltipProvider><ReviewStrip summary={summary} /></TooltipProvider>);
  }

  it("names the button by the change counts", () => {
    renderStrip({ status: "changes", additions: 3, deletions: 1 });

    expect(screen.getByRole("button", { name: "审查待处理变更 +3 -1" })).toBeEnabled();
  });

  it("says when the workspace is not a Git repository", () => {
    renderStrip({ status: "notAvailable", reason: "not_a_repository" });

    expect(screen.getByRole("button", { name: "查看工作区变更；Git 仓库尚未初始化" })).toBeEnabled();
  });

  it("falls back to a plain label and disables the button while loading", () => {
    renderStrip({ status: "loading" });

    expect(screen.getByRole("button", { name: "查看工作区变更" })).toBeDisabled();
  });
});
