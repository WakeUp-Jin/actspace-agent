import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ContextUsageSnapshot } from "@actspace/shared";
import { ContextPopup } from "../components/ContextPopup";

/**
 * ContextPopup 测试覆盖：
 * 1. bucket 由 snapshot 配置驱动渲染（含未知 key 走兜底 label）；
 * 2. 不再渲染底部 footer（Total used / Compressed）；
 * 3. 点击 bucket 行做交叉高亮：选中行 aria-pressed=true，对应 meter 段也 pressed，再次点击可取消。
 */
function makeSnapshot(): ContextUsageSnapshot {
  return {
    totalTokens: 100,
    maxTokens: 200_000,
    percentUsed: 1,
    compressionCount: 3,
    cumulativeTokens: 100,
    buckets: [
      { key: "systemPrompt", name: "systemPrompt", label: "System prompt", tokens: 40, colorToken: "--act-context-system" },
      { key: "tools", name: "tools", label: "Tools", tokens: 60, colorToken: "--act-context-tools" },
    ],
  };
}

describe("ContextPopup", () => {
  it("renders buckets from the snapshot and omits the footer", () => {
    render(<ContextPopup snapshot={makeSnapshot()} onClose={vi.fn()} />);

    expect(screen.getByText("System prompt")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    // 已移除的 footer 文案不应再出现。
    expect(screen.queryByText(/Total used/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Compressed/i)).not.toBeInTheDocument();
  });

  it("uses the shared registry fallback label for an unknown bucket key", () => {
    const snapshot = makeSnapshot();
    // 故意塞一个注册表里没有的 key，模拟未来新增/未接线的 bucket（配置驱动兜底）。
    snapshot.buckets.push({
      key: "futureThing",
      name: "futureThing",
      label: "Future thing",
      tokens: 5,
      colorToken: "--act-context-fallback",
    } as unknown as (typeof snapshot.buckets)[number]);

    render(<ContextPopup snapshot={snapshot} onClose={vi.fn()} />);
    // 未知 key 经 getContextBucketDisplay 兜底，label 用 key 本身。
    expect(screen.getAllByText("futureThing").length).toBeGreaterThan(0);
  });

  it("shows <1% Full instead of 0% when there is data below one percent", () => {
    const snapshot: ContextUsageSnapshot = {
      totalTokens: 2_190,
      maxTokens: 1_000_000,
      percentUsed: 0,
      compressionCount: 0,
      cumulativeTokens: 2_190,
      buckets: [
        { key: "tools", name: "tools", label: "Tools", tokens: 1_879, colorToken: "--act-context-tools" },
        { key: "conversation", name: "conversation", label: "Conversation", tokens: 311, colorToken: "--act-context-conversation" },
      ],
    };
    render(<ContextPopup snapshot={snapshot} onClose={vi.fn()} />);

    expect(screen.getByText("<1% Full")).toBeInTheDocument();
    // meter 段宽相对 maxTokens：tools 占 ~0.19%，不再撑满整条。
    const toolsMeter = screen.getByRole("button", { name: "Tools 1,879 tokens" });
    expect(toolsMeter.style.width).toBe(`${(1_879 / 1_000_000) * 100}%`);
  });

  it("cross-highlights the matching meter segment when a bucket row is toggled", async () => {
    const user = userEvent.setup();
    render(<ContextPopup snapshot={makeSnapshot()} onClose={vi.fn()} />);

    const toolsRow = screen.getByRole("button", { name: "Tools 60" });
    const toolsMeter = screen.getByRole("button", { name: "Tools 60 tokens" });

    expect(toolsRow).toHaveAttribute("aria-pressed", "false");
    expect(toolsMeter).toHaveAttribute("aria-pressed", "false");

    await user.click(toolsRow);
    expect(toolsRow).toHaveAttribute("aria-pressed", "true");
    expect(toolsMeter).toHaveAttribute("aria-pressed", "true");

    // 再次点击取消选中（无默认选中态）。
    await user.click(toolsRow);
    expect(toolsRow).toHaveAttribute("aria-pressed", "false");
    expect(toolsMeter).toHaveAttribute("aria-pressed", "false");
  });
});
