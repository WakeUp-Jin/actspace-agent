// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { HOST_PROTOCOL } from "@actspace/shared/host-protocol";
import { RemoteHostRegistry } from "../remote-hosts/registry";
vi.mock("electron", () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() } }));
// Transport trust has separate TLS/SSH tests; exercise real RPC/auth ordering here.
vi.mock("ws", async importOriginal => {
  const actual = await importOriginal<typeof import("ws")>();
  return { ...actual, WebSocket: class extends actual.WebSocket {
    constructor(url: string, options: import("ws").ClientOptions) { super(url.replace("wss://", "ws://"), options); }
  } };
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "registry-pair-"));
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" }); await once(server, "listening");
  const consumed: string[] = [];
  server.on("connection", socket => socket.on("message", bytes => {
    const { id, method, params } = JSON.parse(String(bytes));
    let result: unknown = {};
    if (method === "host.hello") result = { protocol: HOST_PROTOCOL, hostId: "host-one", epoch: "epoch" };
    if (method === "auth.pair") {
      if (consumed.includes(params.code)) { socket.send(JSON.stringify({ jsonrpc: "2.0", id, error: { message: "Code consumed" } })); return; }
      consumed.push(params.code); result = { hostId: "host-one", deviceId: `device-${consumed.length}`, token: `token-${consumed.length}` };
    }
    socket.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }));
  const registry = new RemoteHostRegistry(root);
  cleanups.push(async () => { await registry.dispose(); for (const socket of server.clients) socket.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  const port = (server.address() as { port: number }).port;
  const add = (code: string, alias = "127.0.0.1") => registry.add({ name: "Cloud", code, endpoint: { kind: "wss", url: `wss://${alias}:${port}/rpc` } });
  return { registry, consumed, add };
}
it("rejects duplicate identity before consuming its code, leaving it usable after removal", async () => {
  const f = await fixture(); const first = await f.add("first");
  await expect(f.add("second", "localhost")).rejects.toThrow("already connected");
  expect(f.consumed).toEqual(["first"]);
  expect(f.registry.list()).toEqual([first]);
  await f.registry.remove(first.id);
  await expect(f.add("second")).resolves.toMatchObject({ hostId: "host-one", state: "connected" });
  expect(f.consumed).toEqual(["first", "second"]);
});
it("serializes concurrent adds so only one pairing device is created", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.add("first"), f.add("second")]);
  expect(results.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  expect(f.consumed).toHaveLength(1); expect(f.registry.list()).toHaveLength(1);
});
