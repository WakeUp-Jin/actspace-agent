import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ModelPricingSnapshot, UsageActivityRow } from "@actspace/shared";
import { UsageHoverCard } from "../components/usage/UsageHoverCard";
import { mockUsageActivity } from "./fixtures/usageStatisticsFixture";

const pricing: ModelPricingSnapshot = { providerId: "deepseek", connectionId: null, modelKey: "deepseek:m", apiModel: "deepseek-v4-flash", currency: "USD", rates: { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: null }, multiplier: 1, source: "deepseek-official", strategy: "fixed-peak", capturedAt: "2026-09-07T13:30:00Z", fetchedAt: "2026-09-07T00:00:00Z", contentHash: "fixture", unsupportedBilling: false };
const row: UsageActivityRow = { ...mockUsageActivity.rows[0], model: pricing.apiModel, tokens: { inputTokens: 769, outputTokens: 145, cacheReadTokens: 36736, cacheWriteTokens: 0, reasoningTokens: 100, totalTokens: 37650 }, costAmount: 0.001044064, costCurrency: "USD", costProvenance: { version: 1, basis: "estimated", reason: null, pricingSnapshot: pricing } };

describe("usage hover details", () => {
  it("shows only saved prices and hides absent cache-write pricing", async () => {
    render(<UsageHoverCard row={row} view="model">model</UsageHoverCard>);
    await userEvent.hover(screen.getByRole("button"));
    const card = await screen.findByRole("region", { name: "模型定价" });
    expect(within(card).getAllByRole("term").map((e) => e.textContent)).toEqual(["缓存读取", "输入", "输出"]);
    expect(within(card).getAllByRole("definition").map((e) => e.textContent)).toEqual(["$0.014", "$0.44", "$1.32"]);
    expect(card).not.toHaveTextContent(/来源|记录时间|百万|高峰|模型定价/);
  });
  it("opens from the keyboard, hides zero cache writes and shows only counts and total", async () => {
    const view = render(<UsageHoverCard row={row} view="tokens">tokens</UsageHoverCard>);
    await userEvent.tab();
    const card = await screen.findByRole("region", { name: "Token 明细" });
    expect(within(card).getAllByRole("term").map((e) => e.textContent)).toEqual(["缓存读取", "输入", "输出", "合计"]);
    expect(within(card).getByText("37,650")).toBeInTheDocument();
    expect(card).not.toHaveTextContent(/推理|Token 明细/);
    view.rerender(<UsageHoverCard row={{ ...row, tokens: { ...row.tokens, cacheWriteTokens: 20, totalTokens: 37670 } }} view="tokens">tokens</UsageHoverCard>);
    expect(within(card).getByText("缓存写入")).toBeInTheDocument();
    expect(within(card).getByText("37,670")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("keeps missing prices unknown", async () => {
    render(<UsageHoverCard row={{ ...row, costProvenance: undefined }} view="model">model</UsageHoverCard>);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("暂无单价")).toBeInTheDocument();
  });
});
