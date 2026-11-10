import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { defaultPageRequest } from "../node-ports.js";
import { isNonPublicAddress, publicAddresses, requestPinned } from "../public-request.js";

const hostOf = (url: string) => new URL(url).hostname;
const unused = async () => { throw new Error("must not resolve"); };

describe("public address check", () => {
  it.each([
    "http://127.0.0.1/", "http://127.255.255.254/", "http://2130706433/", "http://0x7f.1/", "http://10.1.2.3/", "http://172.16.0.1/", "http://172.31.255.255/",
    "http://192.168.1.1/", "http://169.254.169.254/", "http://100.64.0.1/", "http://100.127.255.255/", "http://0.0.0.0/", "http://224.0.0.1/", "http://255.255.255.255/",
    "http://[::1]/", "http://[::]/", "http://[::127.0.0.1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[fe80::1]/", "http://[febf::1]/", "http://[fec0::1]/", "http://[feff::1]/", "http://[ff02::1]/",
    "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[::ffff:10.0.0.1]/", "http://[::ffff:a9fe:a9fe]/",
    "http://[64:ff9b::7f00:1]/", "http://[64:ff9b::a9fe:a9fe]/", "http://[2002:7f00:1::1]/", "http://[2002:c0a8:101::1]/",
  ])("refuses the literal in %s without resolving anything", async (url) => {
    await expect(publicAddresses(hostOf(url), unused)).rejects.toThrow("not allowed");
  });

  it.each([
    ["http://93.184.216.34/", "93.184.216.34"], ["http://172.32.0.1/", "172.32.0.1"], ["http://100.128.0.1/", "100.128.0.1"], ["http://198.18.0.1/", "198.18.0.1"],
    ["http://[2606:4700:4700::1111]/", "2606:4700:4700::1111"], ["http://[64:ff9b::5db8:d822]/", "64:ff9b::5db8:d822"], ["http://[2002:5db8:d822::1]/", "2002:5db8:d822::1"],
    ["http://[::ffff:93.184.216.34]/", "::ffff:5db8:d822"], ["http://[fe7f::1]/", "fe7f::1"],
  ])("accepts the public literal in %s and connects to it as written", async (url, address) => {
    await expect(publicAddresses(hostOf(url), unused)).resolves.toEqual([address]);
  });

  it("refuses local names before resolving them and any name with a non-public or unusable answer", async () => {
    for (const name of ["localhost", "LOCALHOST", "api.localhost", "printer.local"]) await expect(publicAddresses(name, unused)).rejects.toThrow("hosts are not allowed");
    const asked: string[] = [];
    const answer = (addresses: readonly string[]) => async (name: string) => { asked.push(name); return addresses; };
    await expect(publicAddresses("Example.COM", answer(["93.184.216.34", "2606:4700:4700::1111"]))).resolves.toEqual(["93.184.216.34", "2606:4700:4700::1111"]);
    expect(asked).toEqual(["example.com"]);
    for (const addresses of [[], ["93.184.216.34", "10.0.0.5"], ["::ffff:7f00:1"], ["fe80::1%eth0"], ["not-an-address"], ["localhost."]]) await expect(publicAddresses("example.com", answer(addresses))).rejects.toThrow("addresses are not allowed");
  });

  it("treats text that is not an address as non-public", () => {
    expect(["", "example.com", "[::1]", "1.2.3", "1.2.3.4.5"].map(isNonPublicAddress)).toEqual([true, true, true, true, true]);
    expect(["8.8.8.8", "2001:4860:4860::8888"].map(isNonPublicAddress)).toEqual([false, false]);
  });
});

