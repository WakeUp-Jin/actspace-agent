import * as net from "net";
import type { BridgeRequest, BridgeResponse, BridgeClientOptions } from "./types";

const PROTOCOL_VERSION = "0.2.0";
const DEFAULT_TIMEOUT_MS = 30_000;

export class BridgeClient {
  private socket: net.Socket | null = null;
  private connected = false;
  private pendingRequests = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private requestCounter = 0;
  private readBuffer = Buffer.alloc(0);
  private options: Required<BridgeClientOptions>;
  private connectPromise: Promise<void> | null = null;

  constructor(options: BridgeClientOptions) {
    this.options = {
      ...options,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(this.options.socketPath);

      const onError = (err: Error) => {
        cleanup();
        reject(new Error(`BridgeClient connect failed: ${err.message}`));
      };
      const onConnect = () => {
        cleanup();
        this.socket = socket;
        this.connected = true;
        socket.on("data", (chunk) => this.handleData(chunk));
        socket.on("close", () => this.handleDisconnect());
        socket.on("error", () => this.handleDisconnect());
        resolve();
      };
      const cleanup = () => {
        socket.removeListener("error", onError);
        socket.removeListener("connect", onConnect);
      };

      socket.once("error", onError);
      socket.once("connect", onConnect);
    });

    try {
      await this.connectPromise;
      // Send session.start
      await this.send("agent_browser_bridge.session.start", {
        sessionId: this.options.sessionId,
        turnId: this.options.turnId,
      });
    } catch (error) {
      this.cleanup();
      throw error;
    } finally {
      this.connectPromise = null;
    }
  }

  async send(method: string, params?: unknown): Promise<unknown> {
    if (!this.connected) {
      await this.connect();
    }

    const id = String(++this.requestCounter);
    const req: BridgeRequest = {
      protocolVersion: PROTOCOL_VERSION,
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`BridgeClient timeout: ${method} (${this.options.timeoutMs}ms)`));
      }, this.options.timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.writeFrame(Buffer.from(JSON.stringify(req)));
    });
  }

  async dispose(): Promise<void> {
    if (this.connected && this.socket) {
      try {
        await this.send("agent_browser_bridge.session.end", {
          sessionId: this.options.sessionId,
          turnId: this.options.turnId,
        });
      } catch {
        // Best effort
      }
    }
    this.cleanup();
  }

  private handleData(chunk: Buffer): void {
    this.readBuffer = Buffer.concat([this.readBuffer, chunk]);

    while (this.readBuffer.length >= 4) {
      const payloadLen = this.readBuffer.readUInt32LE(0);
      if (this.readBuffer.length < 4 + payloadLen) break;

      const payload = this.readBuffer.subarray(4, 4 + payloadLen);
      this.readBuffer = this.readBuffer.subarray(4 + payloadLen);

      try {
        const msg = JSON.parse(payload.toString()) as BridgeResponse;
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          clearTimeout(pending.timer);

          if (msg.ok) {
            pending.resolve(msg.result);
          } else {
            const errMsg = msg.error
              ? `${msg.error.code}: ${msg.error.message}`
              : "unknown bridge error";
            pending.reject(new Error(errMsg));
          }
        }
        // Events (no id) are currently ignored at this layer
      } catch {
        // Malformed frame, skip
      }
    }
  }

  private handleDisconnect(): void {
    this.connected = false;
    this.socket = null;
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("BridgeClient disconnected"));
      this.pendingRequests.delete(id);
    }
  }

  private cleanup(): void {
    const socket = this.socket;
    this.handleDisconnect();
    socket?.destroy();
  }

  private writeFrame(payload: Buffer): void {
    if (!this.socket) throw new Error("BridgeClient socket is not connected");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length);
    this.socket.write(header);
    this.socket.write(payload);
  }
}
