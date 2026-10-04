import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WebSocket } from "ws";
import { HostClient, type HostSocket } from "@actspace/client/host";
import { HOST_PROTOCOL } from "@actspace/shared/host-protocol";
import type { AddHostInput, HostConnection, HostEndpoint, HostEvent, HostMethod } from "@actspace/shared/host-protocol";
import { HostCredentials } from "./credentials";
import { openSshTunnel, type SshTunnel } from "./ssh";
type Entry = { info: HostConnection; client?: HostClient; tunnel?: SshTunnel; retry?: ReturnType<typeof setTimeout>; attempt: number; generation: number; connecting?: Promise<void> };
export class RemoteHostRegistry {
  readonly #entries = new Map<string, Entry>();
  readonly #credentials: HostCredentials;
  readonly #listeners = new Set<() => void>();
  readonly #events = new Set<(hostId: string, event: HostEvent) => void>();
  #closed = false;
  #writes: Promise<unknown> = Promise.resolve();
  #adds: Promise<unknown> = Promise.resolve();
  constructor(private readonly root: string) { this.#credentials = new HostCredentials(join(root, "remote-host-credentials.json")); }
  list(): HostConnection[] { return [...this.#entries.values()].map(entry => structuredClone(entry.info)); }
  subscribe(listener: () => void) { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  subscribeEvents(listener: (hostId: string, event: HostEvent) => void) { this.#events.add(listener); return () => { this.#events.delete(listener); }; }
  #emit() { for (const listener of this.#listeners) { try { listener(); } catch { /* observer */ } } }
  async open(): Promise<void> {
    let saved: unknown;
    try { saved = JSON.parse(await readFile(join(this.root, "remote-hosts.json"), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    if (!Array.isArray(saved)) throw new Error("Invalid Host registry");
    for (const item of saved) {
      if (!item || typeof item.id !== "string" || typeof item.hostId !== "string" || typeof item.name !== "string") throw new Error("Invalid Host registry entry");
      validateEndpoint(item.endpoint);
      this.#entries.set(item.id, { info: { id: item.id, hostId: item.hostId, name: item.name, endpoint: item.endpoint, state: "offline" }, attempt: 0, generation: 0 });
    }
    for (const id of this.#entries.keys()) void this.reconnect(id).catch(() => undefined);
  }
  add(input: AddHostInput): Promise<HostConnection> {
    const copied = structuredClone(input);
    const next = this.#adds.then(() => this.#add(copied));
    this.#adds = next.catch(() => undefined);
    return next;
  }
  async #add(input: AddHostInput): Promise<HostConnection> {
    if (!input.name?.trim() || input.name.length > 128 || !input.code || input.code.length > 128) throw new Error("Invalid Host name or pairing code");
    validateEndpoint(input.endpoint);
    const entry: Entry = { info: { id: randomUUID(), hostId: "", name: input.name.trim(), endpoint: structuredClone(input.endpoint), state: "connecting" }, attempt: 0, generation: 0 };
    await this.#connect(entry, input.code);
    if ([...this.#entries.values()].some(value => value.info.hostId === entry.info.hostId)) { entry.client?.close(); await entry.tunnel?.close(); throw new Error("Host is already connected"); }
    this.#entries.set(entry.info.id, entry);
    try { await this.#save(); } catch (error) { this.#entries.delete(entry.info.id); entry.client?.close(); await entry.tunnel?.close(); await this.#credentials.set(entry.info.hostId, undefined).catch(() => undefined); throw error; }
    this.#emit(); return structuredClone(entry.info);
  }
  async remove(id: string): Promise<void> {
    const entry = this.#entry(id); clearTimeout(entry.retry); entry.generation++;
    this.#entries.delete(id); entry.client?.close(); await entry.tunnel?.close();
    await this.#save(); await this.#credentials.set(entry.info.hostId, undefined); this.#emit();
  }
  reconnect(id: string): Promise<void> {
    const entry = this.#entry(id);
    return entry.connecting ??= this.#connect(entry).finally(() => { entry.connecting = undefined; });
  }
  call(hostId: string, method: HostMethod, params: Readonly<Record<string, unknown>>): Promise<unknown> {
    const entry = [...this.#entries.values()].find(entry => entry.info.hostId === hostId);
    if (!entry?.client || entry.info.state !== "connected") return Promise.reject(new Error("Host is offline"));
    return entry.client.call(method, params);
  }
  async #connect(entry: Entry, code?: string): Promise<void> {
    const generation = ++entry.generation; clearTimeout(entry.retry); entry.client?.close(); await entry.tunnel?.close();
    entry.info.state = "connecting"; delete entry.info.error; this.#emit();
    let socket: WebSocket | undefined, ownedClient: HostClient | undefined, ownedTunnel: SshTunnel | undefined;
    try {
      const endpoint = entry.info.endpoint;
      ownedTunnel = endpoint.kind === "ssh" ? await openSshTunnel(endpoint.alias, endpoint.port) : undefined;
      if (this.#closed || generation !== entry.generation) throw new Error("Connection superseded");
      entry.tunnel = ownedTunnel;
      const url = endpoint.kind === "wss" ? endpoint.url : `ws://127.0.0.1:${entry.tunnel!.port}/rpc`;
      socket = new WebSocket(url, { handshakeTimeout: 10000, maxPayload: 1024 * 1024 });
      await new Promise<void>((resolve, reject) => { socket!.once("open", resolve); socket!.once("error", reject); });
      const client = new HostClient(socket as unknown as HostSocket); ownedClient = client; entry.client = client;
      if (code) {
        // Hello is read-only. Reject known identity before auth.pair consumes a code.
        const hello = await client.call("host.hello", { protocol: HOST_PROTOCOL }) as { hostId?: string };
        if ([...this.#entries.values()].some(value => value !== entry && value.info.hostId === hello?.hostId)) throw new Error("Host is already connected");
      }
      const token = code ? undefined : await this.#credentials.get(entry.info.hostId);
      if (!code && !token) throw new Error("Device credential unavailable; pair again");
      const result = await client.authenticate(code ? { code, name: "ActSpace Desktop", ...(entry.info.hostId ? { expectedHostId: entry.info.hostId } : {}) } : { token: token!, expectedHostId: entry.info.hostId });
      if (this.#closed || generation !== entry.generation) throw new Error("Connection superseded");
      if (code && [...this.#entries.values()].some(value => value !== entry && value.info.hostId === result.hostId)) throw new Error("Host is already connected");
      if (result.token) await this.#credentials.set(result.hostId, result.token);
      entry.info.hostId = result.hostId; entry.info.state = "connected"; entry.attempt = 0;
      client.subscribe(event => { for (const listener of this.#events) { try { listener(entry.info.hostId, event); } catch { /* observer */ } } });
      socket.once("close", code => {
        if (generation !== entry.generation || this.#closed || !this.#entries.has(entry.info.id)) return;
        entry.info.state = code === 4003 ? "revoked" : "offline"; this.#emit();
        if (code !== 4003) this.#retry(entry);
      });
      await client.call("host.observe", {});
      this.#emit();
    } catch (error) {
      socket?.terminate(); ownedClient?.close(); await ownedTunnel?.close();
      if (generation !== entry.generation) return;
      entry.client = undefined; entry.tunnel = undefined;
      const kind = error && typeof error === "object" && "kind" in error ? error.kind : undefined;
      entry.info.state = kind === "REVOKED" || kind === "UNAUTHENTICATED" ? "revoked" : kind === "INCOMPATIBLE_PROTOCOL" || kind === "FORBIDDEN" ? "incompatible" : "offline";
      entry.info.error = error instanceof Error ? error.message : "Host connection failed"; this.#emit();
      if (!code && entry.info.state === "offline") this.#retry(entry);
      throw error;
    }
  }
  #retry(entry: Entry) {
    if (this.#closed || !this.#entries.has(entry.info.id)) return;
    clearTimeout(entry.retry);
    entry.retry = setTimeout(() => { void this.reconnect(entry.info.id).catch(() => undefined); }, Math.round(Math.min(30000, 1000 * 2 ** Math.min(entry.attempt++, 5)) * (0.9 + Math.random() * 0.2)));
    entry.retry.unref();
  }
  #entry(id: string) { const entry = this.#entries.get(id); if (!entry) throw new Error("Host connection not found"); return entry; }
  #save(): Promise<void> {
    const snapshot = this.list().map(({ id, hostId, name, endpoint }) => ({ id, hostId, name, endpoint }));
    const next = this.#writes.then(async () => { await mkdir(this.root, { recursive: true, mode: 0o700 }); const temporary = join(this.root, `remote-hosts.${randomUUID()}.tmp`); await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600, flag: "wx" }); await rename(temporary, join(this.root, "remote-hosts.json")); });
    this.#writes = next.catch(() => undefined); return next;
  }
  async dispose(): Promise<void> {
    this.#closed = true;
    await Promise.all([...this.#entries.values()].map(async entry => { clearTimeout(entry.retry); entry.generation++; entry.client?.close(); await entry.tunnel?.close(); }));
    await this.#writes;
  }
}
function validateEndpoint(endpoint: HostEndpoint): void {
  if (!endpoint || typeof endpoint !== "object") throw new Error("Invalid Host endpoint");
  if (endpoint.kind === "wss") {
    const url = new URL(endpoint.url);
    if (url.protocol !== "wss:" || url.username || url.password || url.hash || url.search || url.pathname !== "/rpc") throw new Error("Use a WSS URL ending in /rpc without credentials or query parameters");
  } else if (endpoint.kind === "ssh") {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(endpoint.alias) || !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) throw new Error("Invalid SSH alias or Host port");
  } else throw new Error("Unsupported Host transport");
}
