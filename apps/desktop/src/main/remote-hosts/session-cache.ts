import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SessionListPage } from "@actspace/shared";
import type { HostConnection, SessionRef } from "@actspace/shared/host-protocol";
import { sessionRefKey } from "@actspace/shared/host-protocol";
import type { RuntimeV2SessionListItem, RuntimeV2SessionObservation } from "@actspace/shared/runtime-v2";
/** Connection failure never means an empty remote Session list. */
export class RemoteSessionCache {
  readonly #pages = new Map<string, SessionListPage>();
  readonly #lists = new Map<string, readonly RuntimeV2SessionListItem[]>();
  readonly #observations = new Map<string, RuntimeV2SessionObservation>();
  readonly #writes = new Map<string, Promise<void>>();
  constructor(private readonly root?: string) {}
  #path(key: string) { return join(this.root!, key.startsWith("list:") ? "lists" : key.startsWith("page:") ? "pages" : "observations", `${createHash("sha256").update(key).digest("hex")}.json`); }
  async open(): Promise<void> {
    if (!this.root) return;
    let files: string[];
    try { files = await readdir(join(this.root, "lists")); } catch { return; }
    for (const file of files.filter(file => /^[0-9a-f]{64}\.json$/.test(file))) {
      try {
        const value = JSON.parse(await readFile(join(this.root, "lists", file), "utf8"));
        if (value.kind === "list" && typeof value.hostId === "string" && Array.isArray(value.sessions)) this.#lists.set(value.hostId, value.sessions);
      } catch { /* Cache corruption never prevents connection to the source Host. */ }
    }
  }
  async #save(key: string, value: unknown) {
    if (!this.root) return;
    const operation = (this.#writes.get(key) ?? Promise.resolve()).then(async () => {
      const path = this.#path(key), temporary = `${path}.${randomUUID()}.tmp`;
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 }); await rename(temporary, path);
    }).catch(() => { console.warn("Remote history cache could not be saved; Host remains authoritative."); });
    this.#writes.set(key, operation);
    await operation;
    if (this.#writes.get(key) === operation) this.#writes.delete(key);
  }
  async setPage(key: string, page: SessionListPage): Promise<void> {
    this.#pages.set(key, structuredClone(page));
    await this.#save(`page:${key}`, { kind: "page", key, page });
  }
  async readPage(key: string): Promise<SessionListPage | undefined> {
    const cached = this.#pages.get(key);
    if (cached) return structuredClone(cached);
    if (!this.root) return undefined;
    try {
      const value = JSON.parse(await readFile(this.#path(`page:${key}`), "utf8"));
      if (value.kind !== "page" || value.key !== key || !Array.isArray(value.page?.items) || !Array.isArray(value.page?.groups)) return undefined;
      this.#pages.set(key, value.page); return structuredClone(value.page);
    } catch { return undefined; }
  }
  async setList(hostId: string, sessions: readonly RuntimeV2SessionListItem[]): Promise<void> {
    this.#lists.set(hostId, structuredClone(sessions));
    await this.#save(`list:${hostId}`, { kind: "list", hostId, sessions });
  }
  list(hosts: readonly HostConnection[]) {
    return hosts.flatMap(host => (this.#lists.get(host.hostId) ?? []).map(session => ({ hostId: host.hostId, hostName: host.name, connectionState: host.state, session })));
  }
  async setObservation(ref: SessionRef, observation: RuntimeV2SessionObservation): Promise<void> {
    if (observation.sessionId !== ref.sessionId) throw new Error("Host observation Session identity mismatch");
    this.#observations.set(sessionRefKey(ref), structuredClone(observation));
    await this.#save(sessionRefKey(ref), { kind: "observation", ref, observation });
  }
  observation(ref: SessionRef): RuntimeV2SessionObservation | undefined { const value = this.#observations.get(sessionRefKey(ref)); return value ? structuredClone(value) : undefined; }
  async readObservation(ref: SessionRef): Promise<RuntimeV2SessionObservation | undefined> {
    const cached = this.observation(ref); if (cached || !this.root) return cached;
    try {
      const value = JSON.parse(await readFile(this.#path(sessionRefKey(ref)), "utf8"));
      if (value.kind !== "observation" || value.ref?.hostId !== ref.hostId || value.ref?.sessionId !== ref.sessionId || value.observation?.sessionId !== ref.sessionId) return undefined;
      this.#observations.set(sessionRefKey(ref), value.observation);
      return structuredClone(value.observation);
    } catch { return undefined; }
  }
  removeHost(hostId: string): void {
    this.#lists.delete(hostId);
    for (const key of this.#observations.keys()) if ((JSON.parse(key) as string[])[0] === hostId) this.#observations.delete(key);
  }
}
