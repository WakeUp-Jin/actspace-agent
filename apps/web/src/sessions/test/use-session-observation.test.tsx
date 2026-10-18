import { act, renderHook, waitFor } from "@testing-library/react";
import { connectionWrapper, fakeClient, fakeConnection, FakeConnectionStore, observeResult, observationFixture, taskSnapshot } from "../../test/helpers/fake-session";
import { useSessionObservation } from "../use-session-observation";

const run = (state = "running") => ({ runId: "r1", taskId: "t1", harness: {}, configuration: { model: "mock/mock" }, state, result: null });
const liveDelta = (message: string) => ({ kind: "live", event: { kind: "assistant-delta", sessionId: "s1", agentRunId: "r1", turnId: "t", requestId: "q", messageId: "m1", message } });

it("observes on mount, shows live deltas and unobserves on unmount", async () => {
  const client = fakeClient(method => method === "sessions.observe" ? observeResult("s1", { tasks: taskSnapshot({ runs: [run()] }) }) : null);
  const connection = fakeConnection(client);
  const store = new FakeConnectionStore(connection);
  const { result, unmount } = renderHook(() => useSessionObservation("s1"), { wrapper: connectionWrapper(store) });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current).toMatchObject({ title: "测试会话", running: true, runId: "r1", agentMode: "agent", agentModeRevision: 3 });
  act(() => { connection.events.accept({ subscriptionId: "sub-1", epoch: "e1", cursor: 2, value: liveDelta("你好") }); });
  await waitFor(() => expect(result.current.items.some(item => item.type === "block" && item.block.kind === "assistant" && item.block.content === "你好")).toBe(true));
  unmount();
  expect(client.calls.map(call => call.method)).toEqual(["sessions.observe", "sessions.unobserve"]);
  expect(client.calls[1]!.params).toEqual({ subscriptionId: "sub-1" });
});

it("buffers events that arrive before the snapshot is applied", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const client = fakeClient(async method => { if (method === "sessions.observe") { await gate; return observeResult("s1", { tasks: taskSnapshot({ runs: [run()] }) }); } return null; });
  const connection = fakeConnection(client);
  const store = new FakeConnectionStore(connection);
  const { result } = renderHook(() => useSessionObservation("s1"), { wrapper: connectionWrapper(store) });
  release();
  await waitFor(() => expect(client.calls.length).toBe(1));
  connection.events.accept({ subscriptionId: "sub-1", epoch: "e1", cursor: 2, value: liveDelta("早到") });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  await waitFor(() => expect(result.current.items.length).toBe(1));
});

it("replaces the snapshot on a new epoch and re-observes after reconnect, keeping old content meanwhile", async () => {
  const first = fakeClient(method => method === "sessions.observe" ? observeResult("s1", { title: "旧标题" }) : null);
  const connection1 = fakeConnection(first, { epoch: "e1" });
  const store = new FakeConnectionStore(connection1);
  const { result } = renderHook(() => useSessionObservation("s1"), { wrapper: connectionWrapper(store) });
  await waitFor(() => expect(result.current.title).toBe("旧标题"));

  act(() => store.set(null));
  expect(result.current.disconnected).toBe(true);
  expect(result.current.title).toBe("旧标题");

  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const second = fakeClient(async method => { if (method === "sessions.observe") { await gate; return { ...observeResult("s1", { title: "新标题", subscriptionId: "sub-2" }), epoch: "e2" }; } return null; });
  const connection2 = fakeConnection(second, { epoch: "e2" });
  act(() => store.set(connection2));
  expect(result.current).toMatchObject({ disconnected: false, status: "loading", title: "旧标题" });
  release();
  await waitFor(() => expect(result.current).toMatchObject({ status: "ready", title: "新标题", epoch: "e2" }));
  expect(second.calls.filter(call => call.method === "sessions.observe")).toHaveLength(1);
});

it("pages older history through sessions.page with beforeSeq", async () => {
  const observed = observeResult("s1");
  (observed.snapshot.observation.window as { beforeSeq: number | null }).beforeSeq = 4;
  const client = fakeClient(method => method === "sessions.observe" ? observed : method === "sessions.page" ? observationFixture("s1") : null);
  const store = new FakeConnectionStore(fakeConnection(client));
  const { result } = renderHook(() => useSessionObservation("s1"), { wrapper: connectionWrapper(store) });
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  await act(async () => { await result.current.loadOlder(); });
  expect(client.calls.find(call => call.method === "sessions.page")?.params).toEqual({ sessionId: "s1", beforeSeq: 4 });
});
