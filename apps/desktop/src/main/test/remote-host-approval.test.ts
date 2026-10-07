import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS as C } from "@actspace/shared/runtime-v2";
import { encodeSessionLocator } from "@actspace/shared/session-locator";
import { RemoteDesktopAdapter } from "../remote-hosts/desktop-adapter";
import { createSessionGateway } from "../session-gateway";

// 15 T10：远端审批带 hostId，按 hostId 路由；id 格式不变，已有的待审批项照常可用。

vi.mock("electron", () => ({}));

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const request = (hostId: string) => ({
  requestId: "r1", sessionId: "s1", agentRunId: "run", callId: "call", toolName: "bash", resources: ["ls"], reasons: ["needs approval"],
  requestedAt: "2026-10-06T00:00:00Z", expiresAt: "2026-10-06T01:00:00Z", grantSuggestions: [], supportedLifetimes: [], hostId,
});

async function adapterWith(hostIds: string[], window?: unknown) {
  const root = await mkdtemp(join(tmpdir(), "remote-approval-"));
  roots.push(root);
  const call = vi.fn(async (hostId: string, method: string, _params: Record<string, unknown>) => method === "approvals.list" ? [request(hostId)] : { ok: true });
  const hosts = {
    list: () => hostIds.map((hostId) => ({ id: hostId, hostId, name: hostId, state: "connected", endpoint: { kind: "wss", url: `wss://${hostId}` } })),
    call, subscribe: () => () => undefined, subscribeEvents: (listener: (hostId: string, envelope: unknown) => void) => { emitHostEvent = listener; return () => undefined; },
  };
  let emitHostEvent: (hostId: string, envelope: unknown) => void = () => undefined;
  const adapter = new RemoteDesktopAdapter(hosts as never, () => window as never, root);
  return { adapter, call, emit: (hostId: string, envelope: unknown) => emitHostEvent(hostId, envelope) };
}

it("lists pending remote approvals with their Host, including a hostId that contains ':'", async () => {
  const { adapter } = await adapterWith(["plain", "h:with:colons"]);
  const pending = await adapter.mergeList(C.listPendingApprovals, {}, []) as { requestId: string; hostId?: string }[];
  expect(pending.map((item) => item.hostId)).toEqual(["plain", "h:with:colons"]);
  expect(pending[1]!.requestId).toBe("remote-approval:h:with:colons:r1");
  adapter.dispose();
});

it("routes an approval decision by hostId, even when the hostId contains ':'", async () => {
  const hostId = "h:with:colons";
  const { adapter, call } = await adapterWith([hostId]);
  const sessionId = encodeSessionLocator({ hostId, sessionId: "s1" });
  const [pending] = await adapter.handle(C.listPendingApprovals, { sessionId }, { hostId, sessionId: "s1" }) as { requestId: string; hostId?: string }[];
  expect(pending!.hostId).toBe(hostId);
  const gateway = createSessionGateway(adapter);
  const next = vi.fn(async () => ({ ok: false }));
  await expect(gateway({ channel: C.submitApproval, input: { requestId: pending!.requestId, hostId, decision: "once" }, event: {} as never }, next)).resolves.toEqual({ ok: true });
  expect(next).not.toHaveBeenCalled();
  expect(call).toHaveBeenCalledWith(hostId, "approvals.decide", expect.objectContaining({ requestId: "r1", kind: "once", sessionId: "s1" }));
  adapter.dispose();
});

it("refuses an approval decision sent to the wrong Host", async () => {
  const { adapter, call } = await adapterWith(["a", "b"]);
  const [pending] = await adapter.handle(C.listPendingApprovals, {}, { hostId: "a", sessionId: "s1" }) as { requestId: string }[];
  await expect(adapter.decide({ requestId: pending!.requestId, hostId: "b", decision: "once" })).rejects.toThrow("another Host");
  expect(call).not.toHaveBeenCalledWith(expect.anything(), "approvals.decide", expect.anything());
  adapter.dispose();
});

it("puts the Host on approval stream events", async () => {
  const sent: { channel: string; value: Record<string, unknown> }[] = [];
  const window = { isDestroyed: () => false, webContents: { send: (channel: string, value: Record<string, unknown>) => sent.push({ channel, value }) } };
  const { adapter, emit } = await adapterWith(["h:x"], window);
  emit("h:x", { epoch: "e", subscriptionId: "sub", cursor: 1, value: { kind: "approvals", requests: [request("h:x")] } });
  emit("h:x", { epoch: "e", subscriptionId: "sub", cursor: 2, value: { kind: "approvals", requests: [], settled: { request: request("h:x"), decision: { kind: "once" } } } });
  const events = sent.filter((item) => item.channel === C.agentStream).map((item) => item.value);
  expect(events.find((event) => event.type === "tool_approval_required")).toMatchObject({ hostId: "h:x", requestId: "remote-approval:h:x:r1" });
  expect(events.find((event) => event.type === "tool_approval_resolved")).toMatchObject({ hostId: "h:x", requestId: "remote-approval:h:x:r1" });
  adapter.dispose();
});
