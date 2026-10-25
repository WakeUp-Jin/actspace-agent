import { act, fireEvent, render, screen } from "@testing-library/react";
import type { MessageBlock } from "@actspace/shared";
import { CompactCommandBlock, CompactionRetryContext, formatCompactionDuration } from "../components/messages/CompactCommandBlock";
import { TrajectoryNavigationProvider, useTrajectoryNavigation } from "../components/trajectory/TrajectoryNavigation";

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

  it("renders running state as a divider with an elapsed timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T00:00:08.000Z"));
    const { container } = render(<CompactCommandBlock message={makeBlock({ status: "running", startedAt: "2026-06-02T00:00:00.000Z" })} />);

    expect(screen.getByRole("status")).toHaveTextContent("正在压缩上下文");
    expect(screen.getByText("8s")).toBeInTheDocument();
    expect(container.querySelector(".compact-divider-running")).not.toBeNull();
    expect(container.querySelectorAll(".compact-divider-line")).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("10s")).toBeInTheDocument();
  });

  it("renders completed state with counts, tokens and duration", () => {
    const { container } = render(
      <CompactCommandBlock message={makeBlock({ status: "completed", removedCount: 48, durationMs: 23_000, compactionId: "c1", beforeTokens: 182_400, afterTokens: 9_100 })} />,
    );

    expect(screen.getByRole("separator", { name: "以上 48 条消息已压缩 · 182.4K → 约 9.1K tokens · 23s" })).toBeInTheDocument();
    expect(container.querySelector(".compact-command-block")).toHaveClass("w-full");
    // 没有轨迹导航（单独渲染）时不提供跳转。
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows only count and duration for compactions recorded before token counts", () => {
    render(<CompactCommandBlock message={makeBlock({ status: "completed", removedCount: 5, durationMs: 4_000 })} />);

    expect(screen.getByRole("separator", { name: "以上 5 条消息已压缩 · 4s" })).toBeInTheDocument();
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
  });

  it("reveals the compaction row in the trajectory", () => {
    const show = vi.fn();
    let pending: unknown = null;
    function Probe() {
      pending = useTrajectoryNavigation()?.pending?.target ?? null;
      return null;
    }
    render(
      <TrajectoryNavigationProvider onShowTrajectory={show}>
        <CompactCommandBlock message={makeBlock({ status: "completed", removedCount: 5, compactionId: "c1" })} />
        <Probe />
      </TrajectoryNavigationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "在轨迹中查看" }));
    expect(show).toHaveBeenCalledTimes(1);
    expect(pending).toEqual({ compactionId: "c1" });
  });

  it("renders failed state with a retry action from context", () => {
    const retry = vi.fn();
    render(
      <CompactionRetryContext.Provider value={retry}>
        <CompactCommandBlock message={makeBlock({ status: "failed", errorMessage: "模型请求超时（60s）" })} />
      </CompactionRetryContext.Provider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("上下文压缩失败");
    expect(screen.getByText("模型请求超时（60s）")).toBeInTheDocument();
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
