import { randomUUID } from "node:crypto";
import { scopeContext, type AgentScope } from "@actspace/core-scope";
import type { CordisContext } from "@actspace/cordis-adapter";
import { mountHarness, type HarnessMount, type HarnessMountRequest } from "./harness-mount.js";

export type HarnessErrorCode = "CLOSED" | "NO_CURRENT" | "BASELINE_CONFLICT" | "INVALID_CANDIDATE" | "PREPARE_FAILED";
export class HarnessError extends Error {
  constructor(readonly code: HarnessErrorCode, readonly harnessId: string, message: string, options?: ErrorOptions) { super(message, options); this.name = "HarnessError"; }
}
export interface HarnessCandidate {
  readonly harnessId: string;
  readonly generationId: string;
  readonly expectedRevision: number;
  readonly executionDigest: string;
}
export interface HarnessLease {
  readonly harnessId: string;
  readonly generationId: string;
  readonly revision: number;
  readonly executionDigest: string;
  readonly scope: AgentScope;
  readonly context: CordisContext;
  getService<T>(name: string): T | undefined;
  release(): Promise<void>;
}
type Generation = {
  candidate: HarnessCandidate; mount: HarnessMount;
  state: "ready" | "current" | "retired" | "disposed" | "cleanup-failed";
  users: number; cleanup?: Promise<void>; error?: unknown;
};

/** Selection and ownership only: task admission, cancellation and persistence belong to the caller. */
export class HarnessGenerations {
  readonly #records = new Set<Generation>();
  readonly #ownedRecords = new WeakMap<HarnessCandidate, Generation>();
  readonly #current = new Map<string, { record: Generation; revision: number }>();
  readonly #preparing = new Set<Promise<HarnessCandidate>>();
  #closed = false;
  #closing?: Promise<void>;
  readonly #waiters = new Set<() => void>();
  constructor(private readonly parent: CordisContext) {}

