import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createSessionLocalStore,
  DEFAULT_SESSION_LOCAL_STATE,
  SessionLocalStoreContext,
  useSessionLocal,
  useSessionLocalIds,
  type SessionLocalState,
} from "../session/session-local-store";

describe("SessionLocalStore", () => {
  it("returns the shared default for unknown sessions and again after evict", () => {
    const store = createSessionLocalStore();
    expect(store.get("s-1")).toBe(DEFAULT_SESSION_LOCAL_STATE);
    store.update("s-1", (state) => ({ ...state, failed: true, unread: true }));
    expect(store.get("s-1")).toMatchObject({ failed: true, unread: true });
    expect(store.ids()).toEqual(["s-1"]);

    store.evict("s-1");
    expect(store.get("s-1")).toBe(DEFAULT_SESSION_LOCAL_STATE);
    expect(store.ids()).toEqual([]);
  });

  it("evictWhere drops every matching session and keeps the rest", () => {
    const store = createSessionLocalStore();
    for (const id of ["host:a", "host:b", "local-1"]) store.update(id, (state) => ({ ...state, approvalPending: true }));
    store.evictWhere((id) => id.startsWith("host:"));
    expect(store.ids()).toEqual(["local-1"]);
    expect(store.get("host:a")).toBe(DEFAULT_SESSION_LOCAL_STATE);
  });

  it("notifies subscribers on change, and not when nothing changed", () => {
    const store = createSessionLocalStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update("s-1", (state) => ({ ...state, failed: true }));
    expect(listener).toHaveBeenCalledTimes(1);
    store.update("s-1", (state) => state);
    store.evict("missing");
    store.evictWhere(() => false);
    expect(listener).toHaveBeenCalledTimes(1);
    store.evict("s-1");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.update("s-1", (state) => ({ ...state, failed: true }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("re-renders a subscriber only when its selected value changes", () => {
    const store = createSessionLocalStore();
    const renders = vi.fn();
    const selectFailed = (state: SessionLocalState) => state.failed;
    function Probe({ sessionId }: { sessionId: string | null }) {
      const failed = useSessionLocal(sessionId, selectFailed);
      renders(failed);
      return <span data-testid="failed">{String(failed)}</span>;
    }
    const view = render(<SessionLocalStoreContext.Provider value={store}><Probe sessionId="s-1" /></SessionLocalStoreContext.Provider>);
    expect(renders).toHaveBeenCalledTimes(1);

    act(() => { store.update("s-1", (state) => ({ ...state, approvalPending: true })); });
    act(() => { store.update("s-2", (state) => ({ ...state, failed: true })); });
    expect(renders).toHaveBeenCalledTimes(1);

    act(() => { store.update("s-1", (state) => ({ ...state, failed: true })); });
    expect(renders).toHaveBeenCalledTimes(2);
    expect(view.getByTestId("failed").textContent).toBe("true");

    act(() => { store.evict("s-1"); });
    expect(view.getByTestId("failed").textContent).toBe("false");

    view.rerender(<SessionLocalStoreContext.Provider value={store}><Probe sessionId={null} /></SessionLocalStoreContext.Provider>);
    expect(view.getByTestId("failed").textContent).toBe("false");
  });

  it("useSessionLocalIds keeps the same Set while membership is unchanged", () => {
    const store = createSessionLocalStore();
    const seen: ReadonlySet<string>[] = [];
    const isFailed = (state: SessionLocalState) => state.failed;
    function Probe() { seen.push(useSessionLocalIds(store, isFailed)); return null; }
    render(<Probe />);
    act(() => { store.update("s-1", (state) => ({ ...state, failed: true })); });
    expect([...seen.at(-1)!]).toEqual(["s-1"]);
    const afterFirst = seen.length;

    act(() => { store.update("s-1", (state) => ({ ...state, approvalPending: true })); });
    act(() => { store.update("s-2", (state) => ({ ...state, approvalPending: true })); });
    expect(seen.length).toBe(afterFirst);

    act(() => { store.update("s-2", (state) => ({ ...state, failed: true })); });
    expect([...seen.at(-1)!].sort()).toEqual(["s-1", "s-2"]);
    act(() => { store.evict("s-1"); });
    expect([...seen.at(-1)!]).toEqual(["s-2"]);
  });

  it("requires a provider", () => {
    function Bare() { useSessionLocal("s-1", (state) => state.failed); return null; }
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/SessionLocalStoreContext/);
    vi.mocked(console.error).mockRestore();
  });
});
