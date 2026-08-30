import { mkdir, readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { RuntimeV2SessionListItem, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import type { EventCodecRegistry } from "@actspace/session-journal";
import type { SessionHandle, SessionPersistence } from "@actspace/session-persistence";
import { SessionHandle as RuntimeSessionHandle } from "@actspace/session-persistence";
import { createSessionHeader } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { applySessionRecovery } from "@actspace/session-persistence";
import { projectSessionSnapshot } from "../projection/durable-session.js";
import type { RendererAllowlist } from "../projection/tool-dto.js";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

export class RuntimeSessionController {
  readonly store: SessionStore;
  readonly #open = new Map<string, SessionHandle>();
  readonly #ephemeral = new Set<string>();
  constructor(readonly options: { dataRoot: string; runtimeId: string; registry: EventCodecRegistry; profileId: string; manifestDigest: string; plugins: readonly { id: string; version: string }[]; rendererAllowlist?: RendererAllowlist; beforeRecovery?: (session: SessionHandle, store: SessionStore) => Promise<void>; onEvent?: (sessionId: string, event: SessionEventEnvelopeV1) => void | Promise<void>; onFlush?: (sessionId: string, throughSeq: number) => void | Promise<void> }, store?: SessionStore) { this.store = store ?? new SessionStore({ dataRoot: options.dataRoot, runtimeId: options.runtimeId, registry: options.registry }); }
  private onEvent(sessionId: string): (event: SessionEventEnvelopeV1) => void | Promise<void> { return (event) => this.options.onEvent?.(sessionId, event); }
  private onFlush(sessionId: string): (throughSeq: number) => void | Promise<void> { return (throughSeq) => this.options.onFlush?.(sessionId, throughSeq); }
  async create(sessionId: string = randomUUID(), cwd?: string): Promise<SessionHandle> { const session = await this.store.create({ sessionId, createdAt: new Date().toISOString(), ...(cwd === undefined ? {} : { cwd }), lineage: null, createdWith: { profileId: this.options.profileId, runtimeContractVersion: "actspace.runtime.v2", manifestDigest: this.options.manifestDigest, plugins: this.options.plugins, codecSetDigest: this.options.registry.digest } }, { onEvent: this.onEvent(sessionId), onFlush: this.onFlush(sessionId) }); this.#open.set(sessionId, session); return session; }
  async createEphemeral(sessionId: string = randomUUID(), cwd?: string): Promise<SessionHandle> { const header = createSessionHeader({ sessionId, createdAt: new Date().toISOString(), ...(cwd === undefined ? {} : { cwd }), lineage: null, createdWith: { profileId: this.options.profileId, runtimeContractVersion: "actspace.runtime.v2", manifestDigest: this.options.manifestDigest, plugins: this.options.plugins, codecSetDigest: this.options.registry.digest } }); const session = RuntimeSessionHandle.createEphemeral({ header, registry: this.options.registry, onEvent: this.onEvent(sessionId), onFlush: this.onFlush(sessionId) }); this.#open.set(sessionId, session); this.#ephemeral.add(sessionId); return session; }
  async resume(sessionId: string): Promise<SessionHandle> { const existing = this.#open.get(sessionId); if (existing !== undefined) return existing; const session = await this.store.open(sessionId, { onEvent: this.onEvent(sessionId), onFlush: this.onFlush(sessionId) }); try { await this.options.beforeRecovery?.(session, this.store); await applySessionRecovery(session); this.#open.set(sessionId, session); return session; } catch (error) { await session.close().catch(() => undefined); throw error; } }
  getOpen(sessionId: string): SessionHandle | undefined { return this.#open.get(sessionId); }
  closeOpen(sessionId: string): void { this.#open.delete(sessionId); this.#ephemeral.delete(sessionId); }
  snapshot(session: SessionHandle): RuntimeV2SessionSnapshot { return projectSessionSnapshot({ header: session.header, events: session.journal.events, registry: this.options.registry, rendererAllowlist: this.options.rendererAllowlist }); }
  async inspect(sessionId: string): Promise<RuntimeV2SessionSnapshot> { const open = this.#open.get(sessionId); if (open !== undefined) return this.snapshot(open); const inspection = await this.store.inspect(sessionId); if (inspection.header === null || inspection.validation === null) throw new Error(`Session ${sessionId} is corrupt.`); return projectSessionSnapshot({ header: inspection.header, events: inspection.events, registry: this.options.registry, rendererAllowlist: this.options.rendererAllowlist }); }
  async inspectEvents(sessionId: string): Promise<readonly SessionEventEnvelopeV1[]> { const open = this.#open.get(sessionId); if (open !== undefined) return open.journal.events; const inspection = await this.store.inspect(sessionId); if (inspection.header === null || inspection.validation === null) throw new Error(`Session ${sessionId} is corrupt.`); return inspection.events; }
  async list(): Promise<readonly RuntimeV2SessionListItem[]> { const root = `${this.options.dataRoot}/sessions-v2`; await mkdir(root, { recursive: true }); const names = await readdir(root); const results: RuntimeV2SessionListItem[] = []; for (const sessionId of names.sort()) { try { const snapshot = await this.inspect(sessionId); const inspection = await this.store.inspect(sessionId); if (inspection.header !== null) results.push(Object.freeze({ sessionId, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, workspaceRoot: snapshot.workspaceRoot, profileId: inspection.header.createdWith.profileId, accessState: snapshot.accessState, metadata: snapshot.metadata, lineage: snapshot.lineage })); } catch { /* forensic directories stay out of the normal list */ } } return Object.freeze(results); }
  async export(sessionId: string): Promise<string> { const open = this.#open.get(sessionId); if (open !== undefined && this.#ephemeral.has(sessionId)) return [open.header, ...open.journal.events].map((record) => JSON.stringify(record)).join("\n") + "\n"; const inspection = await this.store.inspect(sessionId); if (inspection.header === null) throw new Error(`Session ${sessionId} has no header.`); return [inspection.header, ...inspection.events].map((record) => JSON.stringify(record)).join("\n") + "\n"; }
  openSessions(): readonly SessionHandle[] { return Object.freeze([...this.#open.values()]); }
  async flushAll(): Promise<void> { for (const session of this.#open.values()) await session.flush(); }
  async closeAll(): Promise<void> {
    const entries = [...this.#open];
    this.#open.clear();
    this.#ephemeral.clear();
    await Promise.all(entries.map(async ([, session]) => {
      if (session.journal.events.at(-1)?.type !== "session/end-seed") {
        await session.append({ type: "session/end-seed", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { sessionId: session.header.sessionId, lastSeq: session.lastSeq }, surface: null });
      }
      await session.flush();
      await session.close();
    }));
  }
}
