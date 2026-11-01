import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { HostAuth } from "../auth.js";
import { HostGateway, type HostRequestContext } from "../server.js";
const dispose: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of dispose.splice(0).reverse()) await fn(); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "host-gateway-")); dispose.push(() => rm(root, { recursive: true, force: true }));
  const auth = new HostAuth(root); await auth.open(); let mutations = 0;
  const server = new HostGateway({ auth, port: 0, state: () => "ready", dispatch: async (_method, params) => { mutations++; return params.large ? { text: "中文🙂".repeat(200000) } : { accepted: true }; } });
  const port = await server.listen(); dispose.push(() => server.close());
  const ws = new WebSocket(`ws://127.0.0.1:${port}/rpc`); await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  let id = 0;
  const call = (method: string, params: unknown = {}) => new Promise<any>((resolve) => { const current = ++id; const listener = (data: WebSocket.RawData) => { const reply = JSON.parse(data.toString()); if (reply.id === current) { ws.off("message", listener); resolve(reply); } }; ws.on("message", listener); ws.send(JSON.stringify({ jsonrpc: "2.0", id: current, method, params })); });
  return { auth, ws, call, mutations: () => mutations };
}
it("rejects anonymous operations, pairs, dispatches, and closes a revoked connection", async () => {
  const f = await fixture();
  expect((await f.call("tasks.submit")).error.data.kind).toBe("UNAUTHENTICATED"); expect(f.mutations()).toBe(0);
  expect((await f.call("host.hello", { protocol: "wrong" })).error.data.kind).toBe("INCOMPATIBLE_PROTOCOL");
  await f.call("host.hello", { protocol: "actspace-host/1" });
  const paired = (await f.call("auth.pair", { code: (await f.auth.createPairCode()).code, name: "test" })).result;
  expect((await f.call("tasks.submit")).result).toEqual({ accepted: true }); expect(f.mutations()).toBe(1);
  const closed = new Promise(resolve => f.ws.once("close", resolve));
  await f.auth.revoke(paired.deviceId); await closed;
});
it("does not run mutation notifications or cancel accepted operations on socket close", async () => {
  const f = await fixture(); await f.call("host.hello", { protocol: "actspace-host/1" }); await f.call("auth.pair", { code: (await f.auth.createPairCode()).code, name: "test" });
  f.ws.send(JSON.stringify({ jsonrpc: "2.0", method: "tasks.submit", params: {} }));
  await f.call("host.hello", { protocol: "actspace-host/1" }); expect(f.mutations()).toBe(0);
  await f.call("tasks.submit"); f.ws.close(); expect(f.mutations()).toBe(1);
});

it("serves oversized replies as authenticated connection-owned pages", async () => {
  const f = await fixture(); await f.call("host.hello", { protocol: "actspace-host/1" });
  await f.call("auth.pair", { code: (await f.auth.createPairCode()).code, name: "test" });
  const notice = new Promise<any>(resolve => f.ws.once("message", bytes => resolve(JSON.parse(bytes.toString()))));
  f.ws.send(JSON.stringify({ jsonrpc: "2.0", id: 999, method: "sessions.page", params: { large: true } }));
  const envelope = await notice; expect(envelope.method).toBe("host.payload");
  let json = "";
  for (let part = 0; part < envelope.params.parts; part++) {
    const page = await f.call("payloads.read", { payloadId: envelope.params.id, part });
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(1024 * 1024);
    json += page.result.text;
  }
  expect(JSON.parse(json)).toEqual({ jsonrpc: "2.0", id: 999, result: { text: "中文🙂".repeat(200000) } });
  expect((await f.call("payloads.read", { payloadId: envelope.params.id, part: 0 })).error.data.kind).toBe("NOT_FOUND");
});

it("disconnects a stalled subscriber without blocking another device", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-slow-device-"));
  dispose.push(() => rm(root, { recursive: true, force: true }));
  const auth = new HostAuth(root); await auth.open();
  const contexts = new Map<string, HostRequestContext>();
  const server = new HostGateway({ auth, port: 0, state: () => "ready", dispatch: async (_method, _params, context) => {
    contexts.set(context.deviceId, context); return { accepted: true };
  } });
  const port = await server.listen(); dispose.push(() => server.close());
  const connect = async (name: string) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/rpc`);
    await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    let id = 0;
    const call = (method: string, params: unknown = {}) => new Promise<any>((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => { ws.off("message", listener); reject(new Error("RPC timed out")); }, 3000);
      const listener = (data: WebSocket.RawData) => { const reply = JSON.parse(data.toString()); if (reply.id === current) {
        clearTimeout(timer); ws.off("message", listener); resolve(reply);
      } };
      ws.on("message", listener); ws.send(JSON.stringify({ jsonrpc: "2.0", id: current, method, params }));
    });
    await call("host.hello", { protocol: "actspace-host/1" });
    const paired = await call("auth.pair", { code: (await auth.createPairCode()).code, name });
    await call("sessions.observe");
    return { ws, call, deviceId: paired.result.deviceId as string };
  };
  const slow = await connect("slow"), fast = await connect("fast");
  const closed = new Promise<number>(resolve => slow.ws.once("close", resolve));
  slow.ws.pause();
  const chunk = "x".repeat(512 * 1024);
  for (let index = 0; index < 80; index++) contexts.get(slow.deviceId)!.notify("sessions.changed", { index, chunk });
  expect((await fast.call("tasks.submit")).result).toEqual({ accepted: true });
  expect(fast.ws.readyState).toBe(WebSocket.OPEN);
  slow.ws.resume();
  expect(await closed).toBe(4008);
  expect((await fast.call("sessions.page")).result).toEqual({ accepted: true });
}, 10000);
