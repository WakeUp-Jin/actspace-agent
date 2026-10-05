import { randomUUID } from "node:crypto";
import type { RuntimeV2RestartState, RuntimeV2RuntimeState, RuntimeV2State } from "@actspace/shared/runtime-v2";

export class RuntimeStateController {
  readonly runtimeInstanceId = randomUUID();
  #state: RuntimeV2State = "booting";
  #accepting = false;
  #restart: RuntimeV2RestartState = Object.freeze({ required: false, reasons: Object.freeze([]), changedSources: Object.freeze([]), candidateDigest: null });
  ready(): void { if (this.#state !== "booting") throw new Error("Runtime can only become ready after booting."); this.#state = "ready"; this.#accepting = true; }
  quiesce(): void { if (this.#state === "disposed") return; this.#state = "quiescing"; this.#accepting = false; }
  disposed(): void { this.#state = "disposed"; this.#accepting = false; }
  requestRestart(reason: string, source: string, candidateDigest?: string): void { this.#restart = Object.freeze({ required: true, reasons: Object.freeze([...new Set([...this.#restart.reasons, reason])]), changedSources: Object.freeze([...new Set([...this.#restart.changedSources, source])]), candidateDigest: candidateDigest ?? this.#restart.candidateDigest }); }
  view(): RuntimeV2RuntimeState { return Object.freeze({ state: this.#state, runtimeInstanceId: this.runtimeInstanceId, acceptingWork: this.#accepting, restart: this.#restart }); }
}
