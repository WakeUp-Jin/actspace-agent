import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useContextPanel } from "../components/right-panel/context/use-context-panel";
import { mockContextPanelView } from "../mock/context-panel-fixture";
import { setupBridge } from "./helpers/bridge";

afterEach(() => { vi.useRealTimers(); Object.defineProperty(document, "hidden", { configurable: true, value: false }); });
it("refreshes settled history without a new message, sends a conditional token and releases when hidden", async () => {
  vi.useFakeTimers();
  const handler = vi.fn(async (input: any) => {
    if (input.release) return null;
    const view = mockContextPanelView(input.sessionId);
    view.versionToken = input.versionToken ? "ready" : "syncing";
    view.history = { status: input.versionToken ? "ready" : "syncing", indexGeneration: "g", indexedThroughSeq: input.versionToken ? 10 : 2, targetThroughSeq: 10 };
    return view;
  });
  setupBridge({ "sessions.describeContextPanel": handler });
  const hook = renderHook(() => useContextPanel({ sessionId: "s", revision: 1, fallbackState: null }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(hook.result.current.data?.view.history?.status).toBe("syncing");
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(hook.result.current.data?.view.history?.status).toBe("ready");
  expect(handler.mock.calls[1]![0].versionToken).toBe("syncing");
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  const count = handler.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(handler).toHaveBeenCalledTimes(count);
  expect(handler.mock.calls.at(-1)![0].release).toBe(true);
  hook.unmount();
});
it("ignores an old Session response and accepts a recreated Context at a lower sequence", async () => {
  let release!: (value: unknown) => void;
  const old = new Promise(resolve => { release = resolve; });
  let calls = 0;
  setupBridge({ "sessions.describeContextPanel": async input => {
    if(input.release) return null;
    if(input.sessionId === "old") return old;
    const view=mockContextPanelView("new"); view.throughJournalSeq=++calls === 1 ? 100 : 1; view.currentVersion=`g${calls}`; return view;
  } });
  const hook=renderHook(({sessionId,revision})=>useContextPanel({sessionId,revision,fallbackState:null}),{initialProps:{sessionId:"old",revision:1}});
  hook.rerender({sessionId:"new",revision:1});
  await waitFor(()=>expect(hook.result.current.data?.view.sessionId).toBe("new"));
  await act(async()=>{release(mockContextPanelView("old"));await old;});
  expect(hook.result.current.data?.view.sessionId).toBe("new");
  hook.rerender({sessionId:"new",revision:2});
  await waitFor(()=>expect(hook.result.current.data?.view.throughJournalSeq).toBe(1));
});
it("keeps a single refresh in flight when revisions change",async()=>{
  let release!: (value: unknown)=>void;let active=0,max=0;
  setupBridge({"sessions.describeContextPanel":async input=>{if(input.release)return null;active++;max=Math.max(max,active);try{return await new Promise(resolve=>{release=resolve;});}finally{active--;}}});
  const hook=renderHook(({revision})=>useContextPanel({sessionId:"s",revision,fallbackState:null}),{initialProps:{revision:1}});
  hook.rerender({revision:2});hook.rerender({revision:3});expect(max).toBe(1);
  await act(async()=>{release(mockContextPanelView("s"));});hook.unmount();expect(max).toBe(1);
});
