import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { HostError } from "@actspace/shared/host-protocol";
import { SerialGate, writeDurableJson } from "./storage.js";
export interface Device { id: string; name: string; tokenHash: string; createdAt: number; lastUsedAt: number; revoked: boolean }
interface AuthState { schemaVersion: 1; hostId: string; devices: Device[]; codes: { hash: string; expiresAt: number }[] }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
/** Owned by the single Host writer. Secrets never enter list/describe or logs. */
export class HostAuth {
  readonly #gate = new SerialGate();
  readonly #attempts = new Map<string, { minute: number; count: number }>();
  readonly #revocations = new Set<(deviceId: string) => void>();
  #state!: AuthState;
  #failure: unknown;
  constructor(private readonly root: string, private readonly now = Date.now, private readonly assertOwned: () => Promise<void> = async () => {}) {}
  get hostId() { return this.#state.hostId; }
  async open(): Promise<void> {
    try { this.#state = JSON.parse(await readFile(join(this.root, "devices.json"), "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.#state = { schemaVersion: 1, hostId: randomUUID(), devices: [], codes: [] };
      await this.#persist(this.#state);
    }
    const state = this.#state;
    if (state.schemaVersion !== 1 || typeof state.hostId !== "string" || !Array.isArray(state.devices) || !Array.isArray(state.codes)
      || state.devices.some(d => typeof d.id !== "string" || typeof d.name !== "string" || !/^[a-f0-9]{64}$/.test(d.tokenHash) || typeof d.revoked !== "boolean" || !Number.isFinite(d.createdAt) || !Number.isFinite(d.lastUsedAt))
      || state.codes.some(c => !/^[a-f0-9]{64}$/.test(c.hash) || !Number.isFinite(c.expiresAt))) throw new Error("Invalid Host device store");
  }
  async createPairCode(): Promise<{ code: string; expiresAt: number }> {
    return this.#gate.run(async () => {
      this.#assertHealthy();
      const code = randomBytes(16).toString("hex"), expiresAt = this.now() + 600_000;
      const next = structuredClone(this.#state);
      next.codes = next.codes.filter(c => c.expiresAt > this.now());
      if (next.codes.length >= 20) throw new HostError("LIMIT_EXCEEDED", "Too many active pairing codes");
      next.codes.push({ hash: hash(code), expiresAt }); await this.#persist(next);
      return { code, expiresAt };
    });
  }
  async pair(code: string, name: string, source: string) {
    this.#limit(source);
    return this.#gate.run(async () => {
      this.#assertHealthy();
      const next = structuredClone(this.#state), index = next.codes.findIndex(c => c.hash === hash(code) && c.expiresAt > this.now());
      if (index < 0) throw new HostError("UNAUTHENTICATED", "Pairing code is invalid or expired");
      if (!name.trim() || name.length > 128) throw new TypeError("Invalid device name");
      const token = randomBytes(32).toString("hex"), id = randomUUID();
      next.codes.splice(index, 1);
      next.devices.push({ id, name: name.trim(), tokenHash: hash(token), createdAt: this.now(), lastUsedAt: this.now(), revoked: false });
      await this.#persist(next);
      return { hostId: next.hostId, deviceId: id, token };
    });
  }
  authenticate(token: string): string {
    this.#assertHealthy();
    const device = this.#state.devices.find(d => d.tokenHash === hash(token));
    if (!device) throw new HostError("UNAUTHENTICATED", "Invalid device credential");
    this.assertDevice(device.id); return device.id;
  }
  async touch(id: string): Promise<void> {
    await this.#gate.run(async () => {
      this.assertDevice(id); const next = structuredClone(this.#state);
      next.devices.find(device => device.id === id)!.lastUsedAt = this.now(); await this.#persist(next);
    });
  }
  assertDevice(id: string): void {
    this.#assertHealthy();
    const device = this.#state.devices.find(d => d.id === id);
    if (!device || device.revoked) throw new HostError("REVOKED", "Device access was revoked");
  }
  list() { return this.#state.devices.map(({ tokenHash: _secret, ...device }) => ({ ...device })); }
  onRevoke(listener: (id: string) => void) { this.#revocations.add(listener); return () => { this.#revocations.delete(listener); }; }
  async revoke(id: string): Promise<void> {
    await this.#gate.run(async () => {
      this.#assertHealthy();
      const next = structuredClone(this.#state), device = next.devices.find(d => d.id === id);
      if (!device) throw new HostError("NOT_FOUND", "Device not found");
      device.revoked = true; await this.#persist(next);
      for (const listener of this.#revocations) { try { listener(id); } catch { /* observer */ } }
    });
  }
  #limit(source: string) {
    const minute = Math.floor(this.now() / 60_000);
    for (const [key, item] of this.#attempts) if (item.minute !== minute) this.#attempts.delete(key);
    for (const [key, limit] of [["all", 30], [`source:${source}`, 5]] as const) {
      const item = this.#attempts.get(key) ?? { minute, count: 0 };
      this.#attempts.set(key, item);
      if (++item.count > limit) throw new HostError("LIMIT_EXCEEDED", "Pairing rate limit exceeded", true);
    }
  }
  #assertHealthy() { if (this.#failure) throw new HostError("RECOVERY_BLOCKED", "Device storage failed; restart required"); }
  async #persist(next: AuthState) {
    try { await this.assertOwned(); await writeDurableJson(join(this.root, "devices.json"), next); this.#state = next; }
    catch (error) { this.#failure = error; throw error; }
  }
}
