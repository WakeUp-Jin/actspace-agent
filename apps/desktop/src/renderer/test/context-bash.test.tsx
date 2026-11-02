import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ContextPanelBashStats } from "@actspace/shared";
import { ContextBash } from "../components/right-panel/context/ContextBash";
import { ContextPanel } from "../components/right-panel/context/ContextPanel";
import { bashProgramCount, bashProgramRows, formatBashDuration } from "../components/right-panel/context/context-bash-model";
import { TooltipProvider } from "../components/ui/Tooltip";
import { MOCK_CONTEXT_BASH, mockContextPanelView } from "../mock/context-panel-fixture";
import { setupBridge } from "./helpers/bridge";

function renderCard(stats: ContextPanelBashStats) {
  render(<TooltipProvider delayDuration={0}><ContextBash stats={stats} /></TooltipProvider>);
  return screen.getByRole("region", { name: "Bash 命令" });
}
function programNames(card: HTMLElement): string[] {
  return Array.from(card.querySelectorAll<HTMLElement>("[data-bash-program]"), row => row.dataset.bashProgram!);
}
const program = (name: string, count: number, failed = 0) => ({ name, count, failed, subcommands: [] });

describe("context-bash-model", () => {
  it.each([
    [0, "0ms"], [106, "106ms"], [999, "999ms"], [4_200, "4.2s"], [59_940, "59.9s"], [59_960, "1m00s"],
    [112_400, "1m52s"], [3_599_000, "59m59s"], [3_900_000, "1h05m"], [-5, "0ms"],
  ])("formatBashDuration(%d) = %s", (ms, text) => {
    expect(formatBashDuration(ms)).toBe(text);
  });

  it("占比按所有程序出现次数算，条形按最多的程序缩放；「其他」不计入程序数", () => {
    const stats: ContextPanelBashStats = { calls: 3, failed: 0, durationMs: 0, programs: [program("ls", 3), program("cat", 1), program("", 1)] };
    expect(bashProgramRows(stats).map(row => [row.label, row.percent, row.share, row.other])).toEqual([["ls", 60, 1, false], ["cat", 20, 1 / 3, false], ["其他", 20, 1 / 3, true]]);
    expect(bashProgramCount(stats)).toBe(2);
  });
});

describe("ContextBash", () => {
  it("三格数字：失败大于 0 时用危险色", () => {
    const card = renderCard(MOCK_CONTEXT_BASH);
    const stat = (key: string) => card.querySelector<HTMLElement>(`[data-bash-stat="${key}"]`)!;
    expect(stat("calls")).toHaveTextContent("38次");
    expect(stat("failed")).toHaveTextContent("3次");
    expect(stat("failed")).toHaveClass("text-danger");
    expect(stat("duration")).toHaveTextContent("1m52s");
    expect(within(card).getByText("12 个程序")).toBeInTheDocument();
    cleanup();
    expect(renderCard({ ...MOCK_CONTEXT_BASH, failed: 0 }).querySelector('[data-bash-stat="failed"]')).not.toHaveClass("text-danger");
  });

  it("程序行按后端顺序显示次数、占比和失败；默认 8 行，可以再显示", async () => {
    const card = renderCard(MOCK_CONTEXT_BASH);
    expect(programNames(card)).toEqual(["git", "pnpm", "cat", "grep", "rg", "tail", "ls", "sed"]);
    const pnpm = card.querySelector<HTMLElement>('[data-bash-program="pnpm"]')!;
    expect(pnpm).toHaveTextContent("×8");
    expect(pnpm).toHaveTextContent("16%");
    expect(within(pnpm).getByText("2 失败")).toHaveClass("text-danger");
    expect(card.querySelector('[data-bash-program="cat"]')).not.toHaveTextContent("失败");

    await userEvent.click(within(card).getByRole("button", { name: "再显示 4 项（共 12）" }));
    expect(programNames(card)).toHaveLength(12);
    expect(within(card.querySelector<HTMLElement>('[data-bash-program="node"]')!).getByText("1 失败")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /再显示/ })).not.toBeInTheDocument();
  });

  it("带子命令的程序可以展开；没有子命令的程序不是按钮", async () => {
    const card = renderCard(MOCK_CONTEXT_BASH);
    const git = within(card.querySelector<HTMLElement>('[data-bash-program="git"]')!).getByRole("button");
    expect(git).toHaveAttribute("aria-expanded", "false");
    expect(card.querySelector("[data-bash-subcommand]")).toBeNull();
    await userEvent.click(git);
    expect(git).toHaveAttribute("aria-expanded", "true");
    const subs = Array.from(card.querySelectorAll<HTMLElement>('[data-bash-program="git"] [data-bash-subcommand]'));
    expect(subs.map(row => row.dataset.bashSubcommand)).toEqual(["status", "diff", "log", "show"]);
    expect(subs[0]).toHaveTextContent("×5");
    expect(subs[0]).not.toHaveTextContent("%");
    await userEvent.click(git);
    expect(card.querySelector("[data-bash-subcommand]")).toBeNull();
    expect(within(card.querySelector<HTMLElement>('[data-bash-program="cat"]')!).queryByRole("button")).toBeNull();
  });

  it("子命令名为空时显示「其他」，程序名为空时显示「其他」", async () => {
    const card = renderCard({ calls: 2, failed: 1, durationMs: 10, programs: [{ name: "git", count: 1, failed: 1, subcommands: [{ name: "", count: 1, failed: 1 }] }, program("", 1)] });
    expect(programNames(card)).toEqual(["git", "其他"]);
    await userEvent.click(within(card).getByRole("button", { name: /git/ }));
    expect(card.querySelector('[data-bash-subcommand="其他"]')).toHaveTextContent("1 失败");
  });

  it("没有调用时只显示空状态", () => {
    const card = renderCard({ calls: 0, failed: 0, durationMs: 0, programs: [] });
    expect(within(card).getByText("本会话还没有调用过 Bash。")).toBeInTheDocument();
    expect(card.querySelector("[data-bash-stat]")).toBeNull();
    expect(within(card).queryByText(/个程序/)).not.toBeInTheDocument();
  });

  it("面板在后端数据里有 bash 时渲染卡片，bash 为 null 时不渲染", async () => {
    setupBridge();
    const { unmount } = render(<TooltipProvider delayDuration={0}><ContextPanel sessionId="bash-session" contextRevision={1} /></TooltipProvider>);
    expect(await screen.findByRole("region", { name: "Bash 命令" })).toBeInTheDocument();
    unmount();

    setupBridge({ "sessions.describeContextPanel": async () => ({ ...mockContextPanelView("bash-null"), bash: null }) });
    render(<TooltipProvider delayDuration={0}><ContextPanel sessionId="bash-null" contextRevision={1} /></TooltipProvider>);
    expect(await screen.findByRole("region", { name: "上下文事件" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Bash 命令" })).not.toBeInTheDocument();
  });
});
