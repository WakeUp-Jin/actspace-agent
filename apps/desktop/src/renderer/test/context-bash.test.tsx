import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ContextPanelBashStats } from "@actspace/shared";
import { ContextBash } from "../components/right-panel/context/ContextBash";
import { ContextPanel } from "../components/right-panel/context/ContextPanel";
import { bashNotableRows, bashProgramCount, bashProgramRows, formatBashDuration } from "../components/right-panel/context/context-bash-model";
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

  it("子命令条形按所属程序的次数缩放，收起摘要按后端顺序；「其他」不计入程序数", () => {
    const stats: ContextPanelBashStats = { calls: 3, failed: 0, durationMs: 0, programs: [{ ...program("git", 4), subcommands: [{ name: "status", count: 3, failed: 0 }, { name: "", count: 1, failed: 0 }] }, program("cat", 1), program("", 1)] };
    const rows = bashProgramRows(stats);
    expect(rows.map(row => [row.label, row.other, row.summary])).toEqual([["git", false, "status 3 · 其他 1"], ["cat", false, ""], ["其他", true, ""]]);
    expect(rows[0].subcommands.map(sub => sub.share)).toEqual([0.75, 0.25]);
    expect(bashProgramCount(stats)).toBe(2);
  });
});

const BASE_STATS: ContextPanelBashStats = { calls: 20, failed: 4, durationMs: 10_800, programs: [program("ls", 7, 4), program("du", 2)] };
const notableRows = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLElement>("[data-bash-notable-row]"));

describe("bashNotableRows", () => {
  it("固定顺序；缺省字段、0、重复只有 1 次都不出行", () => {
    expect(bashNotableRows(BASE_STATS)).toEqual([]);
    expect(bashNotableRows({
      ...BASE_STATS,
      backgroundCount: 7,
      mostRepeated: { command: "cd /tmp", count: 2 },
      mostFailedProgram: { program: "ls", count: 4 },
      slowest: { command: "make", durationMs: 1_233_000 },
    })).toEqual([
      { tone: "slowest", label: "最慢", text: "make", value: "20m33s" },
      { tone: "failed", label: "失败最多", text: "ls", value: "×4" },
      { tone: "repeated", label: "重复最多", text: "cd /tmp", value: "×2" },
      { tone: "background", label: "后台任务", text: "", value: "×7" },
    ]);
    expect(bashNotableRows({ ...BASE_STATS, backgroundCount: 0, slowest: { command: "x", durationMs: 0 }, mostFailedProgram: { program: "ls", count: 0 }, mostRepeated: { command: "x", count: 1 } })).toEqual([]);
  });
});

