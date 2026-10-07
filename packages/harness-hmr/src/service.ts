import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HarnessControl } from "@actspace/harness-control";

export type SessionHarnessBinding = { schemaVersion: 1; sessionId: string; revision: number; harnessId: string; selectionRevision: number; executionDigest: string };
type Intent = { schemaVersion: 1; sessionId: string; changeId: string; candidateId: string; harnessId: string; executionDigest: string; expectedBindingRevision: number };
export type HarnessHmrOptions = { dataRoot: string; control: HarnessControl };

/** Host-owned commit coordinator. Never starts, stops or resumes a Run. */
export class HarnessHmr {
  readonly #gates = new Map<string, Promise<unknown>>();
  #closed = false;
  constructor(private readonly options: HarnessHmrOptions) {}
  branchId(sessionId: string): string { return `session-${hash(sessionId)}`; }
  async inspect(sessionId: string): Promise<SessionHarnessBinding> {
    return this.#exclusive(sessionId, () => this.#binding(sessionId));
  }
  acquire(sessionId: string, signal?: AbortSignal) {
    return this.#exclusive(sessionId, async () => {
      signal?.throwIfAborted();
      const binding = await this.#binding(sessionId);
      return this.options.control.acquire(binding.harnessId, signal);
    });
  }
  apply(input: Intent, context: unknown, signal?: AbortSignal) {
    return this.#exclusive(input.sessionId, async () => {
      signal?.throwIfAborted();
      const binding = await this.#binding(input.sessionId);
      const prior = this.options.control.inspect(input.harnessId).history.find(r => r.activationId === input.changeId);
      if (prior) {
        if (prior.executionDigest !== input.executionDigest || prior.requestDigest !== digestCandidate(input.candidateId)) throw new Error("HMR request identity conflict");
        if (binding.harnessId === input.harnessId && binding.executionDigest === input.executionDigest) return binding;
        throw new Error("This change was committed but is no longer the selected version");
      }
      if (input.harnessId !== this.branchId(input.sessionId)) throw new Error("HMR cannot mutate another session or main");
      if (binding.revision !== input.expectedBindingRevision) throw new Error("Session binding changed; prepare again");
      await atomicJson(this.#path(input.sessionId, "intent"), input);
      try {
        signal?.throwIfAborted();
        await this.options.control.activate(input.changeId, input.candidateId, context);
      } catch (error) {
        // Keep a durable intent if publication succeeded before an observer/storage failure.
        if (!this.options.control.inspect(input.harnessId).history.some(r => r.activationId === input.changeId)) await rm(this.#path(input.sessionId, "intent"), { force: true });
        throw error;
      }
      // A stop after commit cannot erase the fact or leave future admission half-bound.
      return this.#binding(input.sessionId);
    });
  }
  async close(): Promise<void> { this.#closed = true; await Promise.allSettled(this.#gates.values()); }
  async #binding(sessionId: string): Promise<SessionHarnessBinding> {
    const path = this.#path(sessionId, "binding");
    let binding = await readJson<SessionHarnessBinding>(path);
    if (binding && (binding.schemaVersion !== 1 || binding.sessionId !== sessionId || binding.harnessId !== this.branchId(sessionId) || !Number.isSafeInteger(binding.revision) || binding.revision < 1 || !Number.isSafeInteger(binding.selectionRevision) || binding.selectionRevision < 1 || typeof binding.executionDigest !== "string" || !binding.executionDigest)) throw new Error("Invalid session Harness binding");
    const intent = await readJson<Intent>(this.#path(sessionId, "intent"));
    if (intent) {
      if (intent.schemaVersion !== 1 || intent.sessionId !== sessionId || intent.harnessId !== this.branchId(sessionId) || !Number.isSafeInteger(intent.expectedBindingRevision) || intent.expectedBindingRevision < 0 || !intent.candidateId || !intent.changeId || !intent.executionDigest) throw new Error("Invalid Harness commit intent");
      const record = this.options.control.inspect(intent.harnessId).history.find(r => r.activationId === intent.changeId);
      if (record) {
        if (record.executionDigest !== intent.executionDigest || record.requestDigest !== digestCandidate(intent.candidateId)) throw new Error("Harness intent does not match committed selection");
        if ((binding?.revision ?? 0) === intent.expectedBindingRevision) {
          binding = { schemaVersion: 1, sessionId, revision: intent.expectedBindingRevision + 1, harnessId: record.harnessId, selectionRevision: record.revision, executionDigest: record.executionDigest };
          await atomicJson(path, binding);
        } else if (binding?.harnessId !== record.harnessId || binding.selectionRevision !== record.revision || binding.executionDigest !== record.executionDigest || binding.revision !== intent.expectedBindingRevision + 1) throw new Error("Harness binding recovery conflict");
      }
      await rm(this.#path(sessionId, "intent"), { force: true });
    }
    const current = this.options.control.inspect(binding?.harnessId ?? "main");
    if (current.blocked || !current.current) throw new Error(`Harness recovery blocked: ${current.blocked || "missing selection"}`);
    if (!binding) return { schemaVersion: 1, sessionId, revision: 0, harnessId: "main", selectionRevision: current.current.revision, executionDigest: current.current.executionDigest };
    if (binding.selectionRevision !== current.current.revision || binding.executionDigest !== current.current.executionDigest) throw new Error("Harness binding and selection differ");
    return binding;
  }
  #path(sessionId: string, kind: string): string { if (!sessionId) throw new Error("Session identity required"); return join(this.options.dataRoot, "harness-sessions", `${hash(sessionId)}.${kind}.json`); }
  #exclusive<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new Error("HMR is closed"));
    const next = (this.#gates.get(sessionId) ?? Promise.resolve()).then(fn);
    const settled = next.catch(() => undefined);
    this.#gates.set(sessionId, settled);
    void settled.then(() => { if (this.#gates.get(sessionId) === settled) this.#gates.delete(sessionId); });
    return next;
  }
}
export async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(JSON.stringify(value) + "\n"); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await rm(temporary, { force: true }); }
}
export async function readJson<T>(path: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function digestCandidate(candidateId: string): string { return hash(JSON.stringify({ candidateId })); }
