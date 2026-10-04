import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import WebSocket from "ws";
import { HostAuth } from "../auth.js";
import { HostGateway } from "../server.js";
import { HostUploads } from "../uploads.js";

it("revokes an unfinished upload without advancing it or affecting another device", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-upload-auth-"));
  const auth = new HostAuth(join(root, "auth")); await auth.open();
  const uploads = new HostUploads(join(root, "uploads"));
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const server = new HostGateway({ auth, port: 0, state: () => "ready", dispatch: async (method, params, context) => {
    if (method === "uploads.begin") return uploads.begin({ deviceId: context.deviceId, sessionId: "s", name: "input.txt", size: 6, sha256: hash("abcdef") });
    if (method === "uploads.write") return uploads.write(context.deviceId, "s", String(params.id), 0, Buffer.from("abc").toString("base64"), hash("abc"));
    if (method === "uploads.status") return uploads.status(context.deviceId, "s", String(params.id));
    return { ready: true };
  } });
  try {
    const port = await server.listen();
    const connect = async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/rpc`);
      await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
      let id = 0;
      const call = (method: string, params: unknown = {}) => new Promise<any>((resolve, reject) => {
        const current = ++id;
        const timer = setTimeout(() => { ws.off("message", listener); reject(new Error("RPC timed out")); }, 2000);
        const listener = (bytes: WebSocket.RawData) => { const value = JSON.parse(bytes.toString()); if (value.id === current) { clearTimeout(timer); ws.off("message", listener); resolve(value); } };
        ws.on("message", listener); ws.send(JSON.stringify({ jsonrpc: "2.0", id: current, method, params }));
      });
      await call("host.hello", { protocol: "actspace-host/1" });
      return { ws, call };
    };
    const first = await connect(), second = await connect();
    const device = (await first.call("auth.pair", { code: (await auth.createPairCode()).code, name: "first" })).result;
    await second.call("auth.pair", { code: (await auth.createPairCode()).code, name: "second" });
    const upload = (await first.call("uploads.begin")).result;
    expect((await first.call("uploads.write", { id: upload.id })).result.offset).toBe(3);
    const closed = new Promise<number>(resolve => first.ws.once("close", resolve));
    await auth.revoke(device.deviceId); expect(await closed).toBe(4003);
    const reconnect = await connect();
    expect((await reconnect.call("auth.resume", { token: device.token })).error.data.kind).toBe("REVOKED");
    expect((await reconnect.call("uploads.write", { id: upload.id })).error.data.kind).toBe("UNAUTHENTICATED");
    expect((await second.call("uploads.status", { id: upload.id })).error.data.kind).toBe("FORBIDDEN");
    expect((await second.call("host.describe")).result).toEqual({ ready: true });
    expect((await uploads.status(device.deviceId, "s", upload.id)).offset).toBe(3);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});
