import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { HOST_PROTOCOL, HOST_LIMITS, HostError, isRecord, parseHostRequest, stringParam, integerParam, type HostMethod, type HostHello } from "@actspace/shared/host-protocol";
import { HostPayloads } from "./payloads.js";
import type { HostAuth } from "./auth.js";
import { createStaticHandler } from "./static.js";
export interface HostRequestContext {
  readonly deviceId: string;
  readonly connectionId: string;
  /** Notifications are authenticated again at send time. */
  notify(method: string, params: unknown): void;
  onClose(cleanup: () => void): void;
  close?(): void;
  afterReply(operation: () => void): void;
}
export interface HostGatewayOptions {
  readonly auth: HostAuth;
  readonly address?: string;
  readonly port?: number;
  readonly tls?: { key: string; cert: string };
  readonly allowedOrigins?: readonly string[];
  readonly webRoot?: string;
  readonly state: () => HostHello["state"];
  readonly dispatch: (method: HostMethod, params: Readonly<Record<string, unknown>>, context: HostRequestContext) => Promise<unknown>;
}
export function isAllowedOrigin(origin: string, options: { allowedOrigins?: readonly string[]; loopback: boolean }): boolean {
  if (options.allowedOrigins?.includes(origin)) return true;
  if (!options.loopback) return false;
  try { const url = new URL(origin); return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname); } catch { return false; }
}
/** Transport owns sockets and subscriptions only. Never receives a Run cancellation signal. */
export class HostGateway {
  readonly epoch = randomUUID();
  readonly #http: Server;
  readonly #ws = new WebSocketServer({ noServer: true, maxPayload: HOST_LIMITS.frameBytes, perMessageDeflate: false });
  #heartbeat: ReturnType<typeof setInterval> | undefined;
  #unsubscribe: (() => void) | undefined;
  readonly #devices = new Map<WebSocket, string>();
  constructor(private readonly options: HostGatewayOptions) {
    const address = options.address ?? "127.0.0.1";
    if (!options.tls && !["127.0.0.1", "::1"].includes(address)) throw new Error("Public Host binding requires TLS");
    this.#http = options.tls ? createHttpsServer(options.tls) : createHttpServer();
    const serveStatic = options.webRoot ? createStaticHandler(options.webRoot) : undefined, loopback = !options.tls;
    this.#http.on("request", (request, response) => { if (serveStatic) serveStatic(request, response); else { response.writeHead(404); response.end(); } });
    this.#http.on("upgrade", (request, socket, head) => {
      if (request.url !== "/rpc" || (request.headers.origin !== undefined && !isAllowedOrigin(request.headers.origin, { allowedOrigins: options.allowedOrigins, loopback }))) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return;
      }
      this.#ws.handleUpgrade(request, socket, head, ws => this.#connect(ws, request.socket.remoteAddress ?? "unknown"));
    });
  }
  async listen(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.#http.once("error", reject);
      this.#http.listen(this.options.port ?? 4317, this.options.address ?? "127.0.0.1", () => { this.#http.off("error", reject); resolve(); });
    });
    this.#unsubscribe = this.options.auth.onRevoke(id => { for (const [ws, device] of this.#devices) if (device === id) ws.close(4003, "Device revoked"); });
    this.#heartbeat = setInterval(() => { for (const ws of this.#ws.clients) ws.ping(); }, 20_000);
    this.#heartbeat.unref();
    return (this.#http.address() as { port: number }).port;
  }
  async close(): Promise<void> {
    clearInterval(this.#heartbeat); this.#unsubscribe?.();
    for (const ws of this.#ws.clients) ws.terminate();
    await new Promise<void>(resolve => this.#ws.close(() => resolve()));
    await new Promise<void>((resolve, reject) => this.#http.close(error => error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING" ? reject(error) : resolve()));
  }
  #connect(ws: WebSocket, source: string) {
    const connectionId = randomUUID(), cleanups = new Set<() => void>();
    const payloads = new HostPayloads();
    let helloAccepted = false;
    let deviceId: string | undefined, inflight = 0, authenticating = false, lastPong = Date.now();
    const timeout = setTimeout(() => { if (!deviceId) ws.close(4001, "Authentication required"); }, 5_000);
    const liveness = setInterval(() => { if (Date.now() - lastPong > 60_000) ws.terminate(); }, 20_000);
    liveness.unref();
    ws.on("pong", () => { lastPong = Date.now(); });
    ws.on("error", () => { ws.terminate(); });
    const send = (value: unknown) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      let json = JSON.stringify(value);
      if (Buffer.byteLength(json) > HOST_LIMITS.frameBytes) {
        try {
          const payload = payloads.retain(json);
          json = JSON.stringify({ jsonrpc: "2.0", method: "host.payload", params: payload });
        } catch { ws.close(4008, "Response paging budget exceeded"); return; }
      }
      if (ws.bufferedAmount + Buffer.byteLength(json) > 8 * 1024 * 1024) { ws.close(4008, "Resync required"); return; }
      ws.send(json);
    };
    const request = async (value: unknown, afterReply: (() => void)[]): Promise<unknown | undefined> => {
      let id: unknown = isRecord(value) ? value.id : null;
      // JSON-RPC notifications never receive a response; mutation notifications are not executed.
      if (isRecord(value) && value.jsonrpc === "2.0" && value.id === undefined) return undefined;
      try {
        const input = parseHostRequest(value); id = input.id;
        let result: unknown;
        if (input.method === "host.hello") {
          if (input.params.protocol !== HOST_PROTOCOL) throw new HostError("INCOMPATIBLE_PROTOCOL", "Unsupported Host protocol");
          helloAccepted = true;
          result = { protocol: HOST_PROTOCOL, hostId: this.options.auth.hostId, epoch: this.epoch, state: this.options.state(), limits: HOST_LIMITS };
        } else if (input.method === "auth.pair" || input.method === "auth.resume") {
          if (!helloAccepted) throw new HostError("INCOMPATIBLE_PROTOCOL", "Complete protocol handshake before authentication");
          if (deviceId || authenticating) throw new HostError("CONFLICT", "Connection already authenticated or authentication pending");
          authenticating = true;
          try {
            if (input.method === "auth.pair") {
              const paired = await this.options.auth.pair(stringParam(input.params, "code", 128), stringParam(input.params, "name", 128), source);
              deviceId = paired.deviceId; result = paired;
            } else {
              deviceId = this.options.auth.authenticate(stringParam(input.params, "token", 128));
              await this.options.auth.touch(deviceId);
              result = { hostId: this.options.auth.hostId, deviceId };
            }
            if (ws.readyState === WebSocket.OPEN) this.#devices.set(ws, deviceId);
            clearTimeout(timeout);
          } finally { authenticating = false; }
        } else {
          if (!deviceId) throw new HostError("UNAUTHENTICATED", "Authenticate before calling Host operations");
          this.options.auth.assertDevice(deviceId);
          if (input.method === "payloads.read") {
            if (Object.keys(input.params).some(key => !["payloadId", "part"].includes(key))) throw new TypeError("Unexpected payload parameter");
            result = payloads.read(stringParam(input.params, "payloadId", 128), integerParam(input.params, "part", 1024));
          } else result = await this.options.dispatch(input.method, input.params, {
            deviceId, connectionId, close: () => ws.close(4008, "Resync required"),
            notify: (method, params) => {
              try { this.options.auth.assertDevice(deviceId!); send({ jsonrpc: "2.0", method, params }); }
              catch { ws.close(4003, "Device revoked"); }
            },
            afterReply: operation => { afterReply.push(operation); },
            onClose: cleanup => { if (ws.readyState === WebSocket.OPEN) cleanups.add(cleanup); else cleanup(); },
          });
          this.options.auth.assertDevice(deviceId);
        }
        return { jsonrpc: "2.0", id, result: result ?? null };
      } catch (error) {
        const validId = typeof id === "string" || typeof id === "number" ? id : null;
        const code = error instanceof HostError ? -32000 : error instanceof TypeError ? error.message === "Unknown Host method" ? -32601 : error.message === "Invalid JSON-RPC request" ? -32600 : -32602 : -32603;
        return { jsonrpc: "2.0", id: validId, error: { code, message: error instanceof HostError || error instanceof TypeError ? error.message : "Host operation failed", ...(error instanceof HostError ? { data: { kind: error.kind, retryable: error.retryable } } : {}) } };
      }
    };
    ws.on("message", (bytes, binary) => {
      if (binary) { ws.close(1003, "JSON frames required"); return; }
      let input: unknown;
      try { input = JSON.parse(bytes.toString()); }
      catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
      const batch = Array.isArray(input);
      const items: unknown[] = Array.isArray(input) ? input : [input];
      if (!items.length || items.length > 16) { send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid batch" } }); return; }
      if (inflight + items.length > HOST_LIMITS.concurrentRequests) { ws.close(4008, "Too many requests"); return; }
      inflight += items.length;
      const afterReply: (() => void)[] = [];
      void Promise.all(items.map(item => request(item, afterReply))).then(results => {
        const responses = results.filter(value => value !== undefined);
        if (responses.length) send(batch ? responses : responses[0]);
        for (const operation of afterReply) { try { operation(); } catch { ws.close(4008, "Observation failed"); } }
      }).finally(() => { inflight -= items.length; });
    });
    ws.on("close", () => {
      clearTimeout(timeout); clearInterval(liveness); this.#devices.delete(ws); payloads.clear();
      for (const cleanup of cleanups) { try { cleanup(); } catch { /* subscriptions only */ } }
    });
  }
}
