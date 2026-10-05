import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, lstat } from "node:fs/promises";
import { join } from "node:path";
import { SessionWriterLease } from "@actspace/session-jsonl";
import { isRecord } from "@actspace/shared/host-protocol";
import { writeDurableJson } from "./storage.js";
export type AdminCommand = "status" | "pair" | "devices" | "revoke" | "stop";
export interface AdminRequest { nonce: string; command: AdminCommand; deviceId?: string; force?: boolean; createdAt: number }
/** Private local filesystem transport. No management method is exposed over the network. */
export class HostAdmin {
  #lease: SessionWriterLease | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #busy = false;
  readonly root: string;
  constructor(dataRoot: string, private readonly dispatch: (request: AdminRequest) => Promise<unknown>) { this.root = join(dataRoot, "host-admin"); }
  async open(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root);
    if (info.isSymbolicLink() || !info.isDirectory() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) throw new Error("Host admin directory must be owned by current user with mode 0700");
    this.#lease = await SessionWriterLease.acquire({ sessionDir: this.root, sessionId: "host", runtimeId: randomUUID() });
  }
  start(): void {
    if (!this.#lease) throw new Error("Acquire Host lease before starting admin queue");
    this.#timer = setInterval(() => { void this.#poll().catch(() => { /* next tick retries; requests remain pending */ }); }, 100);
    this.#timer.unref();
  }
  async assertOwned(): Promise<void> { if (!this.#lease) throw new Error("Host lease unavailable"); await this.#lease.assertOwned(); }
  async #poll(): Promise<void> {
    if (this.#busy) return; this.#busy = true;
    try {
      await this.assertOwned();
      for (const name of (await readdir(this.root)).slice(0, 256)) {
        if (!/^[0-9a-f-]{36}\.(request|response)\.json$/.test(name)) continue;
        const path = join(this.root, name), info = await lstat(path);
        if (Date.now() - info.mtimeMs > 60_000) { await rm(path, { force: true }); continue; }
        if (!info.isFile() || info.isSymbolicLink() || !name.endsWith(".request.json") || info.size > 4096 || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) continue;
        const nonce = name.slice(0, 36);
        let response: unknown;
        try {
          const request: unknown = JSON.parse(await readFile(path, "utf8"));
          if (!isRecord(request) || request.nonce !== nonce || !["status", "pair", "devices", "revoke", "stop"].includes(String(request.command)) || typeof request.createdAt !== "number" || Math.abs(Date.now() - request.createdAt) > 30_000 || (request.force !== undefined && typeof request.force !== "boolean") || (request.deviceId !== undefined && typeof request.deviceId !== "string")) throw new Error("Invalid admin request");
          response = { nonce, result: await this.dispatch(request as unknown as AdminRequest) };
        } catch (error) { response = { nonce, error: error instanceof Error ? error.message : "Admin request failed" }; }
        await writeDurableJson(join(this.root, `${nonce}.response.json`), response);
        await rm(path, { force: true });
      }
    } finally { this.#busy = false; }
  }
  async close(): Promise<void> { clearInterval(this.#timer); await this.#lease?.dispose(); this.#lease = undefined; }
}
export async function requestHostAdmin(dataRoot: string, command: AdminCommand, options: { deviceId?: string; force?: boolean } = {}): Promise<unknown> {
  const root = join(dataRoot, "host-admin"), info = await lstat(root);
  if (info.isSymbolicLink() || !info.isDirectory() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) throw new Error("Unsafe Host admin directory");
  const nonce = randomUUID(), requestPath = join(root, `${nonce}.request.json`), responsePath = join(root, `${nonce}.response.json`);
  await writeDurableJson(requestPath, { nonce, command, ...options, createdAt: Date.now() });
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const responseInfo = await lstat(responsePath);
        if (!responseInfo.isFile() || responseInfo.isSymbolicLink() || responseInfo.size > 1024 * 1024 || (responseInfo.mode & 0o077) !== 0 || (process.getuid && responseInfo.uid !== process.getuid())) throw new Error("Unsafe admin response");
        const response: unknown = JSON.parse(await readFile(responsePath, "utf8"));
        if (!isRecord(response) || response.nonce !== nonce) throw new Error("Invalid admin response");
        if (typeof response.error === "string") throw new Error(response.error);
        return response.result;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Host did not answer; start it before running management commands");
  } finally { await Promise.all([rm(requestPath, { force: true }), rm(responsePath, { force: true })]); }
}
