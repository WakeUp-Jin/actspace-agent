import type { HostSocket } from "@actspace/client/host";

type Listener = (event: { data?: unknown; code?: number }) => void;
type Request = { id: number; method: string; params: Record<string, unknown> };
export type Handler = (request: Request, socket: FakeSocket) => unknown | Promise<unknown>;
export class RpcFailure { constructor(readonly kind: string, readonly message = kind) {} }

/** 浏览器 WebSocket 的替身：请求交给 handler，返回值作为 result，抛 RpcFailure 作为 HostError。 */
export class FakeSocket implements HostSocket {
  readyState = 0;
  readonly sent: Request[] = [];
  readonly #listeners = new Map<string, Set<Listener>>();
  constructor(readonly url: string, private readonly handler: Handler) {}
  addEventListener(type: string, listener: Listener) { (this.#listeners.get(type) ?? this.#listeners.set(type, new Set()).get(type)!).add(listener); }
  removeEventListener(type: string, listener: Listener) { this.#listeners.get(type)?.delete(listener); }
  emit(type: string, event: { data?: unknown; code?: number } = {}) { for (const listener of [...(this.#listeners.get(type) ?? [])]) listener(event); }
  open() { this.readyState = 1; this.emit("open"); }
  send(data: string) {
    const request = JSON.parse(data) as Request;
    this.sent.push(request);
    void Promise.resolve().then(() => this.handler(request, this)).then(
      result => this.message({ jsonrpc: "2.0", id: request.id, result: result ?? null }),
      error => this.message({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: error instanceof RpcFailure ? error.message : String(error), data: error instanceof RpcFailure ? { kind: error.kind } : undefined } }),
    );
  }
  message(value: unknown) { if (this.readyState === 1) this.emit("message", { data: JSON.stringify(value) }); }
  event(subscriptionId: string, value: unknown, epoch = "e1", cursor = 1) { this.message({ jsonrpc: "2.0", method: "host.event", params: { subscriptionId, epoch, cursor, value } }); }
  close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; this.emit("close", { code }); }
}

export type FakeHostOptions = { hostId?: string; epoch?: string; state?: string; pairCode?: string; resumeError?: string; refuse?: boolean; extra?: Handler };

export function fakeHostHandler(options: FakeHostOptions = {}): Handler {
  return (request, socket) => {
    const extra = options.extra?.(request, socket);
    if (extra !== undefined) return extra;
    switch (request.method) {
      case "host.hello": return { protocol: "actspace-host/1", hostId: options.hostId ?? "h1", epoch: options.epoch ?? "e1", state: options.state ?? "ready", limits: {} };
      case "auth.pair": if (request.params.code !== (options.pairCode ?? "GOOD")) throw new RpcFailure("UNAUTHENTICATED", "Pairing code is invalid or expired"); return { hostId: options.hostId ?? "h1", deviceId: "d1", token: "t1" };
      case "auth.resume": if (options.resumeError) throw new RpcFailure(options.resumeError); return { hostId: options.hostId ?? "h1", deviceId: "d1" };
      case "host.describe": return { state: options.state ?? "ready", workspaces: [{ id: "main", name: "Main", path: "/work/main" }], models: [{ id: "mock/mock", provider: "mock", name: "mock" }], defaultModel: "mock/mock", capabilities: {} };
      case "host.observe": return { subscriptionId: "sub-host", snapshot: { approvals: [], state: options.state ?? "ready", running: [] } };
      default: return null;
    }
  };
}

/** createSocket 工厂：记录每个 socket，默认在下一个微任务打开。 */
export function fakeSockets(handler: () => Handler, behaviour: { refuse?: () => boolean } = {}) {
  const sockets: FakeSocket[] = [];
  const create = (url: string) => {
    const socket = new FakeSocket(url, handler());
    sockets.push(socket);
    void Promise.resolve().then(() => (behaviour.refuse?.() ? socket.close(1006) : socket.open()));
    return socket;
  };
  return { sockets, create, last: () => sockets[sockets.length - 1]! };
}
