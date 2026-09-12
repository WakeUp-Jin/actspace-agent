import { expect, it } from "vitest";
import { applyCustomModelReasoning, resolveCustomModelReasoning, validateCustomModelReasoning } from "../custom-model-reasoning";
import { BUILTIN_MODEL_LIST } from "../model-config";

it("matches exact catalog IDs without guessing efforts from a reasoning boolean", () => {
  expect(resolveCustomModelReasoning("gpt-6-astra")).toMatchObject({ support: "supported", efforts: [] });
  expect(resolveCustomModelReasoning("gpt-6-astra-relay-alias")).toMatchObject({ support: "unknown", efforts: [] });
  expect(resolveCustomModelReasoning("alias", { mode: "auto", referenceModel: "gpt-6-astra" })).toMatchObject({ support: "supported", efforts: [] });
});
it("preserves manual unknown and unsupported without enabling effort", () => {
  for (const support of ["unknown", "unsupported"] as const) {
    const result = applyCustomModelReasoning(BUILTIN_MODEL_LIST[0], { mode: "manual", support, efforts: [], allowOff: false });
    expect(result.reasoningConfig?.support).toBe(support);
    expect(result.capabilities.reasoning).toBe(false);
  }
});
it("rejects invalid defaults and malformed IPC config", () => {
  for (const input of [{ mode: "manual", support: "supported", efforts: ["high"], defaultEffort: "low", allowOff: true }, { mode: "manual", support: "unsupported", efforts: ["high"], allowOff: true }, { mode: "manual", support: "supported", efforts: ["secret"], allowOff: true }]) expect(() => validateCustomModelReasoning(input)).toThrow();
});
