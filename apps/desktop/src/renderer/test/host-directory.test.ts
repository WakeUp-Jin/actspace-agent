import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostConnection } from "@actspace/shared/host-protocol";
import { createHostDirectory, type HostDescription, type HostDirectorySource } from "../target/host-directory";

const host = (hostId: string, state: HostConnection["state"] = "connected"): HostConnection =>
  ({ id: hostId, hostId, name: hostId, endpoint: { kind: "wss", url: `wss://${hostId}` }, state });
const description = (state = "ready"): HostDescription => ({ state, workspaces: [{ id: "w", name: "w", path: "/w" }], models: [{ id: "m", name: "m" }], defaultModel: "m" });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeSource(initial: HostConnection[]) {
  let changed: ((hosts: HostConnection[]) => void) | null = null;
  let event: Parameters<HostDirectorySource["onEvent"]>[0] | null = null;
  const source = {
    list: vi.fn(async () => initial),
    onChanged: vi.fn((listener: (hosts: HostConnection[]) => void) => { changed = listener; return () => { changed = null; }; }),
    onEvent: vi.fn((listener: Parameters<HostDirectorySource["onEvent"]>[0]) => { event = listener; return () => { event = null; }; }),
    describe: vi.fn(async (_hostId: string) => description()),
  };
  return { source, change: (hosts: HostConnection[]) => changed?.(hosts), event: (...args: Parameters<Parameters<HostDirectorySource["onEvent"]>[0]>) => event?.(...args), subscribed: () => changed !== null };
}

describe("HostDirectory", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("subscribes once for many consumers and releases after the last one", async () => {
    const fake = fakeSource([host("a")]);
    const directory = createHostDirectory(fake.source);
    const offs = [directory.subscribe(() => {}), directory.subscribe(() => {}), directory.onHostsChanged(() => {}), directory.onHostRemoved(() => {})];
    await flush();
    expect(fake.source.list).toHaveBeenCalledTimes(1);
    expect(fake.source.onChanged).toHaveBeenCalledTimes(1);
    expect(fake.source.onEvent).toHaveBeenCalledTimes(1);
    expect(directory.getSnapshot().hosts.map((item) => item.hostId)).toEqual(["a"]);
    for (const off of offs.slice(0, 3)) off();
    expect(fake.subscribed()).toBe(true);
    offs[3]!();
    expect(fake.subscribed()).toBe(false);
    expect(directory.getSnapshot().loaded).toBe(false);
  });

  it("describes each connected Host once per connection and again after it reconnects", async () => {
    const fake = fakeSource([host("a"), host("b", "offline")]);
    const directory = createHostDirectory(fake.source);
    const off = directory.subscribe(() => {});
    await flush();
    expect(fake.source.describe.mock.calls).toEqual([["a"]]);
    expect(directory.getSnapshot().descriptions.a?.defaultModel).toBe("m");
    fake.change([host("a"), host("b", "offline")]);
    await flush();
    expect(fake.source.describe).toHaveBeenCalledTimes(1);
    fake.change([host("a", "offline"), host("b")]);
    fake.change([host("a"), host("b")]);
    await flush();
    expect(fake.source.describe.mock.calls.map(([id]) => id).sort()).toEqual(["a", "a", "b"]);
    off();
  });

  it("records why describe failed and clears it after a successful describe", async () => {
    const fake = fakeSource([host("a")]);
    fake.source.describe.mockRejectedValueOnce(new Error("Host 拒绝了请求"));
    const directory = createHostDirectory(fake.source);
    const off = directory.subscribe(() => {});
    await flush();
    expect(directory.getSnapshot().describeErrors.a).toBe("Host 拒绝了请求");
    expect(directory.getSnapshot().describing.a).toBeUndefined();
    fake.change([host("a", "offline")]);
    fake.change([host("a")]);
    await flush();
    expect(directory.getSnapshot().describeErrors.a).toBeUndefined();
    expect(directory.getSnapshot().descriptions.a).toBeDefined();
    off();
  });

  it("retries a failed describe on the next list change without a reconnect", async () => {
    // 复核：原来每次 hostsChanged 都会重新 describe；只在连接时 describe 后，偶发失败不能一直卡到重连。
    const fake = fakeSource([host("a")]);
    fake.source.describe.mockRejectedValueOnce(new Error("describe timed out"));
    const directory = createHostDirectory(fake.source);
    const off = directory.subscribe(() => {});
    await flush();
    expect(directory.getSnapshot().describeErrors.a).toBe("describe timed out");
    let resolve!: (value: HostDescription) => void;
    fake.source.describe.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    fake.change([host("a")]);
    expect(fake.source.describe).toHaveBeenCalledTimes(2);
    // 新的结果回来之前显示「正在读取」，不再显示上次的失败。
    expect(directory.getSnapshot().describeErrors.a).toBeUndefined();
    expect(directory.getSnapshot().describing.a).toBe(true);
    fake.change([host("a")]);
    expect(fake.source.describe).toHaveBeenCalledTimes(2);
    resolve(description());
    await flush();
    expect(directory.getSnapshot().descriptions.a).toBeDefined();
    fake.change([host("a")]);
    expect(fake.source.describe).toHaveBeenCalledTimes(2);
    off();
  });

  it("drops a describe result that arrives after the Host disconnected", async () => {
    const fake = fakeSource([host("a")]);
    let resolve!: (value: HostDescription) => void;
    fake.source.describe.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const directory = createHostDirectory(fake.source);
    const off = directory.subscribe(() => {});
    await flush();
    expect(directory.getSnapshot().describing.a).toBe(true);
    fake.change([host("a", "offline")]);
    resolve(description());
    await flush();
    expect(directory.getSnapshot().descriptions.a).toBeUndefined();
    expect(directory.getSnapshot().describing.a).toBeUndefined();
    off();
  });

  it("notifies removed Hosts and forgets their description", async () => {
    const fake = fakeSource([host("a"), host("b")]);
    const directory = createHostDirectory(fake.source);
    const removed = vi.fn();
    const off = directory.onHostRemoved(removed);
    await flush();
    expect(directory.getSnapshot().descriptions.a).toBeDefined();
    fake.change([host("b")]);
    expect(removed.mock.calls).toEqual([["a"]]);
    expect(directory.getSnapshot().descriptions.a).toBeUndefined();
    off();
  });

  it("does not treat the first list as removing anything", async () => {
    const fake = fakeSource([]);
    const directory = createHostDirectory(fake.source);
    const removed = vi.fn();
    const off = directory.onHostRemoved(removed);
    fake.change([host("a")]);
    await flush();
    expect(removed).not.toHaveBeenCalled();
    off();
  });

  it("applies Host state events to the description", async () => {
    const fake = fakeSource([host("a")]);
    const directory = createHostDirectory(fake.source);
    const off = directory.subscribe(() => {});
    await flush();
    fake.event({ hostId: "a", event: { value: { kind: "state", state: "busy" } } } as never);
    expect(directory.getSnapshot().descriptions.a?.state).toBe("busy");
    off();
  });

  it("keeps the list error visible and marks the directory loaded", async () => {
    const fake = fakeSource([]);
    fake.source.list.mockRejectedValueOnce(new Error("bridge down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const directory = createHostDirectory(fake.source);
    const off = directory.subscribe(() => {});
    await flush();
    expect(directory.getSnapshot()).toMatchObject({ loaded: true, listError: "bridge down" });
    off();
  });
});
