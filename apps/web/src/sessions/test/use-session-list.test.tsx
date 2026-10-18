import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { connectionWrapper, fakeClient, fakeConnection, FakeConnectionStore } from "../../test/helpers/fake-session";
import { SESSION_LIST_DEBOUNCE_MS, SessionListProvider, useSessionList } from "../use-session-list";

afterEach(() => vi.useRealTimers());

it("keeps refreshing while sessions-changed events stream in", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const client = fakeClient(method => method === "sessions.list" ? [] : null);
  const connection = fakeConnection(client);
  const Connected = connectionWrapper(new FakeConnectionStore(connection));
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Connected, null, createElement(SessionListProvider, null, children));
  const { result } = renderHook(() => useSessionList(), { wrapper });
  await waitFor(() => expect(result.current.sessions).toEqual([]));
  const lists = () => client.calls.filter(call => call.method === "sessions.list").length;
  // 流式输出时事件间隔远小于刷新窗口：也要按窗口持续刷新，而不是等事件停下来。
  for (let i = 0; i < 10; i++) {
    act(() => { connection.events.accept({ subscriptionId: "sub-host", epoch: "e1", cursor: i + 1, value: { kind: "sessions-changed" } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(SESSION_LIST_DEBOUNCE_MS / 2); });
  }
  expect(lists()).toBeGreaterThanOrEqual(1 + 4);
});
