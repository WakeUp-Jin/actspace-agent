import { describe, expect, it, vi } from "vitest";
import {
  buildBridge,
  desktopBridgeContract as contract,
  type BridgeSpec,
  type BridgeTransport,
} from "../desktop-bridge";

function fakeTransport() {
  const listeners = new Map<string, (payload: unknown) => void>();
  const unsubscribe = vi.fn();
  const transport = {
    invoke: vi.fn(async (channel: string, input?: unknown) => ({ channel, input })),
    send: vi.fn(),
    on: vi.fn((channel: string, listener: (payload: unknown) => void) => { listeners.set(channel, listener); return unsubscribe; }),
  } satisfies BridgeTransport;
  return { transport, listeners, unsubscribe };
}

const locals = { "dialogs.getPathForFile": vi.fn(() => "/tmp/a.txt"), "appearance.setUiZoom": vi.fn() };
const specs = Object.entries(contract as unknown as Record<string, Record<string, BridgeSpec>>)
  .flatMap(([domain, members]) => Object.entries(members).map(([member, spec]) => ({ domain, member, spec })));

describe("buildBridge", () => {
  it("exposes every contract member as a function", () => {
    const bridge = buildBridge(contract, fakeTransport().transport, locals) as unknown as Record<string, Record<string, unknown>>;
    for (const { domain, member } of specs) expect(typeof bridge[domain]?.[member], `${domain}.${member}`).toBe("function");
  });

  it("forwards invoke input and fills the contract default only when input is missing", async () => {
    const { transport } = fakeTransport();
    const bridge = buildBridge(contract, transport, locals);

    await bridge.tasks.abort({ sessionId: "s", agentRunId: "r" });
    expect(transport.invoke).toHaveBeenLastCalledWith(contract.tasks.abort.channel, { sessionId: "s", agentRunId: "r" });
    await bridge.app.getBootstrapState();
    expect(transport.invoke).toHaveBeenLastCalledWith(contract.app.getBootstrapState.channel, undefined);
    await bridge.sessions.create();
    expect(transport.invoke).toHaveBeenLastCalledWith(contract.sessions.create.channel, {});
    await bridge.sessions.create({ workspaceRoot: "/w" });
    expect(transport.invoke).toHaveBeenLastCalledWith(contract.sessions.create.channel, { workspaceRoot: "/w" });
  });

  it("subscribes events, fills the default payload and returns the unsubscribe", () => {
    const { transport, listeners, unsubscribe } = fakeTransport();
    const bridge = buildBridge(contract, transport, locals);
    const notices: unknown[] = [];

    const stop = bridge.events.shuttingDown((notice) => notices.push(notice));
    listeners.get(contract.events.shuttingDown.channel)!(undefined);
    listeners.get(contract.events.shuttingDown.channel)!({ reason: "update" });
    expect(notices).toEqual([{ reason: "normal" }, { reason: "update" }]);

    const terminal = vi.fn();
    bridge.events.terminal(terminal);
    listeners.get(contract.events.terminal.channel)!(undefined);
    expect(terminal).toHaveBeenCalledWith(undefined);

    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("sends fire-and-forget members and uses the preload's local implementations", () => {
    const { transport } = fakeTransport();
    const bridge = buildBridge(contract, transport, locals);

    bridge.appearance.setNativeTheme("dark");
    expect(transport.send).toHaveBeenCalledWith(contract.appearance.setNativeTheme.channel, "dark");
    expect(bridge.dialogs.getPathForFile({ name: "a.txt", size: 1 })).toBe("/tmp/a.txt");
    bridge.appearance.setUiZoom(1.25);
    expect(locals["appearance.setUiZoom"]).toHaveBeenCalledWith(1.25);
  });

  it("fails fast when a local member has no implementation", () => {
    expect(() => buildBridge(contract, fakeTransport().transport, { "dialogs.getPathForFile": () => "" })).toThrow("appearance.setUiZoom");
  });
});

describe("hosts domain", () => {
  it("forwards a Host call as one input object", async () => {
    const { transport } = fakeTransport();
    const bridge = buildBridge(contract, transport, locals);

    await bridge.hosts.call({ hostId: "h", method: "host.describe", params: { verbose: true } });
    expect(transport.invoke).toHaveBeenLastCalledWith(contract.hosts.call.channel, { hostId: "h", method: "host.describe", params: { verbose: true } });
  });
});
