import { ConnectionStore, RECONNECT_DELAYS_MS, normalizeHostUrl, rpcUrl } from "../connection-store";
import { activeSavedHost, saveHost } from "../saved-hosts";
import { fakeHostHandler, fakeSockets, type FakeHostOptions } from "../../test/helpers/fake-host";

const target = () => new EventTarget() as unknown as Window;
function setup(options: FakeHostOptions = {}, refuse = () => false) {
  let current = options;
  const factory = fakeSockets(() => fakeHostHandler(current), { refuse });
  const events = target();
  let visible = true;
  const store = new ConnectionStore({ createSocket: factory.create, storage: localStorage, target: events, isVisible: () => visible });
  return { store, factory, events, setOptions: (next: FakeHostOptions) => { current = next; }, hide: (value: boolean) => { visible = !value; } };
}
const saved = { hostId: "h1", deviceId: "d1", url: "https://host.example", token: "t1", name: "Safari · iPhone", pairedAt: "2026-10-17T00:00:00.000Z" };
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it("normalizes addresses to an origin and derives the rpc url", () => {
  expect(normalizeHostUrl("my-mac.tail.ts.net/")).toBe("https://my-mac.tail.ts.net");
  expect(rpcUrl("https://a.example")).toBe("wss://a.example/rpc");
  expect(rpcUrl("http://127.0.0.1:5174")).toBe("ws://127.0.0.1:5174/rpc");
});

it("pairs, stores the device token and becomes ready", async () => {
  const { store, factory } = setup();
  await store.pair("https://host.example", " GOOD ", "Safari · iPhone");
  expect(store.getState().status).toBe("ready");
  expect(store.getState().connection?.description.workspaces[0]?.id).toBe("main");
  expect(activeSavedHost()).toMatchObject({ hostId: "h1", deviceId: "d1", token: "t1", url: "https://host.example", name: "Safari · iPhone" });
  expect(factory.last().sent.map(item => item.method)).toEqual(["host.hello", "auth.pair", "host.describe", "host.observe"]);
});

it("reports an invalid pair code as failed without retrying", async () => {
  const { store, factory } = setup();
  await expect(store.pair("https://host.example", "BAD", "x")).rejects.toMatchObject({ kind: "UNAUTHENTICATED" });
  expect(store.getState().status).toBe("failed");
  await vi.advanceTimersByTimeAsync(60_000);
  expect(factory.sockets).toHaveLength(1);
  expect(activeSavedHost()).toBeNull();
});

it("fails without retrying when the Host identity changed", async () => {
  saveHost(saved);
  const { store, factory } = setup({ hostId: "h2" });
  await store.resume();
  expect(store.getState()).toMatchObject({ status: "failed", error: { kind: "FORBIDDEN" } });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(factory.sockets).toHaveLength(1);
});

it("goes to revoked and clears the token on close code 4003", async () => {
  saveHost(saved);
  const { store, factory } = setup();
  await store.resume();
  expect(store.getState().status).toBe("ready");
  factory.last().close(4003);
  expect(store.getState()).toMatchObject({ status: "revoked", revokedReason: "revoked" });
  expect(activeSavedHost()).toMatchObject({ hostId: "h1", token: "" });
});

it("treats an UNAUTHENTICATED resume as an expired login", async () => {
  saveHost(saved);
  const { store } = setup({ resumeError: "UNAUTHENTICATED" });
  await store.resume();
  expect(store.getState()).toMatchObject({ status: "revoked", revokedReason: "unauthenticated" });
  expect(activeSavedHost()?.token).toBe("");
});

it("backs off 1, 2, 4, 8, 16, 30, 30 seconds while the Host is unreachable", async () => {
  saveHost(saved);
  const { store, factory } = setup({}, () => true);
  await store.resume();
  expect(store.getState().status).toBe("reconnecting");
  const delays: number[] = [];
  for (const expected of [...RECONNECT_DELAYS_MS, 30_000]) {
    const before = factory.sockets.length;
    await vi.advanceTimersByTimeAsync(expected - 1);
    expect(factory.sockets).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(factory.sockets).toHaveLength(before + 1);
    delays.push(expected);
  }
  expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
});

it("reconnects immediately when the page becomes visible again", async () => {
  saveHost(saved);
  let refuse = true;
  const { store, factory, events } = setup({}, () => refuse);
  await store.resume();
  for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[i]!);
  expect(store.getState().status).toBe("reconnecting");
  const before = factory.sockets.length;
  refuse = false;
  events.dispatchEvent(new Event("visibilitychange"));
  await settle();
  expect(factory.sockets).toHaveLength(before + 1);
  expect(store.getState().status).toBe("ready");
});

it("reconnects after the socket drops and hands out a new connection", async () => {
  saveHost(saved);
  const { store, factory } = setup();
  await store.resume();
  const first = store.getState().connection;
  factory.last().close(1006);
  expect(store.getState()).toMatchObject({ status: "reconnecting", connection: null });
  // 断线期间保留上次的 host.describe，工作区名不会变成路径末段
  expect(store.getState().description).toBe(first!.description);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(store.getState().status).toBe("ready");
  expect(store.getState().connection).not.toBe(first);
});

it("stays ready but flags maintenance while the Host is draining", async () => {
  saveHost(saved);
  const { store, factory } = setup({ state: "draining" });
  await store.resume();
  expect(store.getState()).toMatchObject({ status: "ready", maintenance: true });
  factory.last().event("sub-host", { kind: "state", state: "ready" });
  await settle();
  expect(store.getState().maintenance).toBe(false);
  store.reportError(Object.assign(new (await import("@actspace/shared/host-protocol")).HostError("MAINTENANCE", "x")));
  expect(store.getState()).toMatchObject({ status: "ready", maintenance: true });
});

it("does not reconnect after an explicit disconnect", async () => {
  saveHost(saved);
  const { store, factory } = setup();
  await store.resume();
  store.disconnect();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(factory.sockets).toHaveLength(1);
  expect(store.getState().status).toBe("idle");
});
