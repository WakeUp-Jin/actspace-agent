import { act, fireEvent, render, screen } from "@testing-library/react";
import type { MessageBlock } from "@actspace/shared";
import { CompactCommandBlock, CompactionRetryContext, formatCompactionDuration } from "../components/messages/CompactCommandBlock";

function makeBlock(
  partial: Partial<Extract<MessageBlock, { kind: "context_compaction" }>>,
): Extract<MessageBlock, { kind: "context_compaction" }> {
  return {
    kind: "context_compaction",
    id: "compact-1",
    status: "running",
    createdAt: "2026-06-02T00:00:00.000Z",
    ...partial,
  };
}

describe("CompactCommandBlock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders running state with an elapsed timer and an indeterminate progressbar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T00:00:08.000Z"));
    render(<CompactCommandBlock message={makeBlock({ status: "running", startedAt: "2026-06-02T00:00:00.000Z" })} />);

    expect(screen.getByText("正在压缩上下文")).toBeInTheDocument();
    expect(screen.getByText("8s")).toBeInTheDocument();
    expect(screen.getByText("正在总结较早的消息。")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "上下文压缩进度" })).not.toHaveAttribute("aria-valuenow");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("10s")).toBeInTheDocument();
  });

  it("renders completed state as a divider that expands the summary", () => {
    const { container } = render(
      <CompactCommandBlock message={makeBlock({ status: "completed", removedCount: 29, durationMs: 12_000, summary: "## 目标\n修复登录" })} />,
    );

    const toggle = screen.getByRole("button", { name: "上下文已压缩 · 29 条消息 · 12s" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".compact-command-block")).toHaveClass("w-full");
    expect(screen.queryByText("修复登录")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("修复登录")).toBeInTheDocument();
    expect(screen.getByText(/压缩摘要 · \d+ 字/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(screen.getByText("分隔线以上的消息仍然显示，但模型之后只通过这段摘要了解它们。")).toBeInTheDocument();
  });

  it("renders a plain divider when no summary is available yet", () => {
    render(<CompactCommandBlock message={makeBlock({ status: "completed", removedCount: 5 })} />);

    expect(screen.getByRole("separator", { name: "上下文已压缩 · 5 条消息" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders failed state with a retry action from context", () => {
    const retry = vi.fn();
    render(
      <CompactionRetryContext.Provider value={retry}>
        <CompactCommandBlock message={makeBlock({ status: "failed", errorMessage: "模型请求超时（60s）" })} />
      </CompactionRetryContext.Provider>,
    );

    expect(screen.getByText("上下文压缩失败 · 模型请求超时（60s）")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("formats durations", () => {
    expect(formatCompactionDuration(400)).toBe("0s");
    expect(formatCompactionDuration(12_300)).toBe("12s");
    expect(formatCompactionDuration(72_000)).toBe("1m 12s");
    expect(formatCompactionDuration(120_000)).toBe("2m");
  });
});
