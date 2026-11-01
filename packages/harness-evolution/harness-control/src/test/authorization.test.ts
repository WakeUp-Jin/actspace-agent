import { expect, it } from "vitest";
import { checkAuthorization } from "../authorization.js";
const request = { activationId: "a", harnessId: "main", candidateId: "c", executionDigest: "d", expectedRevision: 1 };
const decision = { ...request, actor: "host", decisionId: "approved", expiresAt: 100 };
it("requires Host decision bound to every activation field", () => {
  expect(() => checkAuthorization(request, null, 0)).toThrow("denied");
  for (const field of ["activationId", "harnessId", "candidateId", "executionDigest"] as const) expect(() => checkAuthorization(request, { ...decision, [field]: "other" }, 0)).toThrow("mismatch");
  expect(() => checkAuthorization(request, { ...decision, expectedRevision: 2 }, 0)).toThrow("mismatch");
  expect(() => checkAuthorization(request, decision, 100)).toThrow("expired");
  expect(() => checkAuthorization(request, decision, 99)).not.toThrow();
});
