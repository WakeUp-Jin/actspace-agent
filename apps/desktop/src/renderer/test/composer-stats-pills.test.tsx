import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeV2SessionSnapshot, RuntimeV2UsageSummary } from "@actspace/shared/runtime-v2/projection";
import type { SessionProjectionContextValue } from "../session";
import { ComposerStatsPills, activityPillModel, usagePillModel } from "../components/composer/ComposerStatsPills";
import {
  formatCacheHitPercent,
  formatDuration,
  formatExactTokens,
  formatTokens,
  formatTokensPerSecond,
  sessionStats,
  type ComposerSessionStats,
} from "../components/composer/composer-stats";
import { projectionFixture } from "./projection-fixture";

/**
 * 输入区统计胶囊：数字格式逐条对齐 DSH `token-format.ts`，显示分支对齐 `StatsPills.tsx`（详细模式），
 * 模型侧耗时读宿主 `activity.timing` 投影。
 */

let projection: SessionProjectionContextValue | null = null;

vi.mock("../session", async (importOriginal) => ({
  ...await importOriginal<typeof import("../session")>(),
  useOptionalSessionProjection: () => projection,
}));

const NO_STATS: ComposerSessionStats = { turns: 0, steps: 0, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 };

function usage(overrides: Partial<RuntimeV2UsageSummary>): RuntimeV2UsageSummary {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null, ...overrides };
}

function setProjection(snapshot: Partial<RuntimeV2SessionSnapshot>) {
  const fixture = projectionFixture("s");
  projection = {
    sessionId: "s",
    cell: { snapshot: { ...fixture.snapshot, ...snapshot }, window: fixture.window } as unknown as NonNullable<SessionProjectionContextValue["cell"]>,
    overlay: null,
    store: {} as SessionProjectionContextValue["store"],
    bridge: null,
  };
}

describe("composer stats formatting", () => {
  it("formats numbers exactly like DSH token-format", () => {
    expect(formatTokens(517)).toBe("517");
    expect(formatTokens(12_240)).toBe("12.2K");
    expect(formatTokens(517_400)).toBe("517K");
    expect(formatTokens(2_013_332)).toBe("2M");
    expect(formatExactTokens(1_234_567)).toBe("1,234,567");
    expect(formatTokensPerSecond(42.6)).toBe("43");
    expect(formatTokensPerSecond(7.25)).toBe("7.3");
    expect(formatTokensPerSecond(-1)).toBe("0");
    expect(formatDuration(45_210)).toBe("45.2秒");
    expect(formatDuration(162_000)).toBe("2分42秒");
  });

  it("never rounds a partial cache hit up to 100%", () => {
    expect(formatCacheHitPercent(0, 0)).toBeNull();
    expect(formatCacheHitPercent(100, 100)).toBe("100");
    expect(formatCacheHitPercent(8_033, 10_000)).toBe("80");
    expect(formatCacheHitPercent(99_996, 100_000)).toBe("99.996");
    expect(formatCacheHitPercent(999, 1_000)).toBe("99.9");
  });
});

describe("sessionStats", () => {
  it("reads model timing from the host activity projection", () => {
    const fixture = projectionFixture();
    const timing = { llmMs: 10_000, ttftMs: 3_000, ttftSteps: 1, decodeMs: 5_000, decodeTokens: 100 };
    const stats = sessionStats({ ...fixture.snapshot, activity: { ...fixture.snapshot.activity, turnCount: 1, stepCount: 2, timing } });
    expect(stats).toEqual({ ...NO_STATS, turns: 1, steps: 2, ...timing });
  });

  it("sums tool durations and takes counts from the activity projection", () => {
    const fixture = projectionFixture();
    const stats = sessionStats({
      ...fixture.snapshot,
      activity: { ...fixture.snapshot.activity, turnCount: 2, stepCount: 5 },
      tools: [{ durationMs: 1_500 }, { durationMs: null }, { durationMs: 500 }] as unknown as RuntimeV2SessionSnapshot["tools"],
    });
    expect(stats).toEqual({ ...NO_STATS, turns: 2, steps: 5, toolMs: 2_000 });
  });
});

