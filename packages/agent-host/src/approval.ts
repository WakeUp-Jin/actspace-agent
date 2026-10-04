import type { ApprovalDecision, ApprovalRequest } from "@actspace/shared/runtime-v2";
import { HostError } from "@actspace/shared/host-protocol";
type Settled = { request: ApprovalRequest; decision: ApprovalDecision };
type Pending = { request: ApprovalRequest; settle: (decision: ApprovalDecision) => void };
/** Host owns approval waits; a device disconnect never settles them. */
export class HostApprovalBroker {
  readonly #pending = new Map<string, Pending>();
  readonly #listeners = new Set<(sessionId: string, settled?: Settled) => void>();
  subscribe(listener: (sessionId: string, settled?: Settled) => void): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  list(sessionId?: string): readonly ApprovalRequest[] { return [...this.#pending.values()].map(value => value.request).filter(request => sessionId === undefined || request.sessionId === sessionId); }
  #emit(sessionId: string, settled?: Settled) { for (const listener of this.#listeners) { try { listener(sessionId, settled); } catch { /* observational */ } } }
  requestApproval(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision> {
    if (this.#pending.has(request.requestId)) return Promise.reject(new Error("Duplicate approval request"));
    const expires = Date.parse(request.expiresAt);
    if (!Number.isFinite(expires)) return Promise.reject(new Error("Invalid approval expiry"));
    const denied = (code: "aborted" | "timeout"): ApprovalDecision => ({ requestId: request.requestId, kind: "deny", code, decidedAt: new Date().toISOString() });
    if (signal.aborted) return Promise.resolve(denied("aborted"));
    if (expires <= Date.now()) return Promise.resolve(denied("timeout"));
    return new Promise(resolve => {
      const settle = (decision: ApprovalDecision) => {
        if (!this.#pending.delete(request.requestId)) return;
        clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(decision); this.#emit(request.sessionId, { request, decision });
      };
      const abort = () => settle(denied("aborted"));
      const timer = setTimeout(() => settle(denied("timeout")), Math.min(expires - Date.now(), 2_147_483_647));
      this.#pending.set(request.requestId, { request, settle });
      signal.addEventListener("abort", abort, { once: true });
      this.#emit(request.sessionId);
    });
  }
  decide(sessionId: string, requestId: string, kind: "once" | "session" | "deny", suggestionId?: string): void {
    const pending = this.#pending.get(requestId);
    if (!pending || pending.request.sessionId !== sessionId) throw new HostError("CONFLICT", "Approval already settled or unavailable");
    const { request, settle } = pending;
    if (Date.parse(request.expiresAt) <= Date.now()) {
      settle({ requestId, kind: "deny", code: "timeout", decidedAt: new Date().toISOString() });
      throw new HostError("CONFLICT", "Approval expired");
    }
    if (kind === "session" && (!suggestionId || !request.grantSuggestions.some(item => item.suggestionId === suggestionId))) throw new TypeError("Invalid grant suggestion");
    if (kind !== "deny" && !request.supportedLifetimes.includes(kind)) throw new TypeError("Unsupported approval lifetime");
    const decidedAt = new Date().toISOString();
    settle(kind === "deny" ? { requestId, kind, code: "user-denied", decidedAt } : kind === "session" ? { requestId, kind, suggestionId: suggestionId!, decidedAt } : { requestId, kind, decidedAt });
  }
}
