import { expect, it } from "vitest";
import { sandboxStatusDiagnostic } from "./sandbox-status.js";

it("reports the backend as info and every degraded state as a warning", () => {
  expect(sandboxStatusDiagnostic({ available: true, isolation: "sandboxed", backend: { id: "nono", version: "0.80.0" }, reasons: [] })).toMatchObject({ severity: "info", code: "SANDBOX_STATUS", message: "Tool sandbox: nono 0.80.0." });
  expect(sandboxStatusDiagnostic({ available: false, isolation: "sandboxed", reasons: ["nono: missing.", "seatbelt: not macOS."] })).toMatchObject({ severity: "warning", message: "Tool sandbox unavailable; Bash requires approval. nono: missing. seatbelt: not macOS." });
  expect(sandboxStatusDiagnostic({ available: true, isolation: "inherited", reasons: [] })).toMatchObject({ severity: "warning", details: { isolation: "inherited" } });
  expect(sandboxStatusDiagnostic(undefined)).toMatchObject({ severity: "warning", message: expect.stringContaining("not loaded") });
});
