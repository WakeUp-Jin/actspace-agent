import { HOST_PROTOCOL, HostError, isRecord, type HostHello, type HostMethod, type HostEvent, type HostErrorKind } from "@actspace/shared/host-protocol";
/** Minimal browser-compatible WebSocket port; Node transport is injected by the Host shell. */
export interface HostSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: { data?: unknown; code?: number }) => void): void;
  removeEventListener(type: string, listener: (event: { data?: unknown; code?: number }) => void): void;
}
type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
export class HostDisconnectedError extends Error {
  constructor() { super("Host connection lost; mutation acknowledgement may be unknown"); this.name = "HostDisconnectedError"; }
}
/** No automatic mutation retry and no offline submission queue. */
export class HostClient {
  readonly #pending = new Map<number, Pending>();
  readonly #listeners = new Set<(event: HostEvent) => void>();
  #nextId = 1;
  #closed = false;
  #hello: HostHello | undefined;
  #incoming: Promise<void> = Promise.resolve();
  constructor(private readonly socket: HostSocket, private readonly timeoutMs = 30_000) {
    socket.addEventListener("message", this.#message);
    socket.addEventListener("close", this.#disconnect);
    socket.addEventListener("error", this.#disconnect);
  }
  get hello(): HostHello | undefined { return this.#hello; }
  async authenticate(input: { expectedHostId?: string; token: string } | { expectedHostId?: string; code: string; name: string }): Promise<{ hostId: string; deviceId: string; token?: string }> {
    const hello = await this.call("host.hello", { protocol: HOST_PROTOCOL });
    if (!isRecord(hello) || hello.protocol !== HOST_PROTOCOL || typeof hello.hostId !== "string" || typeof hello.epoch !== "string") { this.close(); throw new HostError("INCOMPATIBLE_PROTOCOL", "Invalid Host handshake"); }
    if (input.expectedHostId && input.expectedHostId !== hello.hostId) { this.close(); throw new HostError("FORBIDDEN", "Host identity changed; pair explicitly with the new Host"); }
    this.#hello = hello as unknown as HostHello;
    const result = await this.call("token" in input ? "auth.resume" : "auth.pair", "token" in input ? { token: input.token } : { code: input.code, name: input.name });
    if (!isRecord(result) || result.hostId !== hello.hostId || typeof result.deviceId !== "string" || (!("token" in input) && typeof result.token !== "string")) { this.close(); throw new HostError("INCOMPATIBLE_PROTOCOL", "Invalid authentication response"); }
    return { hostId: result.hostId, deviceId: result.deviceId, ...(typeof result.token === "string" ? { token: result.token } : {}) };
  }
  call(method: HostMethod, params: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
    if (this.#closed || this.socket.readyState !== 1) return Promise.reject(new HostDisconnectedError());
    if (this.#pending.size >= 32) return Promise.reject(new HostError("LIMIT_EXCEEDED", "Too many pending requests", true));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(new Error("Host request timed out; mutation acknowledgement may be unknown")); }, this.timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params })); }
      catch (error) { this.#pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }
  subscribe(listener: (event: HostEvent) => void): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  #message = (event: { data?: unknown }) => {
    let value: unknown;
    try { value = JSON.parse(String(event.data)); } catch { this.close(); return; }
    for (const item of Array.isArray(value) ? value : [value]) {
      if (!isRecord(item) || item.jsonrpc !== "2.0") { this.close(); return; }
      if (item.method === "host.payload" || item.method === "host.event") {
        // Page replies remain immediately dispatchable while notifications preserve wire order.
        this.#incoming = this.#incoming.then(async () => {
          if (this.#closed) return;
          if (item.method === "host.payload") {
            const restored = await this.#readPayload(item.params);
            for (const part of Array.isArray(restored) ? restored : [restored]) this.#accept(part);
          } else this.#accept(item);
        }).catch(() => { this.close(); });
      } else this.#accept(item);
    }
  };
  async #readPayload(ref: unknown): Promise<unknown> {
    if (!isRecord(ref) || typeof ref.id !== "string" || ref.id.length > 128 || !Number.isSafeInteger(ref.parts) || !Number.isSafeInteger(ref.characters)
      || Number(ref.parts) < 1 || Number(ref.parts) > 256 || Number(ref.characters) < 1 || Number(ref.characters) > 8 * 1024 * 1024) throw new Error("Invalid paged Host response");
    const parts: string[] = [];
    for (let offset = 0; offset < Number(ref.parts); offset += 4) {
      const batch = await Promise.all(Array.from({ length: Math.min(4, Number(ref.parts) - offset) }, async (_, index) => {
        const part = offset + index;
        const value = await this.call("payloads.read", { payloadId: ref.id, part });
        if (!isRecord(value) || value.id !== ref.id || value.part !== part || value.parts !== ref.parts || typeof value.text !== "string" || value.text.length > 32768) throw new Error("Invalid Host response page");
        return value.text;
      }));
      parts.push(...batch);
    }
    const json = parts.join("");
    if (json.length !== ref.characters) throw new Error("Incomplete Host response");
    return JSON.parse(json);
  }
  #accept(item: unknown): void {
    if (!isRecord(item) || item.jsonrpc !== "2.0" || item.method === "host.payload") { this.close(); return; }
    if (item.method === "host.event" && isRecord(item.params)) {
      const notification = item.params;
      if (notification.epoch !== this.#hello?.epoch || typeof notification.subscriptionId !== "string" || !Number.isSafeInteger(notification.cursor)) return;
      for (const listener of this.#listeners) { try { listener(notification as unknown as HostEvent); } catch { /* observer */ } }
      return;
    }
    if (typeof item.id !== "number") return;
    const pending = this.#pending.get(item.id); if (!pending) return;
    this.#pending.delete(item.id); clearTimeout(pending.timer);
    if (isRecord(item.error)) {
      const message = typeof item.error.message === "string" ? item.error.message : "Host request failed";
      const data = item.error.data;
      pending.reject(isRecord(data) && typeof data.kind === "string" ? new HostError(data.kind as HostErrorKind, message, data.retryable === true) : new Error(message));
    } else if ("result" in item) pending.resolve(item.result);
    else pending.reject(new Error("Invalid Host response"));
  }
  #disconnect = () => {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(new HostDisconnectedError()); }
    this.#pending.clear(); this.#listeners.clear();
    this.socket.removeEventListener("message", this.#message); this.socket.removeEventListener("close", this.#disconnect); this.socket.removeEventListener("error", this.#disconnect);
  };
  close(): void { this.#disconnect(); this.socket.close(1000, "Client closed"); }
}
