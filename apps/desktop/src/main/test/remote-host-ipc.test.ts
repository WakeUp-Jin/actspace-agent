import { afterEach, expect, it, vi } from "vitest";
import { HOST_IPC } from "@actspace/shared/host-protocol";
import { registerRemoteHostIpc } from "../remote-hosts/ipc";
import { trustedWindow } from "./ipc-sender-fixture";

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock("electron", () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler), removeHandler: (channel: string) => handlers.delete(channel) } }));
afterEach(() => handlers.clear());

it("applies the shared Host guards before forwarding to the registry", async () => {
  const { window, event } = trustedWindow();
  const registry = { list: vi.fn(() => []), add: vi.fn(), remove: vi.fn(), reconnect: vi.fn(), call: vi.fn(async () => ({ ok: true })), subscribe: vi.fn(() => () => undefined), subscribeEvents: vi.fn(() => () => undefined) };
  const activate = vi.fn(async () => undefined);
  const dispose = registerRemoteHostIpc(registry as never, () => window as never, activate);

  await expect(handlers.get(HOST_IPC.call)!(event, { hostId: "h", method: "auth.pair", params: {} })).rejects.toThrow(`Invalid Host operation (${HOST_IPC.call})`);
  await expect(handlers.get(HOST_IPC.add)!(event, { name: "box", code: "1" })).rejects.toThrow("Invalid Host connection");
  await expect(handlers.get(HOST_IPC.activate)!(event, 1)).rejects.toThrow("Invalid Session identity");
  expect(registry.call).not.toHaveBeenCalled();
  expect(registry.add).not.toHaveBeenCalled();

  await expect(handlers.get(HOST_IPC.call)!(event, { hostId: "h", method: "host.describe", params: {} })).resolves.toEqual({ ok: true });
  expect(registry.call).toHaveBeenCalledWith("h", "host.describe", {});
  await handlers.get(HOST_IPC.activate)!(event, null);
  expect(activate).toHaveBeenCalledWith(null);
  await expect(handlers.get(HOST_IPC.list)!({ sender: {}, senderFrame: {} })).rejects.toThrow("Untrusted Host IPC sender");

  dispose();
  expect(handlers.size).toBe(0);
});
