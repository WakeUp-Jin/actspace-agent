import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContextDisclosureSummary, ContextPathsInput, ContextPathsPage } from "@actspace/shared";
import { ContextPaths } from "../components/right-panel/context/ContextPaths";
import { formatPathReadAgo, groupContextPaths, isContextPathRevisionError, splitContextPath } from "../components/right-panel/context/context-paths-model";
import { useContextPaths } from "../components/right-panel/context/use-context-paths";
import { TooltipProvider } from "../components/ui/Tooltip";
import { mockContextPaths, mockContextPathsPage, mockDisclosureSummary } from "../mock/context-paths-fixture";
import { MOCK_WORKSPACE_ROOT } from "../mock/fixtures";
import { setupBridge } from "./helpers/bridge";

const SESSION = "paths-session";
const PATHS = mockContextPaths();
const READY = mockDisclosureSummary(PATHS, "r1");

afterEach(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); });

function pathsHandler(revision = "r1") {
  return vi.fn(async (input: ContextPathsInput): Promise<ContextPathsPage> => {
    if (input.revision !== revision) throw new Error("Context revision stale; reload the panel.");
    return mockContextPathsPage(PATHS, input);
  });
}

function renderCard(disclosure: ContextDisclosureSummary | undefined = READY, onStale = vi.fn()) {
  render(<TooltipProvider delayDuration={0}><ContextPaths sessionId={SESSION} disclosure={disclosure} workspaceRoot={MOCK_WORKSPACE_ROOT} onStale={onStale} /></TooltipProvider>);
  return { onStale };
}

describe("context-paths-model", () => {
  it("shows workspace paths relative and splits directory from name", () => {
    expect(splitContextPath(`${MOCK_WORKSPACE_ROOT}/src/a.ts`, `${MOCK_WORKSPACE_ROOT}/`)).toEqual({ dir: "src/", name: "a.ts" });
    expect(splitContextPath("/elsewhere/b.md", MOCK_WORKSPACE_ROOT)).toEqual({ dir: "/elsewhere/", name: "b.md" });
    expect(splitContextPath("README.md")).toEqual({ dir: "", name: "README.md" });
  });

  it("groups adjacent paths of the same directory without reordering", () => {
    const groups = groupContextPaths(PATHS.paths.slice(0, 30), MOCK_WORKSPACE_ROOT);
    expect(groups.flatMap(group => group.paths)).toEqual(PATHS.paths.slice(0, 30));
    for (const group of groups) for (const path of group.paths) expect(splitContextPath(path.path, MOCK_WORKSPACE_ROOT).dir).toBe(group.dir);
  });

  it("formats read times and recognises revision errors", () => {
    const now = Date.parse("2026-10-18T12:00:00Z");
    expect(formatPathReadAgo(undefined, now)).toBe("未读过");
    expect(formatPathReadAgo("bad", now)).toBe("—");
    expect(formatPathReadAgo("2026-10-18T11:59:30Z", now)).toBe("刚刚");
    expect(formatPathReadAgo("2026-10-18T11:15:00Z", now)).toBe("45 分钟前");
    expect(formatPathReadAgo("2026-10-18T09:00:00Z", now)).toBe("3 小时前");
    expect(formatPathReadAgo("2026-10-16T12:00:00Z", now)).toBe("2 天前");
    expect(isContextPathRevisionError("Context revision stale; reload the panel.")).toBe(true);
    expect(isContextPathRevisionError("Context path cursor invalid; reload the panel.")).toBe(true);
    expect(isContextPathRevisionError("Context disclosure unavailable.")).toBe(false);
  });
});