  prepare(harnessId: string, expectedRevision: number, request: HarnessMountRequest): Promise<HarnessCandidate> {
    this.#assertOpen(harnessId);
    if (!harnessId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new HarnessError("INVALID_CANDIDATE", harnessId, "Invalid Harness identity or revision");
    const promise = (async () => {
      let mount: HarnessMount;
      try { mount = await mountHarness(this.parent, request); }
      catch (cause) { throw new HarnessError("PREPARE_FAILED", harnessId, `Harness preparation failed: ${harnessId}`, { cause }); }
      const candidate = Object.freeze({ harnessId, expectedRevision, generationId: randomUUID(), executionDigest: mount.executionDigest });
      const record: Generation = { candidate, mount, state: "ready", users: 0 };
      this.#records.add(record);
      this.#ownedRecords.set(candidate, record);
      if (this.#closed) {
        record.state = "retired";
        try { await this.#collect(record); }
        catch (cause) { throw new HarnessError("CLOSED", harnessId, "Harness closed during preparation; cleanup failed", { cause }); }
        throw new HarnessError("CLOSED", harnessId, "Harness closed during preparation");
      }
      return candidate;
    })();
    this.#preparing.add(promise);
    void promise.then(() => { this.#preparing.delete(promise); this.#notify(); }, () => { this.#preparing.delete(promise); this.#notify(); });
    return promise;
  }

  /** This synchronous commit is the ordering point shared with acquire(). */
  activate(candidate: HarnessCandidate): { readonly revision: number; readonly generationId: string } {
    this.#assertOpen(candidate.harnessId);
    const record = this.#owned(candidate);
    if (record.state !== "ready") throw new HarnessError("INVALID_CANDIDATE", candidate.harnessId, "Candidate is already consumed");
    const previous = this.#current.get(candidate.harnessId);
    if ((previous?.revision ?? 0) !== candidate.expectedRevision) throw new HarnessError("BASELINE_CONFLICT", candidate.harnessId, "Harness baseline changed; discard and prepare again");
    const revision = candidate.expectedRevision + 1;
    record.state = "current";
    this.#current.set(candidate.harnessId, { record, revision });
    if (previous) { previous.record.state = "retired"; this.#collect(previous.record); }
    return Object.freeze({ revision, generationId: candidate.generationId });
  }

  /** Restore durable selection before admitting any leases. */
  restore(candidate: HarnessCandidate, revision: number): void {
    this.#assertOpen(candidate.harnessId);
    const record = this.#owned(candidate);
    if (this.#current.has(candidate.harnessId) || record.state !== "ready" || !Number.isSafeInteger(revision) || revision < 1) throw new HarnessError("INVALID_CANDIDATE", candidate.harnessId, "Invalid restored selection");
    record.state = "current";
    this.#current.set(candidate.harnessId, { record, revision });
  }

  acquire(harnessId: string): HarnessLease {
    this.#assertOpen(harnessId);
    const selection = this.#current.get(harnessId);
    if (!selection) throw new HarnessError("NO_CURRENT", harnessId, "No active Harness composition");
    const { record, revision } = selection;
    const scope = record.mount.scope.child(`lease:${randomUUID()}`);
    const context = scopeContext(record.mount.context, scope.scopeKey, scope.disposer);
    record.users++;
    let releasing: Promise<void> | undefined;
    return Object.freeze({ harnessId, generationId: record.candidate.generationId, executionDigest: record.candidate.executionDigest, revision, scope, context,
      getService: <T>(name: string): T | undefined => { scope.assertActive(); return record.mount.getService<T>(name); },
      release: () => releasing ??= (async () => {
        const errors: unknown[] = [];
        try { await scope.dispose(); } catch (error) { errors.push(error); }
        record.users--;
        try { await this.#collect(record); } catch (error) { errors.push(error); }
        this.#notify();
        if (errors.length) throw new AggregateError(errors, "Harness lease cleanup failed");
      })(),
    });
  }

  discard(candidate: HarnessCandidate): Promise<void> {
    const record = this.#owned(candidate);
    if (record.state === "current") throw new HarnessError("INVALID_CANDIDATE", candidate.harnessId, "Cannot discard a current composition");
    if (record.state === "ready") record.state = "retired";
    return this.#collect(record) ?? Promise.resolve();
  }

  inspect(): readonly { harnessId: string; generationId: string; state: Generation["state"]; users: number; error?: unknown }[] {
    return [...this.#records.values()].map(record => ({ harnessId: record.candidate.harnessId, generationId: record.candidate.generationId, state: record.state, users: record.users, ...(record.error === undefined ? {} : { error: record.error }) }));
  }

  /** Stop admission, then wait for holders; never cancels a task or forcibly releases its lease. */
  close(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    for (const record of this.#records.values()) if (record.state === "current" || record.state === "ready") { record.state = "retired"; this.#collect(record); }
    this.#current.clear();
    return this.#closing = (async () => {
      await Promise.allSettled([...this.#preparing]);
      while ([...this.#records.values()].some(record => record.users > 0)) await new Promise<void>(resolve => this.#waiters.add(resolve));
      await Promise.allSettled([...this.#records.values()].map(record => this.#collect(record)));
      const errors = [...this.#records.values()].filter(record => record.state === "cleanup-failed").map(record => record.error);
      if (errors.length) throw new AggregateError(errors, "Harness manager cleanup failed");
    })();
  }
  #collect(record: Generation): Promise<void> | undefined {
    if (record.cleanup) return record.cleanup;
    if (record.state !== "retired" || record.users !== 0) return;
    record.cleanup = Promise.resolve().then(() => record.mount.dispose());
    // Keep rejection observed even when activation triggers background collection.
    void record.cleanup.then(() => { record.state = "disposed"; this.#records.delete(record); this.#notify(); }, error => { record.state = "cleanup-failed"; record.error = error; this.#notify(); });
    return record.cleanup;
  }
  #owned(candidate: HarnessCandidate): Generation {
    const record = this.#ownedRecords.get(candidate);
    if (!record) throw new HarnessError("INVALID_CANDIDATE", candidate.harnessId, "Candidate belongs to another manager");
    return record;
  }
  #assertOpen(id: string): void { if (this.#closed) throw new HarnessError("CLOSED", id, "Harness manager is closed"); }
  #notify(): void { for (const wake of this.#waiters) wake(); this.#waiters.clear(); }
}
