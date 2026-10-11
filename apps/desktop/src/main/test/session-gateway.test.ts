import { describe, expect, it, vi } from "vitest";
import { encodeSessionLocator, InvalidSessionLocatorError } from "@actspace/shared/session-locator";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS as C } from "@actspace/shared/runtime-v2";
import { createSessionGateway, type SessionGatewayRemote } from "../session-gateway";

// 15 T9：fixed-renderer-ipc 的本机 / 远端分流整体搬进 gateway。

const event = {} as never;

function remote(): SessionGatewayRemote & { [K in keyof SessionGatewayRemote]: ReturnType<typeof vi.fn> } {
  return {
    create: vi.fn(async () => "remote-create"),
    decide: vi.fn(async () => "remote-decide"),
    handle: vi.fn(async () => "remote-handle"),
    mergeList: vi.fn(async (_channel: string, _input: unknown, local: unknown) => ({ merged: local })),
  } as never;
}

describe("createSessionGateway", () => {
  it("keeps local history search scoped to the local SQLite index", async () => {
    const adapter = remote(), next = vi.fn(async () => "local-search");
    await expect(createSessionGateway(adapter)({ channel: C.listSessionPage, input: { search: "needle" }, event }, next)).resolves.toBe("local-search");
    expect(adapter.mergeList).not.toHaveBeenCalled();
  });
  it("creates a Session on the Host when the input names one", async () => {
    const adapter = remote(), next = vi.fn(async () => "local");
    const input = { hostId: "server", workspaceId: "w1" };
    await expect(createSessionGateway(adapter)({ channel: C.createSession, input, event }, next)).resolves.toBe("remote-create");
    expect(adapter.create).toHaveBeenCalledWith(input);
    expect(next).not.toHaveBeenCalled();
  });

  it("creates a local Session without a hostId and merges the result", async () => {
    const adapter = remote(), next = vi.fn(async () => "local");
    await expect(createSessionGateway(adapter)({ channel: C.createSession, input: { workspaceRoot: "/repo" }, event }, next)).resolves.toEqual({ merged: "local" });
    expect(adapter.create).not.toHaveBeenCalled();
  });

  it("routes a remote Session key to the Host with the decoded locator", async () => {
    const adapter = remote(), next = vi.fn(async () => "local");
    const sessionId = encodeSessionLocator({ hostId: "h:with:colons", sessionId: "s1" });
    await expect(createSessionGateway(adapter)({ channel: C.getSessionPage, input: { sessionId }, event }, next)).resolves.toBe("remote-handle");
    expect(adapter.handle).toHaveBeenCalledWith(C.getSessionPage, { sessionId }, { hostId: "h:with:colons", sessionId: "s1" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a corrupt remote key instead of treating it as local", async () => {
    const adapter = remote(), next = vi.fn(async () => "local");
    await expect(createSessionGateway(adapter)({ channel: C.getSessionPage, input: { sessionId: "host:%%%" }, event }, next)).rejects.toBeInstanceOf(InvalidSessionLocatorError);
    expect(next).not.toHaveBeenCalled();
    expect(adapter.handle).not.toHaveBeenCalled();
  });

  it("routes an approval by its hostId and keeps local approvals local", async () => {
    const adapter = remote(), next = vi.fn(async () => "local");
    const input = { requestId: "any-id", hostId: "server", decision: "once" };
    await expect(createSessionGateway(adapter)({ channel: C.submitApproval, input, event }, next)).resolves.toBe("remote-decide");
    expect(adapter.decide).toHaveBeenCalledWith(input);
    await expect(createSessionGateway(adapter)({ channel: C.submitApproval, input: { requestId: "local-1", decision: "once" }, event }, next)).resolves.toEqual({ merged: "local" });
    expect(adapter.decide).toHaveBeenCalledTimes(1);
  });

  it("runs local channels locally and then merges remote list entries", async () => {
    const adapter = remote(), next = vi.fn(async () => ["local"]);
    await expect(createSessionGateway(adapter)({ channel: C.listSessions, input: undefined, event }, next)).resolves.toEqual({ merged: ["local"] });
    expect(next).toHaveBeenCalledOnce();
    expect(adapter.mergeList).toHaveBeenCalledWith(C.listSessions, {}, ["local"]);
  });

  it("runs everything locally without a remote adapter", async () => {
    const next = vi.fn(async () => "local");
    const sessionId = encodeSessionLocator({ hostId: "server", sessionId: "s1" });
    await expect(createSessionGateway(undefined)({ channel: C.getSessionPage, input: { sessionId }, event }, next)).resolves.toBe("local");
  });
});