describe("pill models", () => {
  it("hides the activity pill until a step settles, and keeps it read-only without timing", () => {
    expect(activityPillModel(NO_STATS)).toBeNull();
    expect(activityPillModel({ ...NO_STATS, turns: 1, steps: 2 })).toEqual({ kind: "plain", label: ["1 轮 2 步"] });
  });

  it("lists only the timed rows in the activity dialog", () => {
    const model = activityPillModel({ ...NO_STATS, turns: 2, steps: 3, llmMs: 12_340, decodeMs: 4_000, decodeTokens: 170 });
    expect(model).toEqual({
      kind: "dialog",
      label: ["2 轮 3 步", "43 tok/s"],
      ariaLabel: "2 轮 3 步 · 43 tok/s",
      dialog: { title: "会话统计", rows: [["模型用时", "12.3秒"], ["输出速度（TPS）", "43 tok/s"]] },
    });
  });

  it("hides the usage pill without billed activity and shows cache writes only when non-zero", () => {
    expect(usagePillModel(usage({}))).toBeNull();
    const model = usagePillModel(usage({ inputTokens: 1_967, cacheReadTokens: 8_033, outputTokens: 2_240 }));
    expect(model).toEqual({
      kind: "dialog",
      label: ["累计 12.2K tok", "缓存命中 80%"],
      ariaLabel: "累计 12.2K tok · 缓存命中 80%",
      dialog: {
        title: "会话累计消耗",
        titleValue: "12,240 tok",
        description: "每次模型请求的输入（含缓存）加输出之和；每一步都会重发上下文，所以远大于当前窗口占用。",
        footnote: "缓存命中 = 缓存读 ÷（未缓存输入 + 缓存读 + 缓存写），按累计计算。",
        rows: [["缓存命中", "80%"], ["未缓存输入", "1,967 tok"], ["缓存读取", "8,033 tok"], ["输出", "2,240 tok"]],
      },
    });
    const withWrite = usagePillModel(usage({ inputTokens: 10, cacheWriteTokens: 4, outputTokens: 1 }));
    expect(withWrite?.kind === "dialog" ? withWrite.dialog.rows.map(([label]) => label) : []).toContain("缓存写入");
  });
});

describe("ComposerStatsPills", () => {
  beforeEach(() => {
    projection = null;
  });

  it("renders nothing without a session projection", () => {
    const { container } = render(<ComposerStatsPills />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a read-only span when nothing is timed", () => {
    setProjection({ activity: { ...projectionFixture().snapshot.activity, turnCount: 1, stepCount: 1 } });
    render(<ComposerStatsPills />);
    const pill = document.querySelector("[data-composer-stat=activity]");
    expect(pill?.tagName).toBe("SPAN");
    expect(pill).toHaveTextContent("1 轮 1 步");
    expect(document.querySelector("[data-composer-stat=usage]")).toBeNull();
  });

  it("opens the 会话累计消耗 dialog from the usage pill", async () => {
    setProjection({ usage: usage({ inputTokens: 1_967, cacheReadTokens: 8_033, outputTokens: 2_240 }) });
    render(<ComposerStatsPills />);
    const pill = screen.getByRole("button", { name: "累计 12.2K tok · 缓存命中 80%" });
    expect(pill).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.click(pill);
    const dialog = await screen.findByRole("dialog", { name: "会话累计消耗" });
    expect(dialog).toHaveTextContent("12,240 tok");
    expect(dialog).toHaveTextContent("所以远大于当前窗口占用");
    expect(dialog).toHaveTextContent("缓存读 ÷（未缓存输入 + 缓存读 + 缓存写），按累计计算");
    expect(dialog).toHaveTextContent("未缓存输入1,967 tok");
    expect(pill).toHaveAttribute("aria-expanded", "true");

    // 点面板外任何地方都收起，不必再点胶囊。
    const outside = document.createElement("button");
    document.body.append(outside);
    await userEvent.click(outside);
    expect(screen.queryByRole("dialog", { name: "会话累计消耗" })).toBeNull();
    outside.remove();
  });

  it("reports panel toggles to the composer overlay instead of opening on its own", async () => {
    setProjection({ usage: usage({ inputTokens: 10, outputTokens: 5 }) });
    const onOpenChange = vi.fn();
    const { rerender } = render(<ComposerStatsPills overlay={{ openStat: null, onOpenChange }} />);
    await userEvent.click(screen.getByRole("button", { name: "累计 15 tok · 缓存命中 0%" }));
    expect(onOpenChange).toHaveBeenCalledWith("usage", true);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<ComposerStatsPills overlay={{ openStat: "usage", onOpenChange }} />);
    expect(await screen.findByRole("dialog", { name: "会话累计消耗" })).toHaveTextContent("15 tok");
  });
});
