import { HostClient, type HostSocket } from "@actspace/client/host";
import { HostError, isRecord, type HostErrorKind, type HostHello, type HostObserveSnapshot } from "@actspace/shared/host-protocol";
import { HostEventRouter } from "./host-events";
import { activeSavedHost, clearHostToken, removeHost, saveHost, type SavedHost } from "./saved-hosts";

export type HostWorkspace = { readonly id: string; readonly name: string; readonly path: string };
export type HostModel = { readonly id: string; readonly provider: string; readonly name: string };
export type HostDescription = {
  readonly state: HostHello["state"];
  readonly workspaces: readonly HostWorkspace[];
  readonly models: readonly HostModel[];
  readonly defaultModel: string;
  readonly capabilities: Readonly<Record<string, boolean>>;
};

/** 一次成功的连接；断线重连后换成新对象，订阅方据此重新 observe。 */
export type HostConnection = {
  readonly id: number;
  readonly client: HostClient;
  readonly events: HostEventRouter;
  readonly hostId: string;
  readonly epoch: string;
  readonly description: HostDescription;
  readonly hostSubscriptionId: string;
  readonly hostSnapshot: HostObserveSnapshot;
};

export type ConnectionStatus = "idle" | "connecting" | "ready" | "reconnecting" | "revoked" | "failed";
export type ConnectionError = { readonly kind?: HostErrorKind; readonly closeCode?: number; readonly message: string; readonly url?: string };
export type ConnectionState = {
  readonly status: ConnectionStatus;
  readonly host: SavedHost | null;
  readonly connection: HostConnection | null;
  /** 最近一次成功连接时的 host.describe；断线期间保留，列表和顶栏照常显示工作区名。 */
  readonly description: HostDescription | null;
  /** Host 在维护或恢复受阻：读操作照常，不能发送。 */
  readonly maintenance: boolean;
  readonly error: ConnectionError | null;
  readonly revokedReason: "revoked" | "unauthenticated" | null;
  /** 下次自动重连的时间（毫秒时间戳），只在 reconnecting 时有值。 */
  readonly retryAt: number | null;
};

export type ConnectionStoreOptions = {
  readonly createSocket?: (url: string) => HostSocket;
  readonly storage?: Storage;
  readonly target?: Pick<Window, "addEventListener" | "removeEventListener">;
  readonly isVisible?: () => boolean;
  readonly openTimeoutMs?: number;
};

/** 重连退避（秒）：1、2、4、8、16、30，之后一直 30。 */
export const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
const PROBE_TIMEOUT_MS = 4_000;

type Mode = { readonly kind: "pair"; readonly url: string; readonly code: string; readonly name: string } | { readonly kind: "resume" };

/** 用户输入的地址统一成 origin；没写协议时按 https。 */
export function normalizeHostUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new TypeError("地址必须以 https:// 或 http:// 开头");
  return url.origin;
}

export function rpcUrl(origin: string): string {
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/rpc";
  return url.toString();
}

function waitOpen(socket: HostSocket, timeoutMs: number): Promise<void> {
  if (socket.readyState === 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = (error?: Error) => {
      clearTimeout(timer);
      socket.removeEventListener("open", onOpen); socket.removeEventListener("error", onError); socket.removeEventListener("close", onClose);
      if (error) reject(error); else resolve();
    };
    const onOpen = () => done();
    const onError = () => done(new Error("WebSocket error"));
    const onClose = () => done(new Error("WebSocket closed"));
    const timer = setTimeout(() => { done(new Error("WebSocket open timed out")); socket.close(); }, timeoutMs);
    socket.addEventListener("open", onOpen); socket.addEventListener("error", onError); socket.addEventListener("close", onClose);
  });
}

function errorOf(error: unknown, closeCode: number | undefined, url: string | undefined): ConnectionError {
  return {
    ...(error instanceof HostError ? { kind: error.kind } : {}),
    ...(closeCode === undefined ? {} : { closeCode }),
    message: error instanceof Error ? error.message : String(error),
    ...(url ? { url } : {}),
  };
}

/**
 * 连接状态机（front-web-pwa客户端规范 §5）：host.hello → auth.pair / auth.resume → host.describe → host.observe。
 * HostClient 不重连、不重试写操作，这两件事在这里和调用方处理。
 */
export class ConnectionStore {
  #state: ConnectionState;
  readonly #listeners = new Set<() => void>();
  readonly #options: Required<Omit<ConnectionStoreOptions, "target">> & { target?: ConnectionStoreOptions["target"] };
  #generation = 0;
  #attempt = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #socket: HostSocket | undefined;
  #hostListener: (() => void) | undefined;
  #disposed = false;

