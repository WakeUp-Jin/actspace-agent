import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { HarnessGenerations, type HarnessCandidate, type HarnessLease, type HarnessMountRequest } from "@actspace/boot";
import { resolveHarnessPatch, harnessOptionalFallbacks } from "@actspace/composition";
import { HarnessControlError, type AuthorizationRequest, type HarnessControlOptions, type HarnessPatchRequest, type SelectionDescription, type SelectionRecord } from "./contracts.js";
import { checkAuthorization } from "./authorization.js";
import { describeMount, loadArtifact, validateCandidate } from "./candidate.js";
import { SelectionStore, selectionHash } from "./selection-store.js";
type Candidate = { readonly handle: HarnessCandidate; readonly description: SelectionDescription };
/** Host-owned coordinator. The raw generation manager never escapes this boundary. */
export class HarnessControl {
  readonly #manager: HarnessGenerations;
  readonly #store: SelectionStore;
  readonly #candidates = new Map<string, Candidate>();
  readonly #blocked = new Map<string, unknown>();
  #gate: Promise<unknown> = Promise.resolve();
  #closing = false;
  #close?: Promise<void>;
  constructor(private readonly options: HarnessControlOptions) {
    this.#manager = new HarnessGenerations(options.context);
    this.#store = new SelectionStore(join(options.dataRoot, "harness-state"), options.runtimeId);
  }
  async initialize(): Promise<void> {
    try {
      await this.#store.open();
      for (const id of new Set(this.#store.records.map(r => r.harnessId))) {
        const record = this.#store.latest(id)!;
        try {
          const request = await this.#load(record.description);
          await validateCandidate(request, this.options.compatibility, this.options.sharedServices);
          const candidate = await this.#manager.prepare(id, record.previousRevision, request);
          if (candidate.executionDigest !== record.executionDigest) { await this.#manager.discard(candidate); throw new Error("Recovered execution digest differs"); }
          this.#manager.restore(candidate, record.revision);
        } catch (error) { this.#blocked.set(id, error); this.#diagnostic(error); }
      }
      if (!this.#store.latest("main")) {
        const request = this.#bindHost(await this.options.builtin());
        await validateCandidate(request, this.options.compatibility, this.options.sharedServices);
        const handle = await this.#manager.prepare("main", 0, request);
        const record = this.#record(`bootstrap:${randomUUID()}`, "bootstrap", { handle, description: describeMount(request) }, { actor: "Host", decisionId: "trusted-bootstrap" });
        await this.#store.append(record);
        this.#manager.activate(handle);
      }
    } catch (error) { this.#blocked.set("*", error); this.#diagnostic(error); }
  }
  inspect(harnessId = "main") {
    return structuredClone({ current: this.#store.latest(harnessId), history: this.#store.records.filter(r => r.harnessId === harnessId),
      candidates: [...this.#candidates].filter(([, c]) => c.handle.harnessId === harnessId).map(([candidateId, c]) => ({ candidateId, ...c.handle })),
      blocked: String(this.#store.failure ?? this.#blocked.get("*") ?? this.#blocked.get(harnessId) ?? ""), instances: this.#manager.inspect() });
  }
  async artifactUsage() {
    const ids = (await readdir(this.options.artifactRoot)).filter(id => /^sha256-[a-f0-9]{64}$/.test(id)).sort();
    return Promise.all(ids.map(async artifactId => {
      try {
        const artifact = await loadArtifact(this.options.artifactRoot, artifactId);
        const sizes = await Promise.all(["artifact.json", ...artifact.manifest.files.map(file => file.path)].map(file => stat(join(artifact.root, file))));
        return { artifactId, fileCount: sizes.length, bytes: sizes.reduce((total, file) => total + file.size, 0) };
      } catch (error) { return { artifactId, error: String(error) }; }
    }));
  }
  async prepare(input: HarnessPatchRequest) {
    this.#assertOpen();
    input = structuredClone(input);
    const current = this.#baseline(input.harnessId, input.expectedRevision);
    if (!current || current.executionDigest !== input.baseExecutionDigest) throw new HarnessControlError("BASELINE_CONFLICT", "Harness baseline digest changed");
    const all = await Promise.all([...new Set([...current.description.artifactIds, ...input.artifactIds])].map(id => loadArtifact(this.options.artifactRoot, id)));
    let composition;
    try { composition = resolveHarnessPatch(current.description.composition, input.patch, all); }
    catch (cause) { throw new HarnessControlError("INVALID_PATCH", "Cannot resolve Harness patch", { cause }); }
    const selected = all.filter(a => composition.entries.some(e => e.artifactId === a.artifactId));
    return this.#prepare(input.harnessId, input.expectedRevision, { composition, artifacts: new Map(selected.map(a => [a.manifest.plugin.pluginId, a])), sharedServices: current.description.sharedServices });
  }
  async prepareRollback(harnessId: string, expectedRevision: number, historicalDigest: string) {
    this.#baseline(harnessId, expectedRevision);
    const old = [...this.#store.records].reverse().find(r => r.harnessId === harnessId && r.executionDigest === historicalDigest);
    if (!old) throw new HarnessControlError("CANDIDATE_NOT_READY", "Historical composition not found");
    return this.#prepare(harnessId, expectedRevision, await this.#load(old.description));
  }
  async #prepare(harnessId: string, revision: number, request: HarnessMountRequest) {
    this.#assertOpen();
    request = this.#bindHost(request);
    await validateCandidate(request, this.options.compatibility, this.options.sharedServices);
    const handle = await this.#manager.prepare(harnessId, revision, request);
    if (this.#closing) { await this.#manager.discard(handle); this.#assertOpen(); }
    const candidateId = handle.generationId;
    this.#candidates.set(candidateId, { handle, description: describeMount(request) });
    return Object.freeze({ candidateId, ...handle, report: { fallbacks: harnessOptionalFallbacks(request.composition, this.options.compatibility), entryOrder: request.composition.entries.filter(e => e.enabled && e.state !== "skipped").map(e => e.entryId) } });
  }
  activate(activationId: string, candidateId: string, context?: unknown): Promise<SelectionRecord> {
    return this.#activate(activationId, candidateId, context, selectionHash({ candidateId }));
  }
  async #activate(activationId: string, candidateId: string, context: unknown, requestDigest: string): Promise<SelectionRecord> {
    this.#assertOpen();
    const previous = this.#store.records.find(r => r.activationId === activationId);
    if (previous) {
      if (previous.requestDigest !== requestDigest) throw new HarnessControlError("REQUEST_CONFLICT", "Activation identity reused for another candidate");
      return structuredClone(previous);
    }
    const candidate = this.#candidate(candidateId);
    if (!activationId) throw new HarnessControlError("REQUEST_CONFLICT", "Activation identity required");
    if (!this.options.authorize) throw new HarnessControlError("AUTHORIZATION_REQUIRED", "Host activation authorizer is not configured");
    const request: AuthorizationRequest = { activationId, candidateId, harnessId: candidate.handle.harnessId, executionDigest: candidate.handle.executionDigest, expectedRevision: candidate.handle.expectedRevision };
    const decision = await this.options.authorize(Object.freeze(request), context);
    return this.#exclusive(async () => {
      const repeated = this.#store.records.find(r => r.activationId === activationId);
      if (repeated) {
        if (repeated.requestDigest !== requestDigest) throw new HarnessControlError("REQUEST_CONFLICT", "Activation identity conflict");
        return structuredClone(repeated);
      }
      this.#candidate(candidateId);
      this.#baseline(request.harnessId, request.expectedRevision);
      checkAuthorization(request, decision, this.options.now?.() ?? Date.now());
      const record = this.#record(activationId, requestDigest, candidate, decision);
      try {
        await this.#store.append(record);
        // No await after persistence: acquire/discard/close share this gate.
        const current = this.#manager.inspect().some(r => r.harnessId === request.harnessId && r.state === "current");
        if (current) this.#manager.activate(candidate.handle);
        else this.#manager.restore(candidate.handle, record.revision);
        this.#blocked.delete(request.harnessId);
        this.#candidates.delete(candidateId);
      } catch (error) { this.#blocked.set(request.harnessId, error); throw error; }
      try { this.options.onSelection?.(structuredClone(record)); } catch (error) { this.#diagnostic(error); }
      return structuredClone(record);
    });
  }
  discard(candidateId: string): Promise<void> {
    return this.#exclusive(async () => { const candidate = this.#candidate(candidateId); this.#candidates.delete(candidateId); return candidate; })
      .then(candidate => this.#manager.discard(candidate.handle));
  }
  async recoverBuiltin(activationId: string, expectedRevision: number, context?: unknown): Promise<SelectionRecord> {
    const repeated = this.#store.records.find(r => r.activationId === activationId);
    if (repeated) {
      if (repeated.harnessId !== "main" || repeated.previousRevision !== expectedRevision || !repeated.requestDigest.startsWith("recover:")) throw new HarnessControlError("REQUEST_CONFLICT", "Recovery identity conflict");
      return structuredClone(repeated);
    }
    this.#baseline("main", expectedRevision);
    const candidate = await this.#prepare("main", expectedRevision, await this.options.builtin());
    try { return await this.#activate(activationId, candidate.candidateId, context, `recover:${selectionHash({ expectedRevision })}`); }
    finally {
      if (this.#candidates.has(candidate.candidateId)) {
        try { await this.discard(candidate.candidateId); } catch (error) { this.#diagnostic(error); }
      }
    }
  }
  async acquire(harnessId: string, signal?: AbortSignal): Promise<HarnessLease> {
    signal?.throwIfAborted();
    const pending = this.#exclusive(async () => {
      signal?.throwIfAborted();
      const blocked = this.#blocked.get("*") ?? this.#blocked.get(harnessId);
      if (blocked) throw new HarnessControlError("RECOVERY_BLOCKED", "Harness execution is blocked", { cause: blocked });
      await this.#store.assertOwned();
      signal?.throwIfAborted();
      return this.#manager.acquire(harnessId);
    });
    if (!signal) return pending;
    return new Promise<HarnessLease>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      void pending.then(async lease => {
        if (signal.aborted) { try { await lease.release(); } catch (error) { this.#diagnostic(error); } }
        else resolve(lease);
      }, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
  close(): Promise<void> {
    if (this.#close) return this.#close;
    this.#closing = true;
    return this.#close = (async () => { await this.#gate; try { await this.#manager.close(); } finally { await this.#store.close(); } })();
  }
  #exclusive<T>(fn: () => Promise<T>): Promise<T> {
    this.#assertOpen();
    const next = this.#gate.then(fn);
    this.#gate = next.catch(() => undefined);
    return next;
  }
  #candidate(id: string): Candidate {
    const candidate = this.#candidates.get(id);
    if (!candidate) throw new HarnessControlError("CANDIDATE_NOT_READY", "Candidate is unavailable");
    return candidate;
  }
  #baseline(id: string, revision: number): SelectionRecord | undefined {
    const current = this.#store.latest(id);
    if ((current?.revision ?? 0) !== revision) throw new HarnessControlError("BASELINE_CONFLICT", "Harness selection changed");
    return current;
  }
  #record(activationId: string, requestDigest: string, candidate: Candidate, authorization: { actor: string; decisionId: string }): SelectionRecord {
    return { schemaVersion: 1, activationId, requestDigest, harnessId: candidate.handle.harnessId, previousRevision: candidate.handle.expectedRevision,
      revision: candidate.handle.expectedRevision + 1, executionDigest: candidate.handle.executionDigest, description: candidate.description,
      authorization: { actor: authorization.actor, decisionId: authorization.decisionId }, timestamp: new Date(this.options.now?.() ?? Date.now()).toISOString() };
  }
  async #load(description: SelectionDescription): Promise<HarnessMountRequest> {
    if (description.hostContractDigest !== selectionHash(this.options.compatibility)) throw new HarnessControlError("RESTART_REQUIRED", "Persisted Host contract fingerprint differs; prepare a compatible selection");
    const artifacts = await Promise.all(description.artifactIds.map(id => loadArtifact(this.options.artifactRoot, id)));
    return { hostContractDigest: description.hostContractDigest, composition: description.composition, artifacts: new Map(artifacts.map(a => [a.manifest.plugin.pluginId, a])), sharedServices: description.sharedServices };
  }
  #bindHost(request: HarnessMountRequest): HarnessMountRequest { return { ...request, hostContractDigest: selectionHash(this.options.compatibility) }; }
  #assertOpen(): void { if (this.#closing) throw new HarnessControlError("CLOSED", "Harness control is closed"); }
  #diagnostic(error: unknown): void { try { this.options.onDiagnostic?.(error); } catch { /* diagnostic observers cannot change selection */ } }
}
