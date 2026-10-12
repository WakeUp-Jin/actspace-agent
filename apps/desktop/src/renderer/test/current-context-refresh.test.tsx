import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCurrentContext } from "../components/workbench/use-current-context";
import { mockContextPanelView, mockContextState } from "../mock/context-panel-fixture";
import { setupBridge } from "./helpers/bridge";

const state = (id: string) => mockContextState(mockContextPanelView(id));
afterEach(() => { vi.useRealTimers(); Object.defineProperty(document, "hidden", { configurable: true, value: false }); });

it("reads the same complete totals as the panel, and stops while hidden or outside chat", async () => {
  vi.useFakeTimers();
  const read = vi.fn(async ({ sessionId }: { sessionId: string }) => state(sessionId));
  setupBridge({ "sessions.describeContext": read });
  const hook = renderHook(({ visible }) => useCurrentContext("s", 1, visible), { initialProps: { visible: true } });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(hook.result.current?.totalEstimatedTokens).toBe(mockContextPanelView("s").current.totalEstimatedTokens);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(read).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(read).toHaveBeenCalledTimes(2);
  hook.rerender({ visible: false });
  expect(hook.result.current).toBeNull();
});

it("discards a late old Session response and accepts a new engine state with a lower sequence", async () => {
  let resolveOld!: (value: unknown) => void;
  const old = new Promise(resolve => { resolveOld = resolve; });
  setupBridge({ "sessions.describeContext": async ({ sessionId }) => sessionId === "old" ? old : state(sessionId) });
  const hook = renderHook(({ id }) => useCurrentContext(id, 1, true), { initialProps: { id: "old" } });
  hook.rerender({ id: "new" });
  await waitFor(() => expect(hook.result.current?.sessionId).toBe("new"));
  await act(async () => { resolveOld(state("old")); await old; });
  expect(hook.result.current?.sessionId).toBe("new");
});

it("coalesces revision changes while one light read is in flight", async () => {
  let release!: (value: unknown) => void;
  const read = vi.fn(async () => new Promise(resolve => { release = resolve; }));
  setupBridge({ "sessions.describeContext": read });
  const hook = renderHook(({ revision }) => useCurrentContext("s", revision, true), { initialProps: { revision: 1 } });
  hook.rerender({ revision: 2 }); hook.rerender({ revision: 3 });
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { release(state("s")); });
  hook.unmount();
});