  constructor(options: ConnectionStoreOptions = {}) {
    this.#options = {
      createSocket: options.createSocket ?? (url => new WebSocket(url) as unknown as HostSocket),
      storage: options.storage ?? localStorage,
      isVisible: options.isVisible ?? (() => typeof document === "undefined" || document.visibilityState === "visible"),
      openTimeoutMs: options.openTimeoutMs ?? 10_000,
      target: options.target ?? (typeof window === "undefined" ? undefined : window),
    };
    this.#state = { status: "idle", host: activeSavedHost(this.#options.storage), connection: null, description: null, maintenance: false, error: null, revokedReason: null, retryAt: null };
    this.#options.target?.addEventListener("online", this.#wake);
    this.#options.target?.addEventListener("visibilitychange", this.#wake);
  }

  getState = (): ConnectionState => this.#state;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  /** 启动时调用：有保存的 token 就恢复连接。 */
  start(): void {
    if (this.#state.host?.token && this.#state.status === "idle") void this.#connect({ kind: "resume" });
  }

  /** 配对成功返回；失败时状态是 failed，并把错误抛给连接页。 */
  async pair(url: string, code: string, name: string): Promise<void> {
    await this.#connect({ kind: "pair", url: normalizeHostUrl(url), code: code.trim(), name: name.trim() });
    if (this.#state.status !== "ready") throw this.#state.error ?? new Error("配对失败");
  }

  resume(): Promise<void> {
    return this.#connect({ kind: "resume" });
  }

  /** 断开且不再自动重连；保存的 Host 保留。 */
  disconnect(): void {
    this.#generation++;
    this.#teardown();
    this.#set({ status: "idle", connection: null, error: null, retryAt: null, maintenance: false });
  }

  /** 设置页「断开并移除」。 */
  forget(): void {
    const hostId = this.#state.host?.hostId;
    this.disconnect();
    if (hostId) removeHost(hostId, this.#options.storage);
    this.#set({ host: null, description: null, revokedReason: null });
  }

  /** 调用方把 RPC 错误报回来：维护中只置标记；凭据失效回到连接页。 */
  reportError(error: unknown): void {
    if (!(error instanceof HostError)) return;
    if (error.kind === "MAINTENANCE" || error.kind === "RECOVERY_BLOCKED") this.#set({ maintenance: true });
    if (error.kind === "REVOKED" || error.kind === "UNAUTHENTICATED") this.#revoke(error.kind === "REVOKED" ? "revoked" : "unauthenticated");
  }

  dispose(): void {
    this.#disposed = true;
    this.disconnect();
    this.#options.target?.removeEventListener("online", this.#wake);
    this.#options.target?.removeEventListener("visibilitychange", this.#wake);
    this.#listeners.clear();
  }

  #set(patch: Partial<ConnectionState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of [...this.#listeners]) listener();
  }

  #teardown(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#hostListener?.();
    this.#hostListener = undefined;
    const connection = this.#state.connection;
    if (connection) connection.client.close();
    else this.#socket?.close(1000, "Client closed");
    this.#socket = undefined;
  }

  async #connect(mode: Mode): Promise<void> {
    if (this.#disposed) return;
    const generation = ++this.#generation;
    const stale = () => generation !== this.#generation;
    const wasConnected = this.#state.connection !== null || this.#state.status === "reconnecting";
    this.#teardown();
    const saved = mode.kind === "resume" ? activeSavedHost(this.#options.storage) : null;
    if (mode.kind === "resume" && !saved?.token) {
      this.#set({ status: "idle", host: saved, connection: null, retryAt: null });
      return;
    }
    const url = mode.kind === "pair" ? mode.url : saved!.url;
    this.#set({ status: wasConnected && mode.kind === "resume" ? "reconnecting" : "connecting", connection: null, error: null, retryAt: null, ...(mode.kind === "pair" ? { revokedReason: null } : {}) });
    let closeCode: number | undefined;
    let socket: HostSocket | undefined;
    try {
      socket = this.#options.createSocket(rpcUrl(url));
      this.#socket = socket;
      socket.addEventListener("close", event => {
        closeCode = event.code;
        if (!stale() && this.#state.status === "ready") this.#dropped(generation, event.code);
      });
      await waitOpen(socket, this.#options.openTimeoutMs);
      if (stale()) return;
      const client = new HostClient(socket);
      const auth = await client.authenticate(mode.kind === "pair" ? { code: mode.code, name: mode.name } : { token: saved!.token, expectedHostId: saved!.hostId });
      if (stale()) { client.close(); return; }
      const host: SavedHost = mode.kind === "pair"
        ? { hostId: auth.hostId, deviceId: auth.deviceId, url, token: auth.token ?? "", name: mode.name, pairedAt: new Date().toISOString() }
        : saved!;
      if (mode.kind === "pair") saveHost(host, this.#options.storage);
      const events = new HostEventRouter();
      client.subscribe(events.accept);
      const description = await client.call("host.describe") as HostDescription;
      const observed = await client.call("host.observe") as { subscriptionId: string; snapshot: HostObserveSnapshot };
      if (stale()) { client.close(); return; }
      if (!isRecord(observed) || typeof observed.subscriptionId !== "string") throw new Error("Invalid host.observe response");
      const connection: HostConnection = { id: generation, client, events, hostId: host.hostId, epoch: client.hello!.epoch, description, hostSubscriptionId: observed.subscriptionId, hostSnapshot: observed.snapshot };
      this.#hostListener = events.on(observed.subscriptionId, value => {
        if (isRecord(value) && value.kind === "state" && typeof value.state === "string") this.#set({ maintenance: value.state !== "ready" });
      });
      this.#attempt = 0;
      this.#set({ status: "ready", host, connection, description, error: null, revokedReason: null, retryAt: null, maintenance: client.hello!.state !== "ready" || observed.snapshot.state !== "ready" });
    } catch (error) {
      if (stale()) return;
      socket?.close();
      this.#socket = undefined;
      this.#failed(mode, errorOf(error, closeCode, url));
    }
  }

  #failed(mode: Mode, error: ConnectionError): void {
    const terminal = error.kind === "FORBIDDEN" || error.kind === "INCOMPATIBLE_PROTOCOL";
    if (error.kind === "REVOKED" || error.closeCode === 4003) return this.#revoke("revoked", error);
    if (mode.kind === "pair" || terminal) {
      this.#set({ status: "failed", connection: null, error, retryAt: null });
      return;
    }
    if (error.kind === "UNAUTHENTICATED") return this.#revoke("unauthenticated", error);
    this.#schedule(error);
  }

  #dropped(generation: number, code: number | undefined): void {
    if (generation !== this.#generation) return;
    this.#hostListener?.();
    this.#hostListener = undefined;
    if (code === 4003) return this.#revoke("revoked", { closeCode: code, message: "Device revoked" });
    this.#set({ connection: null });
    // 4008 是 Host 要求重新同步，直接重连。
    if (code === 4008) { void this.#connect({ kind: "resume" }); return; }
    this.#schedule({ ...(code === undefined ? {} : { closeCode: code }), message: "Connection closed" });
  }

  #schedule(error: ConnectionError): void {
    const delay = RECONNECT_DELAYS_MS[Math.min(this.#attempt, RECONNECT_DELAYS_MS.length - 1)]!;
    this.#attempt++;
    clearTimeout(this.#timer);
    const generation = this.#generation;
    this.#timer = setTimeout(() => { if (generation === this.#generation) void this.#connect({ kind: "resume" }); }, delay);
    this.#set({ status: "reconnecting", connection: null, error, retryAt: Date.now() + delay });
  }

  #revoke(reason: "revoked" | "unauthenticated", error?: ConnectionError): void {
    const hostId = this.#state.host?.hostId;
    this.#generation++;
    this.#teardown();
    if (hostId) clearHostToken(hostId, this.#options.storage);
    this.#set({ status: "revoked", host: activeSavedHost(this.#options.storage), connection: null, error: error ?? null, revokedReason: reason, retryAt: null, maintenance: false });
  }

  /** 回到前台或网络恢复：重连中就立刻重连；已连接时探一下连接是否还活着（iOS 后台会静默断开）。 */
  #wake = (): void => {
    if (!this.#options.isVisible()) return;
    if (this.#state.status === "reconnecting") {
      this.#attempt = 0;
      void this.#connect({ kind: "resume" });
      return;
    }
    const connection = this.#state.connection;
    if (this.#state.status !== "ready" || !connection) return;
    const generation = this.#generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("probe timeout")), PROBE_TIMEOUT_MS); });
    void Promise.race([connection.client.call("host.describe"), timeout])
      .catch(() => {
        if (generation !== this.#generation || this.#state.connection !== connection) return;
        this.#attempt = 0;
        void this.#connect({ kind: "resume" });
      })
      .finally(() => clearTimeout(timer));
  };
}