describe("useContextPaths", () => {
  it("reads nothing while disabled and the first page once enabled", async () => {
    const handler = pathsHandler();
    setupBridge({ "sessions.listContextPaths": handler });
    const hook = renderHook(props => useContextPaths({ sessionId: SESSION, disclosure: READY, visibility: "active", onStale: () => {}, ...props }), { initialProps: { enabled: false } });
    await act(async () => {});
    expect(handler).not.toHaveBeenCalled();
    hook.rerender({ enabled: true });
    await waitFor(() => expect(hook.result.current.list?.loaded).toBe(true));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toMatchObject({ sessionId: SESSION, revision: "r1", visibility: "active" });
    expect(hook.result.current.list?.total).toBe(READY.status === "ready" ? READY.activeCount : 0);
  });

  it("drops old pages when the revision changes and ignores a response for another revision", async () => {
    const handler = vi.fn(async (input: ContextPathsInput) => ({ ...mockContextPathsPage(PATHS, input), revision: input.revision === "r2" ? "r-other" : input.revision }));
    setupBridge({ "sessions.listContextPaths": handler });
    const hook = renderHook(props => useContextPaths({ sessionId: SESSION, visibility: "active", enabled: true, onStale: () => {}, ...props }), { initialProps: { disclosure: READY } });
    await waitFor(() => expect(hook.result.current.list?.loaded).toBe(true));
    hook.rerender({ disclosure: mockDisclosureSummary(PATHS, "r2") });
    await waitFor(() => expect(hook.result.current.list?.error).toBe("路径版本不一致，请重试。"));
    expect(hook.result.current.list?.paths).toEqual([]);
    expect(handler.mock.calls.at(-1)![0].revision).toBe("r2");
  });

  it("appends the next page and dedupes by id", async () => {
    const handler = vi.fn(async (input: ContextPathsInput) => {
      const page = mockContextPathsPage(PATHS, input);
      // 第二页带回一条第一页已有的路径，应当被去掉。
      return input.cursor ? { ...page, paths: [PATHS.paths.filter(path => path.visibility === "active")[0]!, ...page.paths] } : page;
    });
    setupBridge({ "sessions.listContextPaths": handler });
    const hook = renderHook(() => useContextPaths({ sessionId: SESSION, disclosure: READY, visibility: "active", enabled: true, onStale: () => {} }));
    await waitFor(() => expect(hook.result.current.list?.loaded).toBe(true));
    expect(hook.result.current.list?.nextCursor).toBeDefined();
    act(() => hook.result.current.loadMore());
    await waitFor(() => expect(hook.result.current.list?.nextCursor).toBeUndefined());
    const ids = hook.result.current.list!.paths.map(path => path.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(hook.result.current.list!.total);
  });

  it("asks the panel to refresh once on a stale revision, then waits for the user", async () => {
    const handler = pathsHandler("r-newer");
    const onStale = vi.fn();
    setupBridge({ "sessions.listContextPaths": handler });
    const hook = renderHook(() => useContextPaths({ sessionId: SESSION, disclosure: READY, visibility: "active", enabled: true, onStale }));
    await waitFor(() => expect(hook.result.current.list?.error).toMatch(/revision stale/));
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not read while the page is hidden", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const handler = pathsHandler();
    setupBridge({ "sessions.listContextPaths": handler });
    const hook = renderHook(() => useContextPaths({ sessionId: SESSION, disclosure: READY, visibility: "active", enabled: true, onStale: () => {} }));
    await act(async () => {});
    expect(handler).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(hook.result.current.list?.loaded).toBe(true));
  });
});

describe("ContextPaths", () => {
  it("shows the cycle and both counts while the list stays collapsed", async () => {
    const handler = pathsHandler();
    setupBridge({ "sessions.listContextPaths": handler });
    renderCard();
    const card = screen.getByRole("region", { name: "路径" });
    expect(within(card).getByText(/第 4 压缩周期/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /活跃\s*87/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(card).getByRole("button", { name: /睡眠\s*342/ })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "显示活跃路径 · 87 条" })).toHaveAttribute("aria-expanded", "false");
    await act(async () => {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("expands to a grouped list, switches tabs and reveals more rows", async () => {
    const handler = pathsHandler();
    setupBridge({ "sessions.listContextPaths": handler });
    renderCard();
    const card = screen.getByRole("region", { name: "路径" });
    await userEvent.click(within(card).getByRole("button", { name: /显示活跃路径/ }));
    expect(await within(card).findByRole("button", { name: "活跃 · 已显示 12 / 87" })).toHaveAttribute("aria-expanded", "true");
    expect(within(card).getByRole("button", { name: "按目录" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(card).getByRole("button", { name: "再显示 20 项（共 87）" }));
    expect(within(card).getByRole("button", { name: "活跃 · 已显示 32 / 87" })).toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: /睡眠\s*342/ }));
    expect(await within(card).findByRole("button", { name: "睡眠 · 已显示 12 / 342" })).toBeInTheDocument();
    expect(handler.mock.calls.map(([input]) => input.visibility)).toEqual(["active", "sleeping"]);
  });

  it("opens a row's details and copies the path without another bridge call", async () => {
    const handler = pathsHandler();
    setupBridge({ "sessions.listContextPaths": handler });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderCard();
    const card = screen.getByRole("region", { name: "路径" });
    await userEvent.click(within(card).getByRole("button", { name: /显示活跃路径/ }));
    const first = (await within(card).findAllByRole("listitem"))[0]!;
    await userEvent.click(within(first).getAllByRole("button")[0]!);
    expect(within(first).getByText("本周期读取")).toBeInTheDocument();
    const calls = handler.mock.calls.length;
    await userEvent.click(within(first).getAllByRole("button", { name: "复制完整路径" })[1]!);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(MOCK_WORKSPACE_ROOT));
    expect(handler).toHaveBeenCalledTimes(calls);
  });

  it("shows a retryable error", async () => {
    let fail = true;
    setupBridge({ "sessions.listContextPaths": async input => {
      if (fail) { fail = false; throw new Error("boom"); }
      return mockContextPathsPage(PATHS, input);
    } });
    renderCard();
    const card = screen.getByRole("region", { name: "路径" });
    await userEvent.click(within(card).getByRole("button", { name: /显示活跃路径/ }));
    expect(await within(card).findByRole("alert")).toHaveTextContent("活跃路径读取失败");
    await userEvent.click(within(card).getByRole("button", { name: "重试" }));
    expect(await within(card).findByRole("button", { name: "活跃 · 已显示 12 / 87" })).toBeInTheDocument();
  });

  it("warns when the active set is full", () => {
    setupBridge();
    renderCard(mockDisclosureSummary(mockContextPaths(100, 5), "full"));
    expect(screen.getByText(/活跃路径已满 100 条/)).toBeInTheDocument();
  });

  it("explains when there is no disclosure", () => {
    setupBridge();
    renderCard({ status: "unavailable" });
    expect(screen.getByText("当前会话没有路径记录。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /显示/ })).not.toBeInTheDocument();
  });
});