describe("ContextBash 值得注意", () => {
  it("有数据的行按顺序显示，数值用语义色、不加底色和圆点，命令原文单行截断并带 title", () => {
    const command = "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness --very-long-argument";
    const card = renderCard({ ...BASE_STATS, slowest: { command, durationMs: 1_233_000 }, mostFailedProgram: { program: "ls", count: 4 }, mostRepeated: { command: "cd /Users/me/code", count: 2 }, backgroundCount: 7 });
    expect(within(card).getByText("值得注意")).toBeInTheDocument();
    const rows = notableRows(card);
    expect(rows.map(row => row.dataset.bashNotableRow)).toEqual(["slowest", "failed", "repeated", "background"]);
    expect(rows[0]).toHaveTextContent("最慢");
    expect(rows[0]).toHaveTextContent("20m33s");
    expect(within(rows[0]).getByTitle(command)).toHaveClass("truncate", "font-mono");
    expect(within(rows[0]).getByText("20m33s")).toHaveClass("tabular-nums", "text-warning");
    expect(within(rows[1]).getByText("×4")).toHaveClass("text-danger");
    expect(within(rows[1]).getByText("ls")).toHaveClass("font-mono");
    expect(within(rows[2]).getByText("×2")).toHaveClass("text-chart-series-3");
    expect(within(rows[3]).getByText("×7")).toHaveClass("text-success");
    expect(rows[3]).toHaveTextContent("后台任务×7");
    expect(card.querySelector("[data-bash-notable] [title]")).not.toBeNull();
    expect(rows[0].className).not.toMatch(/\bbg-/);
    expect(rows[0].querySelector(".rounded-full")).toBeNull();
  });

  it("没有数据的行隐藏", () => {
    const card = renderCard({ ...BASE_STATS, slowest: { command: "make", durationMs: 90 }, mostFailedProgram: null, mostRepeated: null, backgroundCount: 0 });
    expect(notableRows(card).map(row => row.dataset.bashNotableRow)).toEqual(["slowest"]);
    expect(within(card).queryByText("失败最多")).not.toBeInTheDocument();
    expect(within(card).queryByText("后台任务")).not.toBeInTheDocument();
  });

  it("全部为空时整个区块不显示；位置在一行总览与程序表之间", () => {
    const card = renderCard(BASE_STATS);
    expect(card.querySelector("[data-bash-notable]")).toBeNull();
    expect(within(card).queryByText("值得注意")).not.toBeInTheDocument();
    cleanup();
    const full = renderCard({ ...BASE_STATS, backgroundCount: 1 });
    const grid = full.querySelector("[data-bash-summary]")!;
    const notable = full.querySelector("[data-bash-notable]")!;
    const table = full.querySelector("[data-bash-program]")!;
    expect(grid.compareDocumentPosition(notable) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notable.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("没有调用时不显示值得注意；不带说明提示", () => {
    const card = renderCard({ calls: 0, failed: 0, durationMs: 0, programs: [], backgroundCount: 3 });
    expect(card.querySelector("[data-bash-notable]")).toBeNull();
    cleanup();
    const full = renderCard({ ...BASE_STATS, backgroundCount: 1 });
    expect(full.querySelector("[data-bash-notable] [aria-label]")).toBeNull();
  });
});

describe("ContextBash 按程序", () => {
  it("可展开的程序行首是展开箭头，不可展开的留同宽空位；收起时列出子命令摘要", async () => {
    const card = renderCard(MOCK_CONTEXT_BASH);
    const git = card.querySelector<HTMLElement>('[data-bash-program="git"]')!;
    expect(git.querySelector("button")!.firstElementChild!.querySelector("svg")).not.toBeNull();
    expect(git).toHaveTextContent("status 5 · diff 4 · log 2 · show 1");
    const cat = card.querySelector<HTMLElement>('[data-bash-program="cat"]')!;
    expect(cat.firstElementChild!.querySelector("svg")).toBeNull();
    await userEvent.click(within(git).getByRole("button"));
    expect(git).not.toHaveTextContent("status 5 · diff 4");
  });

  it("「只看失败」只在有失败时出现，按下后只留有失败的程序", async () => {
    const card = renderCard(MOCK_CONTEXT_BASH);
    const chip = within(card).getByRole("button", { name: "只看失败" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(programNames(card)).toEqual(["pnpm", "node"]);
    cleanup();
    const clean = renderCard({ ...MOCK_CONTEXT_BASH, failed: 0, programs: MOCK_CONTEXT_BASH.programs.map(item => ({ ...item, failed: 0 })) });
    expect(within(clean).queryByRole("button", { name: "只看失败" })).not.toBeInTheDocument();
  });
});

describe("ContextBash", () => {
  it("一行总览：失败大于 0 时数字用危险色", () => {
    const card = renderCard(MOCK_CONTEXT_BASH);
    const stat = (key: string) => card.querySelector<HTMLElement>(`[data-bash-stat="${key}"]`);
    expect(stat("calls")).toHaveTextContent("38");
    expect(stat("failed")).toHaveTextContent("3");
    expect(card.querySelector("[data-bash-summary]")).toHaveTextContent("38次调用3次失败1m52s合计");
    expect(stat("failed")).toHaveClass("text-danger");
    expect(stat("duration")).toHaveTextContent("1m52s");
    expect(within(card).getByText("12 个程序")).toBeInTheDocument();
    cleanup();
    expect(renderCard({ ...MOCK_CONTEXT_BASH, failed: 0 }).querySelector('[data-bash-stat="failed"]')).not.toHaveClass("text-danger");
  });

  it("程序行按后端顺序显示次数和失败、不写占比；默认 8 行，可以再显示", async () => {
    const card = renderCard(MOCK_CONTEXT_BASH);
    expect(programNames(card)).toEqual(["git", "pnpm", "cat", "grep", "rg", "tail", "ls", "sed"]);
    const pnpm = card.querySelector<HTMLElement>('[data-bash-program="pnpm"]')!;
    expect(pnpm).toHaveTextContent(/8$/);
    expect(pnpm).not.toHaveTextContent("%");
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
    expect(subs[0]).toHaveTextContent(/5$/);
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
