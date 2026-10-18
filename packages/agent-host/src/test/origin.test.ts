import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { HostAuth } from "../auth.js";
import { HostGateway, isAllowedOrigin } from "../server.js";
const dispose: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of dispose.splice(0).reverse()) await fn(); });
async function gateway() {
  const root = await mkdtemp(join(tmpdir(), "host-origin-")); dispose.push(() => rm(root, { recursive: true, force: true }));
  const auth = new HostAuth(root); await auth.open();
  const server = new HostGateway({ auth, port: 0, allowedOrigins: ["https://app.example"], state: () => "ready", dispatch: async () => null });
  const port = await server.listen(); dispose.push(() => server.close()); return port;
}
const connect = (port: number, origin: string) => new Promise<boolean>(resolve => { const ws = new WebSocket(`ws://127.0.0.1:${port}/rpc`, { origin }); ws.once("open", () => { ws.close(); resolve(true); }); ws.once("error", () => resolve(false)); });
it("accepts loopback dev origins and listed origins, rejects others on a loopback gateway", async () => {
  const port = await gateway();
  expect(await connect(port, "http://localhost:5173")).toBe(true); expect(await connect(port, "http://127.0.0.1:8080")).toBe(true);
  expect(await connect(port, "https://app.example")).toBe(true);
  expect(await connect(port, "http://evil.example")).toBe(false); expect(await connect(port, "https://localhost:5173")).toBe(false);
});
it("isAllowedOrigin only allows loopback http origins without TLS", () => {
  const o = { allowedOrigins: ["https://app.example"] };
  expect(isAllowedOrigin("http://localhost:5173", { ...o, loopback: true })).toBe(true);
  expect(isAllowedOrigin("http://[::1]:3000", { ...o, loopback: true })).toBe(true);
  expect(isAllowedOrigin("http://localhost:5173", { ...o, loopback: false })).toBe(false);
  expect(isAllowedOrigin("https://app.example", { ...o, loopback: false })).toBe(true);
  expect(isAllowedOrigin("not a url", { ...o, loopback: true })).toBe(false);
  expect(isAllowedOrigin("http://localhost.evil.example", { ...o, loopback: true })).toBe(false);
});
