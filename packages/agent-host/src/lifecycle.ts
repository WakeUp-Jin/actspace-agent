import { setTimeout as delay } from "node:timers/promises";
import type { AgentApplicationContract } from "@actspace/agent-service";
import type { TaskSnapshot } from "@actspace/shared/runtime-v2";

/** Runtime-owned operations exposed to Host; no dependency on the Runtime package. */
export interface HostRuntime {
  readonly application: AgentApplicationContract;
  beginDrain(): void;
  waitForOwnedRuns(): Promise<void>;
  backgroundTask(sessionId: string): Promise<boolean>;
  activeSubagents(): number;
  recovery(): { blocked: string; instances: readonly unknown[] };
  subscribeTasks(listener: (snapshot: TaskSnapshot) => void): () => void;
  shutdown(): Promise<unknown>;
}
export type HostState = "ready" | "draining" | "blocked";

export class HostLifecycle {
  #state: HostState;
  #stopping?: Promise<void>;
  #forcing?: Promise<void>;
  #finishing?: Promise<void>;
  #forceRequested = false;
  readonly #forceSignal = new AbortController();
  #signalForce!: () => void;
  readonly #forced = new Promise<void>(resolve => { this.#signalForce = resolve; });
  constructor(private readonly runtime: Omit<HostRuntime, "shutdown">, private readonly options: {
    shutdown(): Promise<unknown>;
    beforeShutdown(): Promise<void>;
    close(): Promise<void>;
    onState(state: HostState): void;
    forceExit?: () => void;
    forceDeadlineMs?: number;
  }) { this.#state = runtime.recovery().blocked ? "blocked" : "ready"; }

  state(): HostState { return this.#state; }
  block(): void {
    if (this.#state === "draining") return;
    this.#state = "blocked";
    this.runtime.beginDrain();
    this.options.onState(this.#state);
  }
  stop(force = false): Promise<void> {
    if (this.#state !== "draining") {
      this.#state = "draining";
      this.runtime.beginDrain();
      this.options.onState(this.#state);
    }
    if (force) {
      this.#forceRequested = true;
      this.#forcing ??= this.#force();
      this.#signalForce();
      this.#forceSignal.abort();
      return this.#forcing;
    }
    return this.#stopping ??= (async () => {
      await Promise.race([this.#drain(), this.#forced]);
      if (this.#forceRequested) return this.#forcing;
      await this.#finish();
    })();
  }
  async #drain(): Promise<void> {
    await this.runtime.waitForOwnedRuns();
    if (this.#forceRequested) return;
    const recovery = this.runtime.recovery();
    if (recovery.blocked && recovery.instances.length === 0) return;
    while (!this.#forceRequested) {
      let busy = this.runtime.activeSubagents() > 0;
      for (const session of await this.runtime.application.listSessions()) {
        if (this.#forceRequested) return;
        busy = await this.runtime.backgroundTask(session.sessionId) || busy;
      }
      if (!busy) return;
      await delay(100, undefined, { signal: this.#forceSignal.signal }).catch(error => { if (!this.#forceRequested) throw error; });
    }
  }
  #finish(): Promise<void> {
    return this.#finishing ??= (async () => {
      const errors: unknown[] = [];
      for (const release of [() => this.options.beforeShutdown(), () => this.options.shutdown(), () => this.options.close()]) {
        try { await release(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, "Host shutdown failed");
    })();
  }
  async #force(): Promise<void> {
    const deadline = setTimeout(() => this.options.forceExit?.(), this.options.forceDeadlineMs ?? 15_000);
    try { await this.#finish(); clearTimeout(deadline); }
    catch (error) { if (!this.options.forceExit) clearTimeout(deadline); throw error; }
  }
  async diagnostics() {
    const diagnostics: { sessionId?: string; component: string; reason?: string }[] = [];
    const blocked = this.runtime.recovery().blocked;
    if (blocked) diagnostics.push({ component: "harness-recovery", reason: blocked });
    let sessions: Awaited<ReturnType<AgentApplicationContract["listSessions"]>> = [];
    try { sessions = await this.runtime.application.listSessions(); }
    catch { diagnostics.push({ component: "session-list" }); }
    const waiting: { sessionId: string; runs: string[]; background: boolean | null }[] = [];
    for (const session of sessions) {
      let runs: string[] = [], background: boolean | null = null;
      try {
        const snapshot = await this.runtime.application.taskCommand({ sessionId: session.sessionId, op: "snapshot" });
        runs = snapshot.snapshot.runs.filter(run => run.state === "running").map(run => run.runId);
      } catch { diagnostics.push({ sessionId: session.sessionId, component: "tasks" }); }
      try { background = await this.runtime.backgroundTask(session.sessionId); }
      catch { diagnostics.push({ sessionId: session.sessionId, component: "shell-capability" }); }
      if (runs.length || background !== false) waiting.push({ sessionId: session.sessionId, runs, background });
    }
    return { subagents: this.runtime.activeSubagents(), waiting, diagnostics };
  }
}

/** One in-flight maintenance pass; stopping waits for it before storage is released. */
export function startUploadMaintenance(cleanup: () => Promise<unknown>, onFailure: (error: unknown) => void, intervalMs = 60_000) {
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (pending) return;
    pending = Promise.resolve().then(cleanup).then(() => undefined, onFailure).finally(() => { pending = undefined; });
  }, intervalMs);
  timer.unref();
  return async () => { clearInterval(timer); await pending; };
}
