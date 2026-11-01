import { HarnessControlError, type AuthorizationDecision, type AuthorizationRequest } from "./contracts.js";
export function checkAuthorization(request: AuthorizationRequest, decision: AuthorizationDecision | null, now: number): asserts decision is AuthorizationDecision {
  if (!decision) throw new HarnessControlError("AUTHORIZATION_DENIED", "Host denied Harness activation");
  for (const key of ["harnessId", "candidateId", "executionDigest", "expectedRevision", "activationId"] as const) {
    if (request[key] !== decision[key]) throw new HarnessControlError("AUTHORIZATION_DENIED", `Authorization binding mismatch: ${key}`);
  }
  if (!decision.actor || !decision.decisionId) throw new HarnessControlError("AUTHORIZATION_DENIED", "Missing Host authorization identity");
  if (!Number.isFinite(decision.expiresAt) || decision.expiresAt <= now) throw new HarnessControlError("AUTHORIZATION_EXPIRED", "Harness authorization expired");
}
