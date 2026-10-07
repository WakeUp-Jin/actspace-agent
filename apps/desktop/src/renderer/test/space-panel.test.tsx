import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SpaceRightPanel } from "../components/space/SpaceRightPanel";
import { SpaceObjectMenu } from "../components/space/panel/SpaceObjectMenu";
import { currentSpace, currentTab, panelFor } from "../components/space/model/selectors";
import { spaceDemoStore } from "../components/space/model/space-demo-store";
import { TooltipProvider } from "../components/ui/Tooltip";

const actions = spaceDemoStore.actions;
const state = () => spaceDemoStore.getSnapshot();
const run = (fn: () => void) => act(fn);

function setup() {
  render(
    <TooltipProvider delayDuration={0}>
      <SpaceObjectMenu />
      <SpaceRightPanel />
    </TooltipProvider>,
  );
  return userEvent.setup();
}
const tabNames = () => screen.queryAllByRole("tab").map((t) => t.textContent);
const buttonLabels = (root: HTMLElement) => within(root).getAllByRole("button").map((b) => b.getAttribute("aria-label"));

beforeEach(() => run(() => actions.reset()));
afterEach(() => {
  cleanup();
  actions.reset();
});

describe("SpaceRightPanel tabs", () => {
  it("opens three tabs for the coordinator by default", () => {
    setup();
    expect(tabNames()).toEqual(["Actor", "库", "记忆"]);
    expect(screen.getByRole("tab", { name: "Actor" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens Review for an actor with changes and files for one without", () => {
    setup();
    run(() => actions.openActorTab("be"));
    expect(tabNames()).toEqual(["Review", "终端"]);
    expect(screen.getByRole("tab", { name: "Review" })).toHaveAttribute("aria-selected", "true");
    run(() => actions.openActorTab("tester"));
    expect(tabNames()).toEqual(["文件", "终端"]);
  });

  it("restores each context's own tabs when switching back", () => {
    setup();
    run(() => actions.openPanelTab("files"));
    expect(tabNames()).toEqual(["Actor", "库", "记忆", "文件"]);
    run(() => actions.openActorTab("be"));
    run(() => actions.closePanelTab("terminal"));
    expect(tabNames()).toEqual(["Review"]);
    run(() => actions.selectTab("coord"));
    expect(tabNames()).toEqual(["Actor", "库", "记忆", "文件"]);
    expect(screen.getByRole("tab", { name: "文件" })).toHaveAttribute("aria-selected", "true");
    run(() => actions.openActorTab("be"));
    expect(tabNames()).toEqual(["Review"]);
  });

  it("shows the launcher after the last tab is closed", async () => {
    const user = setup();
    run(() => actions.openActorTab("tester"));
    await user.click(screen.getByRole("button", { name: "关闭 文件" }));
    await user.click(screen.getByRole("button", { name: "关闭 终端" }));
    expect(tabNames()).toEqual([]);
    expect(panelFor(state())?.active).toBeNull();
    const nav = screen.getByRole("navigation", { name: "右侧面板对象" });
    expect(nav).toHaveTextContent("和打开一个普通会话时的右栏一样。");
    expect(buttonLabels(nav)).toEqual(["子 Agent", "文件", "Review", "上下文", "终端", "可视化回复"]);
    await user.click(within(nav).getByRole("button", { name: "上下文" }));
    expect(tabNames()).toEqual(["上下文"]);
  });

  it("lists the coordinator kinds on its launcher", async () => {
    const user = setup();
    for (const name of ["Actor", "库", "记忆"]) await user.click(screen.getByRole("button", { name: `关闭 ${name}` }));
    const nav = screen.getByRole("navigation", { name: "右侧面板对象" });
    expect(nav).toHaveTextContent("协调 Agent 的右栏：Actor、库、记忆，再加只给你用的文件和终端。");
    expect(buttonLabels(nav)).toEqual(["Actor", "库", "记忆", "文件", "终端"]);
  });
});

describe("SpaceObjectMenu", () => {
  it("lists only the kinds the current context can open", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "新建右侧面板对象" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Actor", "库", "记忆", "工作区文件", "终端"]);
    await user.keyboard("{Escape}");
    run(() => actions.openActorTab("be"));
    await user.click(screen.getByRole("button", { name: "新建右侧面板对象" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["工作区文件", "Review", "终端", "可视化回复", "上下文"]);
    await user.click(screen.getByRole("menuitem", { name: "上下文" }));
    expect(tabNames()).toEqual(["Review", "终端", "上下文"]);
  });
});

describe("Actor groups", () => {
  const rows = () => Array.from(document.querySelectorAll<HTMLElement>("[data-row]"));
  const row = (id: string) => rows().find((r) => r.dataset.row === id)!;

  it("orders groups wait, run, result, idle and describes each row", () => {
    setup();
    const groups = Array.from(document.querySelectorAll("[data-group]")).map((g) => g.getAttribute("data-group"));
    expect(groups).toEqual(["wait", "run", "result", "idle"]);
    expect(row("be")).toHaveAttribute("title", "后端 · 批准新索引的迁移");
    expect(row("fe")).toHaveAttribute("title", "前端 · web 端报价缓存");
    expect(row("perf")).toHaveAttribute("title", "性能分析 · 完成：慢查询分析");
    expect(row("env")).toHaveAttribute("title", "环境巡检 · 上次：确认压测环境");
    expect(row("tester")).toHaveAttribute("title", "测试员 · 还没有任务");
  });

  it("shows todo progress and unread dots where they belong", () => {
    setup();
    expect(row("be")).toHaveTextContent("4/6");
    expect(row("perf")).toHaveTextContent("3/3");
    expect(within(row("perf")).getByRole("img", { name: "未读" })).toBeInTheDocument();
    expect(row("tester")).not.toHaveTextContent("/");
  });

  it("collapses and expands a group", async () => {
    const user = setup();
    const head = screen.getByRole("button", { name: /^空闲/ });
    expect(head).toHaveAttribute("aria-expanded", "true");
    await user.click(head);
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(state().collapsed.idle).toBe(true);
    expect(document.querySelector('[data-group="idle"] [aria-hidden="true"]')).not.toBeNull();
    await user.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the actor tab when a row is clicked", async () => {
    const user = setup();
    await user.click(row("fe"));
    expect(currentTab(state())).toBe("fe");
    expect(currentSpace(state()).openTabs).toContain("fe");
  });
});

describe("Memory", () => {
  it("forgets a memory and tells the user", async () => {
    const user = setup();
    run(() => actions.selectPanelTab("memory"));
    expect(screen.getByText("3 条")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "忘记" })[0]);
    expect(currentSpace(state()).memory).toHaveLength(2);
    expect(state().notice?.text).toBe("已忘记");
    expect(screen.getByText("2 条")).toBeInTheDocument();
  });

  it("only shows a notice when editing instructions", async () => {
    const user = setup();
    run(() => actions.selectPanelTab("memory"));
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(state().notice?.text).toBe("演示里省略：编辑指令");
  });
});

describe("Files", () => {
  it("keeps focus while filtering and opens a file tab with line numbers", async () => {
    const user = setup();
    run(() => actions.openPanelTab("files"));
    const input = screen.getByRole("textbox", { name: "过滤文件名" });
    await user.click(input);
    await user.keyboard("usequote");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("usequote");
    expect(state().ftQuery).toBe("usequote");
    await user.click(screen.getByRole("button", { name: "checkout-web/src/hooks/useQuote.ts" }));
    expect(tabNames()).toEqual(["Actor", "库", "记忆", "文件", "useQuote.ts"]);
    expect(state().ftSelected).toBe("checkout-web/src/hooks/useQuote.ts");
    expect(document.body.textContent).toContain("export function useQuote");
    expect(document.body.textContent).toContain("17");
  });

  it("shows an empty message when nothing matches", async () => {
    const user = setup();
    run(() => actions.openPanelTab("files"));
    await user.type(screen.getByRole("textbox", { name: "过滤文件名" }), "zzz");
    expect(screen.getByText("没有匹配「zzz」的文件")).toBeInTheDocument();
  });
});

describe("Actor views", () => {
  it("lists changed files in Review and opens one", async () => {
    const user = setup();
    run(() => actions.openActorTab("be"));
    expect(screen.getByText(/main · 2 个文件/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /src\/quote\/service\.ts/ }));
    expect(screen.getByRole("tab", { name: "service.ts" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the commands an actor ran in the terminal", () => {
    setup();
    run(() => actions.openActorTab("be"));
    run(() => actions.selectPanelTab("terminal"));
    const log = screen.getByRole("log", { name: "终端输出" });
    expect(log).toHaveTextContent("pnpm test quote");
    expect(log).toHaveTextContent("18 通过");
    expect(log).toHaveTextContent("# 等你批准：pnpm db:migrate --env staging-2");
  });

  it("shows context usage and the empty states", () => {
    setup();
    run(() => actions.openActorTab("be"));
    run(() => actions.openPanelTab("context"));
    expect(screen.getByText(/用了 \d+%/)).toBeInTheDocument();
    expect(screen.getByText("系统提示")).toBeInTheDocument();
    run(() => actions.openPanelTab("subagents"));
    expect(screen.getByText(/这次对话还没有子 Agent。/)).toBeInTheDocument();
    run(() => actions.openPanelTab("reply"));
    expect(screen.getByText("还没有可视化回复。")).toBeInTheDocument();
  });
});
