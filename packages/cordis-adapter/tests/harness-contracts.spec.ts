import { expect, it } from "vitest";
import { validateHarnessContracts, type HarnessBehaviorContracts } from "../src/harness-contracts.js";
const contracts: HarnessBehaviorContracts = { services: { provides: [{ id: "reader", version: 1 }], requires: [] }, events: { provides: [{ id: "before", version: 1, mode: "waterfall" }], requires: [] } };
it("validates versions, modes and optional fallback declarations", () => {
  expect(() => validateHarnessContracts(contracts)).not.toThrow();
  expect(() => validateHarnessContracts({ ...contracts, events: { provides: [{ id: "before", version: 1 }], requires: [] } })).toThrow("mode");
  expect(() => validateHarnessContracts({ ...contracts, services: { provides: [], requires: [{ id: "reader", version: 0 }] } })).toThrow("Invalid");
  expect(() => validateHarnessContracts({ ...contracts, services: { provides: [], requires: [{ id: "reader", version: 1, optional: true }] } })).toThrow("fallback");
});
