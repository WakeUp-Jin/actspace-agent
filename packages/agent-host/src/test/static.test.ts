import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { HostAuth } from "../auth.js";
import { HostGateway } from "../server.js";
import { pageSecurityHeaders } from "../static.js";
const dispose: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of dispose.splice(0).reverse()) await fn(); });
async function fixture(withWebRoot = true) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "host-static-"))); dispose.push(() => rm(base, { recursive: true, force: true }));
  const webRoot = join(base, "web"); await mkdir(join(webRoot, "assets"), { recursive: true });
  await writeFile(join(webRoot, "index.html"), "<html>app</html>"); await writeFile(join(webRoot, "assets", "app-1234.js"), "console.log(1)");
  await writeFile(join(webRoot, "sw.js"), "//sw"); await writeFile(join(webRoot, "manifest.webmanifest"), "{}");
  await writeFile(join(base, "secret.txt"), "secret"); await symlink(join(base, "secret.txt"), join(webRoot, "leak.txt"));
  const auth = new HostAuth(join(base, "auth")); await auth.open();
  const gateway = new HostGateway({ auth, port: 0, ...(withWebRoot ? { webRoot } : {}), state: () => "ready", dispatch: async () => null });
  const port = await gateway.listen(); dispose.push(() => gateway.close());
  return { port, url: `http://127.0.0.1:${port}` };
}
const raw = (port: number, path: string) => new Promise<{ status: number }>((resolve, reject) => { request({ host: "127.0.0.1", port, path, method: "GET" }, res => { res.resume(); res.on("end", () => resolve({ status: res.statusCode! })); }).on("error", reject).end(); });
it("serves index.html with security headers and no-cache", async () => {
  const f = await fixture(), res = await fetch(`${f.url}/`);
  expect(res.status).toBe(200); expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8"); expect(res.headers.get("cache-control")).toBe("no-cache");
  expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'"); expect(res.headers.get("x-content-type-options")).toBe("nosniff"); expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  expect(await res.text()).toBe("<html>app</html>");
  expect((await fetch(`${f.url}/sw.js`)).headers.get("cache-control")).toBe("no-cache");
  expect((await fetch(`${f.url}/manifest.webmanifest`)).headers.get("content-type")).toBe("application/manifest+json");
});
it("serves hashed assets as immutable", async () => {
  const f = await fixture(), res = await fetch(`${f.url}/assets/app-1234.js`);
  expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable"); expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
});
it("falls back to index.html for extensionless paths and 404s for missing files", async () => {
  const f = await fixture();
  expect(await (await fetch(`${f.url}/sessions/abc`)).text()).toBe("<html>app</html>");
  const missing = await fetch(`${f.url}/missing.js`); expect(missing.status).toBe(404); expect(missing.headers.get("content-security-policy")).toBeTruthy();
  expect((await fetch(`${f.url}/assets`)).status).toBe(404);
  expect((await fetch(`${f.url}/assets/`)).status).toBe(404);
});
it("rejects traversal and symlink escapes", async () => {
  const f = await fixture();
  expect((await raw(f.port, "/../package.json")).status).toBe(404); expect((await raw(f.port, "/%2e%2e/package.json")).status).toBe(404);
  expect((await raw(f.port, "/%2e%2e/secret.txt")).status).toBe(404); expect((await fetch(`${f.url}/leak.txt`)).status).toBe(404);
  expect((await raw(f.port, "/%00")).status).toBe(400); expect((await raw(f.port, "/%E0%A4%A")).status).toBe(400);
});
it("restricts methods and omits HEAD bodies", async () => {
  const f = await fixture(), post = await fetch(`${f.url}/`, { method: "POST" });
  expect(post.status).toBe(405); expect(post.headers.get("allow")).toBe("GET, HEAD");
  const head = await fetch(`${f.url}/`, { method: "HEAD" }); expect(head.status).toBe(200); expect(head.headers.get("content-length")).toBe("16"); expect(await head.text()).toBe("");
});
it("keeps 404 without webRoot and keeps /rpc working with it", async () => {
  expect((await fetch(`${(await fixture(false)).url}/`)).status).toBe(404);
  const f = await fixture();
  const ws = new WebSocket(`ws://127.0.0.1:${f.port}/rpc`); await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); }); ws.close();
});
it("lists the page host for WebSocket in CSP and ignores malformed hosts", () => {
  const csp = (headers: Record<string, string>) => pageSecurityHeaders({ headers } as never)["Content-Security-Policy"];
  expect(csp({ host: "127.0.0.1:4317" })).toContain("connect-src 'self' wss://127.0.0.1:4317 ws://127.0.0.1:4317;");
  expect(csp({ host: "127.0.0.1:4317", "x-forwarded-host": "mac.tail1.ts.net" })).toContain("wss://mac.tail1.ts.net ");
  expect(csp({ host: "[::1]:4317" })).toContain("wss://[::1]:4317 ");
  expect(csp({ host: "evil.com; script-src *" })).toContain("connect-src 'self'; ");
});
