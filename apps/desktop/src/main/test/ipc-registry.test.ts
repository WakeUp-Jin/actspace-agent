import { afterEach, describe, expect, it, vi } from "vitest";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import { createIpcRegistrar, IpcInputError } from "../ipc/registry";
import { trustedWindow } from "./ipc-sender-fixture";

const { handlers, listeners, ipcMain } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const listeners = new Map<string, (...args: any[]) => any>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    on: vi.fn((channel: string, listener: (...args: any[]) => any) => listeners.set(channel, listener)),
    removeListener: vi.fn((channel: string) => listeners.delete(channel)),
  };
  return { handlers, listeners, ipcMain };
});
vi.mock("electron", () => ({ ipcMain }));
afterEach(() => { handlers.clear(); listeners.clear(); vi.clearAllMocks(); });

const channel = contract.workspaces.readFile.channel;

function setup(options: Partial<Parameters<typeof createIpcRegistrar>[0]> = {}) {
  const { window, event } = trustedWindow();
  const registrar = createIpcRegistrar({ getWindow: () => window, untrustedMessage: "Untrusted test sender", ...options });
  return { registrar, event, window };
}

describe("IPC registrar", () => {
  it("rejects untrusted senders before the guard and handler run", async () => {
    const guard = vi.fn(() => null);
    const handler = vi.fn();
    const { registrar } = setup({ guards: new Map([[channel, guard]]) });
    registrar.handle(contract.workspaces.readFile, handler);

    await expect(handlers.get(channel)!({ sender: {}, senderFrame: {} }, { relativePath: "a" })).rejects.toThrow("Untrusted test sender");
    expect(guard).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("throws an error naming the channel when the guard rejects, without calling the handler", async () => {
    const handler = vi.fn();
    const { registrar, event } = setup();
    registrar.handle(contract.workspaces.readFile, handler);

    const failure = handlers.get(channel)!(event, { relativePath: 42 });
    await expect(failure).rejects.toBeInstanceOf(IpcInputError);
    await expect(failure).rejects.toThrow(`Invalid workspace file (${channel})`);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes guarded input and the event to the handler", async () => {
    const { registrar, event } = setup();
    registrar.handle(contract.workspaces.readFile, (input, received) => ({ ok: (received as unknown) === event, path: input.relativePath }) as never);

    await expect(handlers.get(channel)!(event, { relativePath: "src/a.ts" })).resolves.toEqual({ ok: true, path: "src/a.ts" });
  });

  it("runs the middleware around the handler", async () => {
    const calls: string[] = [];
    const { registrar, event } = setup({
      middleware: async (call, next) => {
        calls.push(`before ${call.channel}`);
        if ((call.input as { sessionId?: string }).sessionId === "remote") return "routed";
        const result = await next();
        calls.push("after");
        return result;
      },
    });
    registrar.handle(contract.sessions.getPreview, () => { calls.push("handler"); return null; });
    const previewChannel = contract.sessions.getPreview.channel;

    await expect(handlers.get(previewChannel)!(event, { sessionId: "remote" })).resolves.toBe("routed");
    await expect(handlers.get(previewChannel)!(event, { sessionId: "local" })).resolves.toBeNull();
    expect(calls).toEqual([`before ${previewChannel}`, `before ${previewChannel}`, "handler", "after"]);
  });

  it("wraps non-Error throws so Electron can serialize them", async () => {
    const { registrar, event } = setup();
    registrar.handle(contract.app.getBootstrapState, () => { throw "boom"; });

    await expect(handlers.get(contract.app.getBootstrapState.channel)!(event)).rejects.toThrow(new Error("boom"));
  });

  it("ignores send messages from untrusted senders", () => {
    const listener = vi.fn();
    const { registrar, event } = setup();
    registrar.on(contract.appearance.setNativeTheme, listener);
    const themeChannel = contract.appearance.setNativeTheme.channel;

    listeners.get(themeChannel)!({ sender: {}, senderFrame: {} }, "dark");
    expect(listener).not.toHaveBeenCalled();
    listeners.get(themeChannel)!(event, "dark");
    expect(listener).toHaveBeenCalledWith("dark", event);
  });

  it("removes every handler and listener on dispose", () => {
    const { registrar } = setup();
    registrar.handle(contract.app.getBootstrapState, () => ({}) as never);
    registrar.handle(contract.workspaces.readFile, () => ({}) as never);
    registrar.on(contract.appearance.setNativeTheme, () => undefined);
    expect(registrar.channels).toEqual([contract.app.getBootstrapState.channel, channel, contract.appearance.setNativeTheme.channel]);

    registrar.dispose();
    expect(handlers.size).toBe(0);
    expect(listeners.size).toBe(0);
    expect(registrar.channels).toEqual([]);
  });
});
