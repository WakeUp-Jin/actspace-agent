import { expect, it } from "vitest";
import { HostClient, type HostSocket } from "./client.js";
class Socket implements HostSocket {
  readyState = 1; sent: string[] = []; listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; this.emit("close", {}); }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) { const listeners = this.listeners.get(type) ?? new Set(); listeners.add(listener); this.listeners.set(type, listeners); }
  removeEventListener(type: string, listener: (event: { data?: unknown }) => void) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: { data?: unknown }) { this.listeners.get(type)?.forEach(listener => listener(event)); }
  reply(result: unknown) { this.emit("message", { data: JSON.stringify({ jsonrpc: "2.0", id: JSON.parse(this.sent.at(-1)!).id, result }) }); }
}
it("refuses a changed Host identity before transmitting credentials", async () => {
  const socket = new Socket(), client = new HostClient(socket);
  const authentication = client.authenticate({ expectedHostId: "known", token: "secret" });
  socket.reply({ protocol: "actspace-host/1", hostId: "other", epoch: "e" });
  await expect(authentication).rejects.toThrow("identity changed");
  expect(socket.sent.join("")).not.toContain("secret");
});
it("rejects unacknowledged mutations on disconnect without resubmission", async () => {
  const socket = new Socket(), client = new HostClient(socket);
  const pending = client.call("tasks.submit", { sessionId: "session", submissionId: "one", content: "hello" });
  socket.close(); await expect(pending).rejects.toThrow("acknowledgement may be unknown");
  await expect(client.call("tasks.submit", {})).rejects.toThrow("connection lost"); expect(socket.sent).toHaveLength(1);
});
it("reassembles paged replies while delivering notifications in wire order", async () => {
  class PagedSocket extends Socket {
    payloads = new Map<string, string>();
    override send(value: string) {
      super.send(value); const request = JSON.parse(value);
      if (request.method === "payloads.read") {
        const json = this.payloads.get(request.params.payloadId)!;
        queueMicrotask(() => this.emit("message", { data: JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { id: request.params.payloadId, part: request.params.part, parts: Math.ceil(json.length / 32768), text: json.slice(request.params.part * 32768, (request.params.part + 1) * 32768) } }) }));
      }
    }
    payload(id: string, value: unknown) {
      const json = JSON.stringify(value); this.payloads.set(id, json);
      this.emit("message", { data: JSON.stringify({ jsonrpc: "2.0", method: "host.payload", params: { id, parts: Math.ceil(json.length / 32768), characters: json.length } }) });
    }
  }
  const socket = new PagedSocket(), client = new HostClient(socket);
  const auth = client.authenticate({ token: "test" });
  socket.reply({ protocol: "actspace-host/1", hostId: "h", epoch: "e" });
  await Promise.resolve(); socket.reply({ hostId: "h", deviceId: "d" }); await auth;
  const received: number[] = []; client.subscribe(event => received.push(event.cursor));
  const pending = client.call("sessions.page", { sessionId: "s" });
  const requestId = JSON.parse(socket.sent.at(-1)!).id;
  const text = "中文🙂".repeat(200000);
  socket.payload("reply", { jsonrpc: "2.0", id: requestId, result: { text } });
  socket.payload("event", { jsonrpc: "2.0", method: "host.event", params: { epoch: "e", subscriptionId: "s", cursor: 1, value: { text } } });
  socket.emit("message", { data: JSON.stringify({ jsonrpc: "2.0", method: "host.event", params: { epoch: "e", subscriptionId: "s", cursor: 2, value: {} } }) });
  expect(await pending).toEqual({ text });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(received).toEqual([1, 2]); client.close();
});