describe("pinned page request", () => {
  let server: Server | undefined;
  afterEach(async () => { await new Promise((resolve) => server ? server.close(resolve) : resolve(undefined)); server = undefined; });
  async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<number> {
    server = createServer(handler);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    return (server.address() as AddressInfo).port;
  }
  const init = (signal = new AbortController().signal) => ({ signal, headers: { "User-Agent": "actspace-agent" } });

  it("connects to the address it was given and never resolves the name itself", async () => {
    const seen: Array<Record<string, string | undefined>> = [];
    const port = await serve((request, response) => { seen.push({ host: request.headers.host, url: request.url, agent: request.headers["user-agent"], encoding: request.headers["accept-encoding"], method: request.method }); response.setHeader("content-type", "text/plain"); response.end("pinned body"); });
    // .invalid never resolves (RFC 6761): a reply can only come from the address passed in.
    const response = await requestPinned(new URL(`http://pinned.invalid:${port}/page?q=1`), ["127.0.0.1"], init());
    expect([response.status, response.ok, response.headers.get("content-type"), await response.text()]).toEqual([200, true, "text/plain", "pinned body"]);
    expect(seen).toEqual([{ host: `pinned.invalid:${port}`, url: "/page?q=1", agent: "actspace-agent", encoding: "gzip, br", method: "GET" }]);
    await expect(requestPinned(new URL(`http://pinned.invalid:${port}/`), [], init())).rejects.toThrow("No checked address");
  });

  it("returns redirects and empty responses as they are, and decodes compressed bodies", async () => {
    const text = "compressed body ".repeat(2000);
    const port = await serve((request, response) => {
      if (request.url === "/moved") response.writeHead(302, { location: "http://127.0.0.1/private" }).end("moved");
      else if (request.url === "/empty") response.writeHead(204).end();
      else if (request.url === "/gzip") response.writeHead(200, { "content-encoding": "gzip" }).end(gzipSync(text));
      else if (request.url === "/br") response.writeHead(200, { "content-encoding": "br" }).end(brotliCompressSync(text));
      else if (request.url === "/broken") response.writeHead(200, { "content-encoding": "gzip" }).end("not gzip at all");
      else response.writeHead(200, { "content-encoding": "zstd" }).end("opaque");
    });
    const get = (path: string) => requestPinned(new URL(`http://pinned.invalid:${port}${path}`), ["127.0.0.1"], init());
    const moved = await get("/moved");
    expect([moved.status, moved.headers.get("location")]).toEqual([302, "http://127.0.0.1/private"]);
    await moved.body?.cancel();
    const empty = await get("/empty");
    expect([empty.status, empty.body]).toEqual([204, null]);
    expect(await (await get("/gzip")).text()).toBe(text);
    expect(await (await get("/br")).text()).toBe(text);
    await expect((await get("/broken")).text()).rejects.toThrow();
    await expect(get("/zstd")).rejects.toThrow('Unsupported content encoding "zstd"');
  });

  it("stops when the signal aborts, before and after the response starts", async () => {
    const port = await serve((request, response) => { if (request.url === "/slow-body") { response.writeHead(200); response.write("first"); } });
    const waiting = new AbortController();
    const pending = requestPinned(new URL(`http://pinned.invalid:${port}/never`), ["127.0.0.1"], init(waiting.signal));
    waiting.abort(new Error("stopped while waiting"));
    await expect(pending).rejects.toThrow("stopped while waiting");
    const reading = new AbortController();
    const response = await requestPinned(new URL(`http://pinned.invalid:${port}/slow-body`), ["127.0.0.1"], init(reading.signal));
    const body = response.text();
    reading.abort();
    await expect(body).rejects.toThrow();
    server?.closeAllConnections();
  });
});

describe("default page request", () => {
  it("pins connections unless the process is told to use a proxy from the environment", async () => {
    const calls: unknown[] = [];
    const fetchImpl = (async (...args: unknown[]) => { calls.push(args); return new Response("via proxy"); }) as typeof fetch;
    expect(defaultPageRequest({}, fetchImpl)).toBe(requestPinned);
    expect(defaultPageRequest({ NODE_USE_ENV_PROXY: "0", HTTPS_PROXY: "http://127.0.0.1:1" }, fetchImpl)).toBe(requestPinned);
    const signal = new AbortController().signal, url = new URL("https://example.com/");
    const proxied = await defaultPageRequest({ NODE_USE_ENV_PROXY: "1" }, fetchImpl)(url, ["93.184.216.34"], { signal, headers: { Accept: "text/html" } });
    expect(await proxied.text()).toBe("via proxy");
    expect(calls).toEqual([[url, { signal, headers: { Accept: "text/html" }, redirect: "manual" }]]);
  });
});
