import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SocketBrowserBridgeTransport } from "../node-capability.js";

describe("Browser socket lifetime", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => { await Promise.all(cleanups.splice(0).map((cleanup) => cleanup())); });
  async function fixture(onRequest: (request: { id: string; method: string; params: Record<string, unknown> }, reply: (body?: unknown, protocol?: string) => void) => void) {
    const root = await mkdtemp("/tmp/browser-wire-");
    const socketPath = join(root, "bridge.sock");
    const clients = new Set<Socket>();
    const server = createServer((client) => {
      clients.add(client);
      client.on("close", () => clients.delete(client));
      let buffer = Buffer.alloc(0);
      client.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE(0)) {
          const size = buffer.readUInt32LE(0);
          const request = JSON.parse(buffer.subarray(4, 4 + size).toString());
          buffer = buffer.subarray(4 + size);
          onRequest(request, (result = {}, protocol = "0.2.0") => {
            const body = Buffer.from(JSON.stringify({ id: request.id, ok: true, protocolVersion: protocol, result }));
            const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
            client.write(Buffer.concat([header, body]));
          });
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    cleanups.push(async () => {
      for (const client of clients) client.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    });
    return new SocketBrowserBridgeTransport({ socketPath, sessionId: "session", turnId: "turn", timeoutMs: 300 });
  }

  it("starts one Session before parallel requests and sends cancellation for the original request ID", async () => {
    const requests: Array<{ id: string; method: string; params: Record<string, unknown> }> = [];
    let dispatched!: () => void;
    const commandSeen = new Promise<void>((resolve) => { dispatched = resolve; });
    let cancelled!: () => void;
    const cancelSeen = new Promise<void>((resolve) => { cancelled = resolve; });
    const transport = await fixture((request, reply) => {
      requests.push(request);
      if (request.method.endsWith("session.start")) { setTimeout(() => reply(), 20); return; }
      if (request.method.endsWith("command.execute")) { dispatched(); return; }
      if (request.method.endsWith("command.cancel")) cancelled();
      reply();
    });
    const controller = new AbortController();
    const pending = transport.request("agent_browser_bridge.command.execute", {}, controller.signal);
    const rejection = expect(pending).rejects.toThrow(/abort/i);
    await Promise.all([commandSeen, transport.request("agent_browser_bridge.command.list", {})]);
    expect(requests.filter((request) => request.method.endsWith("session.start"))).toHaveLength(1);
    expect(requests[0]?.method).toBe("agent_browser_bridge.session.start");
    controller.abort();
    await rejection;
    await cancelSeen;
    expect(requests.find((request) => request.method.endsWith("command.cancel"))?.params.id).toBe(requests.find((request) => request.method.endsWith("command.execute"))?.id);
    await transport.dispose();
    await expect(transport.request("agent_browser_bridge.command.list", {})).rejects.toThrow("disposed");
  });

  it("rejects incompatible startup responses without sending the requested action", async () => {
    const methods: string[] = [];
    const transport = await fixture((request, reply) => { methods.push(request.method); reply({}, "0.1.0"); });
    await expect(transport.request("agent_browser_bridge.command.execute", {})).rejects.toThrow("incompatible");
    expect(methods).toEqual(["agent_browser_bridge.session.start"]);
    await transport.dispose();
  });

  it("cannot finish startup or dispatch after disposal while connecting", async () => {
    const methods: string[] = [];
    const transport = await fixture((request, reply) => { methods.push(request.method); reply(); });
    const pending = transport.request("agent_browser_bridge.command.execute", {});
    const rejection = expect(pending).rejects.toThrow(/closed|disposed/);
    await transport.dispose();
    await rejection;
    expect(methods).toEqual([]);
  });
});
